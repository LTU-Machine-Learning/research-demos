import os, time, threading, queue, signal
import cv2
import av
import torch
import numpy as np
from flask import Flask, Response
app = Flask(__name__)

from ultralytics import YOLO

RTSP_URL = os.environ.get("RTSP_URL", "rtsp://mediamtx:8554/cam")
AV_OPEN_OPTS = {"rtsp_transport": "tcp", "stimeout": "5000000"}  # force TCP
IMG_SIZE = int(os.environ.get("IMG_SIZE", "640"))
CONF = float(os.environ.get("CONF", "0.25"))
IOU  = float(os.environ.get("IOU", "0.50"))
MAX_DET = int(os.environ.get("MAX_DET", "100"))
JPEG_QUALITY = int(os.environ.get("JPEG_QUALITY", "80"))
DRAW_LABELS = False  # pose: often cleaner without labels

SKELETON = [
    (5, 6),      # shoulders
    (5, 7), (7, 9),      # left arm
    (6, 8), (8,10),      # right arm
    (11,12),             # hips
    (5,11), (6,12),      # torso
    (11,13), (13,15),    # left leg
    (12,14), (14,16),    # right leg
    (0,5), (0,6),        # nose to shoulders
    (0,1), (0,2), (1,3), (2,4)  # face (optional; comment out if you want)
]


torch.backends.cudnn.benchmark = True
try: torch.set_float32_matmul_precision("high")
except: pass


FORCE_CPU = os.environ.get("FORCE_CPU", "0") == "1"
if torch.cuda.is_available() and not FORCE_CPU:
    print("[POSE] Utilisation du GPU (CUDA)")
    device = 0
else:
    print("[POSE] Utilisation du CPU (FORCE_CPU=%s)" % FORCE_CPU)
    device = "cpu"
model = YOLO(os.environ.get("MODEL", "yolov8n-pose.pt")).to(device)
half = device != "cpu"

frame_q = queue.Queue(maxsize=3)
stop_flag = False

def open_container():
    try: return av.open(RTSP_URL, options=AV_OPEN_OPTS)
    except: return None

def grabber():
    global stop_flag
    backoff=0.5; container=None; stream=None
    while not stop_flag:
        try:
            if container is None:
                container = open_container()
                if container is None:
                    time.sleep(backoff); backoff=min(backoff*2, 5.0); continue
                stream = next(s for s in container.streams if s.type=="video")
                stream.thread_type = "AUTO"; backoff=0.5

            for pkt in container.demux(stream):
                if stop_flag: break
                for f in pkt.decode():
                    img = f.to_ndarray(format="bgr24")
                    if not frame_q.empty():
                        try: frame_q.get_nowait()
                        except queue.Empty: pass
                    frame_q.put(img, timeout=0.01)
        except:
            try:
                if container: container.close()
            except: pass
            container=None; stream=None
            time.sleep(0.2)
    try:
        if container: container.close()
    except: pass

threading.Thread(target=grabber, daemon=True).start()

# simple keypoint draw
def draw_keypoints(img, r):
    if r.keypoints is None: return
    kpts = r.keypoints.xy  # [n, num_kpts, 2]
    if kpts is None: return
    k = kpts.detach().cpu().numpy()
    for person in k:
        for x,y in person:
            x=int(x); y=int(y)
            cv2.circle(img,(x,y),2,(0,255,0),-1,lineType=cv2.LINE_AA)

def draw_pose(img, result, kp_thr: float = 0.2):
    """
    Draws skeleton + keypoints for a single Ultralytics result.
    - kp_thr: minimum keypoint confidence to draw (0..1). Use 0 if no confs.
    """
    if result.keypoints is None:
        return
    # keypoints.xy: (n,17,2); keypoints.conf: (n,17) or None
    k_xy = result.keypoints.xy  # tensor
    k_conf = getattr(result.keypoints, "conf", None)

    pts = k_xy.detach().cpu().numpy()
    confs = k_conf.detach().cpu().numpy() if k_conf is not None else None

    for person_i in range(pts.shape[0]):
        person = pts[person_i]           # (17, 2)
        vis = np.ones(17, dtype=bool)
        if confs is not None:
            vis = confs[person_i] >= kp_thr

        # lines first
        for a, b in SKELETON:
            if vis[a] and vis[b]:
                x1, y1 = map(int, person[a])
                x2, y2 = map(int, person[b])
                cv2.line(img, (x1, y1), (x2, y2), (0, 255, 255), 2, cv2.LINE_AA)

        # then points
        for j in range(17):
            if vis[j]:
                x, y = map(int, person[j])
                cv2.circle(img, (x, y), 3, (0, 255, 0), -1, lineType=cv2.LINE_AA)

jpeg_params = [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]

def frames():
    names = model.names
    while True:
        try:
            frame = frame_q.get(timeout=2.0)
        except queue.Empty:
            continue
        try:
            r = model.predict(
                source=frame, imgsz=IMG_SIZE, conf=CONF, iou=IOU,
                device=device, half=half, verbose=False, max_det=MAX_DET
            )[0]
            # draw keypoints (faster than .plot())
            draw_pose(frame, r, kp_thr=0.2)

            ok, buf = cv2.imencode(".jpg", frame, jpeg_params)
            if not ok: continue
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n")
        except:
            continue

@app.route("/video")
def video():
    return Response(frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/")
def index():
    return '<html><body><h2>Pose Live</h2><img src="/video"/></body></html>'

def shutdown(*_):
    global stop_flag
    stop_flag=True
signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)

if __name__=="__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True)
