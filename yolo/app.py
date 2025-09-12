import os, time, threading, queue, signal
import cv2
import av  # PyAV (FFmpeg bindings)
import torch
from flask import Flask, Response
app = Flask(__name__)

from ultralytics import YOLO

# ---- Config via env ----
RTSP_URL = os.environ.get("RTSP_URL", "rtsp://mediamtx:8554/cam")
IMG_SIZE = int(os.environ.get("IMG_SIZE", "640"))
CONF = float(os.environ.get("CONF", "0.35"))
IOU  = float(os.environ.get("IOU", "0.45"))
MAX_DET = int(os.environ.get("MAX_DET", "100"))
DRAW_LABELS = os.environ.get("DRAW_LABELS", "1") == "1"
JPEG_QUALITY = int(os.environ.get("JPEG_QUALITY", "80"))

# Force TCP & short timeout (microseconds)
AV_OPEN_OPTS = {"rtsp_transport": "tcp", "stimeout": "5000000"}



# ---- Torch / YOLO ----
torch.backends.cudnn.benchmark = True
try:
    torch.set_float32_matmul_precision("high")
except Exception:
    pass

print("[CONFIG] RTSP_URL =", RTSP_URL)
print("[CONFIG] IMG_SIZE =", IMG_SIZE)
print("[CONFIG] CONF =", CONF)
print("[CONFIG] IOU =", IOU)
print("[CONFIG] MAX_DET =", MAX_DET)
print("[CONFIG] JPEG_QUALITY =", JPEG_QUALITY)
print("[CONFIG] FORCE_CPU =", os.environ.get("FORCE_CPU", "0"))


FORCE_CPU = os.environ.get("FORCE_CPU", "0") == "1"
if torch.cuda.is_available() and not FORCE_CPU:
    print("[YOLO] Utilisation du GPU (CUDA)")
    device = 0
else:
    print("[YOLO] Utilisation du CPU (FORCE_CPU=%s)" % FORCE_CPU)
    device = "cpu"
model = YOLO(os.environ.get("MODEL", "yolov8n.pt")).to(device)
half = device != "cpu"


frame_q = queue.Queue(maxsize=3)
stop_flag = False

def open_container():
    try:
        return av.open(RTSP_URL, options=AV_OPEN_OPTS)
    except Exception:
        return None

def grabber():
    global stop_flag
    backoff = 0.5
    container, stream = None, None
    while not stop_flag:
        try:
            if container is None:
                container = open_container()
                if container is None:
                    time.sleep(backoff); backoff = min(backoff * 2, 5.0)
                    continue
                stream = next(s for s in container.streams if s.type == "video")
                stream.thread_type = "AUTO"
                backoff = 0.5

            for packet in container.demux(stream):
                if stop_flag:
                    break
                for f in packet.decode():
                    img = f.to_ndarray(format="bgr24")
                    if not frame_q.empty():
                        try: frame_q.get_nowait()
                        except queue.Empty: pass
                    frame_q.put(img, timeout=0.01)

        except Exception:
            try:
                if container: container.close()
            except Exception:
                pass
            container, stream = None, None
            time.sleep(0.2)

    try:
        if container: container.close()
    except Exception:
        pass

threading.Thread(target=grabber, daemon=True).start()

# ---- Fast drawing ----
def draw_boxes(img, boxes, cls, names, scores=None, draw_labels=True):
    for i, b in enumerate(boxes):
        x1, y1, x2, y2 = map(int, b)
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2, lineType=cv2.LINE_AA)
        if draw_labels:
            label = names[int(cls[i])]
            if scores is not None:
                label = f"{label} {scores[i]*100:.0f}%"
            cv2.putText(img, label, (x1, max(0, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2, cv2.LINE_AA)

jpeg_params = [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]

# ---- MJPEG stream ----
def frames():
    names = model.names
    while True:
        try:
            frame = frame_q.get(timeout=2.0)
        except queue.Empty:
            continue

        try:
            r = model.predict(
                source=frame,
                imgsz=IMG_SIZE,
                conf=CONF,
                iou=IOU,
                device=device,
                half=half,
                verbose=False,
                max_det=MAX_DET,
                agnostic_nms=False
            )[0]

            if r.boxes is not None and len(r.boxes) > 0:
                boxes = r.boxes.xyxy.detach().cpu().numpy()
                cls   = r.boxes.cls.detach().cpu().numpy().astype(int)
                confs = r.boxes.conf.detach().cpu().numpy()
                draw_boxes(frame, boxes, cls, names, scores=confs, draw_labels=DRAW_LABELS)

            ok, buf = cv2.imencode(".jpg", frame, jpeg_params)
            if not ok:
                continue
            jpg = buf.tobytes()
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n")
        except Exception:
            continue

@app.route("/video")
def video():
    return Response(frames(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/")
def index():
    return '<html><body><h2>YOLO Live</h2><img src="/video"/></body></html>'

def shutdown(*_):
    global stop_flag
    stop_flag = True
signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, threaded=True)
