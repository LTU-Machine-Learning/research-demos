import os, time, threading, queue, subprocess, signal, logging, json
import cv2
import av
import torch
from flask import Flask, Response
from flask_sock import Sock

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("YOLO-APP")

try:
    from turbojpeg import TurboJPEG
    jpeg_encoder = TurboJPEG()
except Exception:
    jpeg_encoder = None

app = Flask(__name__)
sock = Sock(app)

from ultralytics import YOLO

# ---- Config via env ----
RTSP_URL      = os.environ.get("RTSP_URL",  "rtsp://mediamtx:8554/cam")
ANNOT_URL     = os.environ.get("ANNOT_URL", "rtsp://mediamtx:8554/annot")
IMG_SIZE_X    = int(os.environ.get("IMG_SIZE_X", "1280"))
IMG_SIZE_Y    = int(os.environ.get("IMG_SIZE_Y", "720"))
CONF          = float(os.environ.get("CONF", "0.35"))
IOU           = float(os.environ.get("IOU", "0.45"))
MAX_DET       = int(os.environ.get("MAX_DET", "100"))
DRAW_LABELS   = os.environ.get("DRAW_LABELS", "1") == "1"
JPEG_QUALITY  = int(os.environ.get("JPEG_QUALITY", "80"))
FORCE_CPU     = os.environ.get("FORCE_CPU", "0") == "1"
FPS_OUT       = int(os.environ.get("FPS_OUT", "30")) 

# ---- Torch / YOLO ----
torch.backends.cudnn.benchmark = True
try:
    torch.set_float32_matmul_precision("high")
except Exception:
    pass

if torch.cuda.is_available() and not FORCE_CPU:
    device = 0
    half = True
    log.info("[YOLO] GPU + FP16")
else:
    device = "cpu"
    half = False
    log.info("[YOLO] CPU")

model = YOLO(os.environ.get("MODEL", "yolov8n.pt")).to(device)
names = model.names

# ---- Queues ----
frame_q = queue.Queue(maxsize=8)
jpeg_q  = queue.Queue(maxsize=8)
stop_flag = False

# ---- WebSocket clients (detections overlay) ----
_ws_clients = set()

@sock.route('/ws/dets')
def ws_dets(ws):
    """Client WS: on garde la socket ouverte; on n'attend rien du client."""
    log.info("[WS DETS] client connected")   # 👈 AJOUT
    _ws_clients.add(ws)
    try:
        while True:
            msg = ws.receive()
            if msg is None:
                break
    finally:
        _ws_clients.discard(ws)
        log.info("[WS DETS] client disconnected")

def _broadcast_dets(payload: dict):
    """Envoie un JSON compact à tous les clients WS."""
    if not _ws_clients:
        return
    buf = json.dumps(payload, separators=(',', ':'))
    dead = []
    for cli in list(_ws_clients):
        try:
            cli.send(buf)
        except Exception:
            dead.append(cli)
    for d in dead:
        _ws_clients.discard(d)

# ---- PyAV options faibles latences (UDP) ----
AV_OPEN_OPTS = {
    "rtsp_transport": "udp",
    "fflags": "nobuffer",
    "flags": "low_delay",
    "max_delay": "0",
    "probesize": "32000",
    "analyzeduration": "0",
    "reorder_queue_size": "0",
    "stimeout": "3000000"  # 3s µs
}

def open_container():
    try:
        return av.open(RTSP_URL, options=AV_OPEN_OPTS)
    except Exception:
        return None

def grabber():
    """Lit RTSP → BGR frames dans frame_q avec faible latence."""
    global stop_flag
    backoff = 0.5
    container, stream = None, None
    dec_times, dec_count, last_dec_log = [], 0, time.time()
    while not stop_flag:
        try:
            if container is None:
                container = open_container()
                if container is None:
                    time.sleep(backoff); backoff = min(backoff * 2, 5.0)
                    continue
                stream = next(s for s in container.streams if s.type == "video")
                stream.thread_type = "AUTO"
                try:
                    stream.codec_context.skip_frame = "DEFAULT"
                    stream.codec_context.flags2 |= 0x00000800  # AV_CODEC_FLAG2_FAST
                except Exception:
                    pass
                backoff = 0.5

            for packet in container.demux(stream):
                if stop_flag:
                    break
                for f in packet.decode():
                    t0 = time.time()
                    img = f.to_ndarray(format="bgr24")
                    t1 = time.time()
                    dec_times.append((t1 - t0) * 1000); dec_count += 1
                    now = time.time()
                    if now - last_dec_log >= 1.0 and dec_count > 0:
                        avg_dec = sum(dec_times) / dec_count
                        dec_times.clear(); dec_count = 0; last_dec_log = now
                    # drop anciennes frames si q pleine
                    try:
                        while True:
                            frame_q.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        frame_q.put_nowait(img)
                    except queue.Full:
                        pass
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

# ---------- Publisher RTSP (annot) ----------
class RtspPublisher:
    def __init__(self, url, fps=30, transport="udp"):
        self.url = url
        self.fps = int(fps)
        self.transport = transport
        self.proc = None
        self.w = None
        self.h = None

    def _start(self, w, h):
        self.w, self.h = int(w), int(h)
        W = self.w - (self.w % 2)
        H = self.h - (self.h % 2)
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(self.fps), "-i", "-",
            "-an",
            "-vf", "format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
            "-x264-params", "bframes=0:rc-lookahead=0:sync-lookahead=0:scenecut=0:keyint=30:min-keyint=30:nal-hrd=cbr",
            "-g", "30", "-bf", "0", "-b:v", "5M", "-maxrate", "5M", "-bufsize", "500k",
            "-f", "rtsp", "-rtsp_transport", self.transport, self.url
        ]
        log.info(f"[PUB] FFmpeg start {W}x{H}@{self.fps} → {self.url} ({self.transport})")
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, bufsize=0)

    def write(self, frame):
        if frame is None: return
        h, w = frame.shape[:2]
        H = h - (h % 2); W = w - (w % 2)
        if (H != h) or (W != w):
            frame = frame[:H, :W]
        if self.proc is None:
            self._start(W, H)
        try:
            self.proc.stdin.write(frame.tobytes())
        except Exception as e:
            log.error(f"[PUB] stdin write error: {e} (restart on next frame)")
            self.stop()

    def stop(self):
        if self.proc:
            try:
                try: self.proc.stdin.close()
                except Exception: pass
                self.proc.terminate()
                try: self.proc.wait(timeout=2.0)
                except Exception: self.proc.kill()
            finally:
                self.proc = None

publisher = RtspPublisher(ANNOT_URL, fps=FPS_OUT, transport="udp")

def crop_to_stride(img, stride=32):
    h, w = img.shape[:2]
    new_h = (h // stride) * stride
    new_w = (w // stride) * stride
    y0 = (h - new_h) // 2
    x0 = (w - new_w) // 2
    return img[y0:y0+new_h, x0:x0+new_w]

def inferencer():
    """Infère, dessine, pousse MJPEG + publie RTSP annot + broadcast WS dets."""
    global stop_flag

    # Warmup
    if device != "cpu":
        dtype = torch.float16 if half else torch.float32
        dummy_h = (IMG_SIZE_Y // 32) * 32
        dummy_w = (IMG_SIZE_X // 32) * 32
        dummy = torch.zeros((1, 3, dummy_h, dummy_w), device=device, dtype=dtype)
        with torch.no_grad():
            model(dummy); model(dummy)
        if half: dummy = dummy.half()
        for _ in range(2):
            _ = model.predict(source=dummy, imgsz=(dummy_w, dummy_h), device=device, half=half, verbose=False)

    BATCH_SIZE = 1
    last_fps_time = time.time()
    frame_count = 0
    infer_times, draw_times, jpeg_times = [], [], []
    jpeg_params = [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]

    while not stop_flag:
        # batch court
        frames = []
        for _ in range(BATCH_SIZE):
            try:
                fr = frame_q.get(timeout=0.2)
                fr = crop_to_stride(fr, 32)
                frames.append(fr)
            except queue.Empty:
                break
        if not frames:
            continue

        try:
            # Inférence
            t0 = time.time()
            h, w = frames[0].shape[:2]
            with torch.no_grad():
                results = model.predict(
                    source=frames,
                    imgsz=(w, h),
                    conf=CONF,
                    iou=IOU,
                    device=device,
                    half=half,
                    verbose=False,
                    max_det=MAX_DET,
                    agnostic_nms=False
                )
            t1 = time.time()
            infer_time = (t1 - t0) * 1000 / max(1, len(frames))

            for frame, r in zip(frames, results):
                # ---- Build dets payload for WS ----
                dets = []
                if r.boxes is not None and len(r.boxes) > 0:
                    boxes = r.boxes.xyxy.detach().cpu().numpy()
                    clss  = r.boxes.cls.detach().cpu().numpy().astype(int)
                    confs = r.boxes.conf.detach().cpu().numpy()
                    # Dessin + JSON
                    t_draw0 = time.time()
                    for i, b in enumerate(boxes):
                        x1, y1, x2, y2 = map(int, b)
                        dets.append({"x1": x1, "y1": y1, "x2": x2, "y2": y2,
                                     "cls": int(clss[i]), "conf": float(confs[i])})
                        # draw (pour la version RTSP annot)
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0,255,0), 2, cv2.LINE_AA)
                        if DRAW_LABELS:
                            label = f"{names[int(clss[i])]} {confs[i]*100:.0f}%"
                            cv2.putText(frame, label, (x1, max(0, y1-6)),
                                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2, cv2.LINE_AA)
                    draw_time = (time.time() - t_draw0) * 1000
                    draw_times.append(draw_time)

                # ---- Broadcast WS dets ----
                _broadcast_dets({
                    "ts": int(time.time()*1000),
                    "w": int(w), "h": int(h),
                    "boxes": dets
                })

                # ---- MJPEG (debug) ----
                t_j0 = time.time()
                if jpeg_encoder:
                    jpg = jpeg_encoder.encode(frame, quality=JPEG_QUALITY)
                else:
                    ok, buf = cv2.imencode(".jpg", frame, jpeg_params)
                    jpg = buf.tobytes() if ok else None
                if jpg:
                    try:
                        while True: jpeg_q.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        jpeg_q.put_nowait(jpg)
                    except queue.Full:
                        pass
                jpeg_times.append((time.time() - t_j0) * 1000)

                # ---- RTSP annot → MediaMTX ----
                publisher.write(frame)

                frame_count += 1

            infer_times.append(infer_time)

            now = time.time()
            if now - last_fps_time >= 1.0:
                avg_infer = sum(infer_times)/len(infer_times) if infer_times else 0
                avg_draw  = sum(draw_times)/len(draw_times)   if draw_times  else 0
                avg_jpeg  = sum(jpeg_times)/len(jpeg_times)   if jpeg_times  else 0
                frame_count = 0; last_fps_time = now
                infer_times.clear(); draw_times.clear(); jpeg_times.clear()

        except Exception as e:
            log.warning(f"[infer] exception: {e}")
            continue

# ---- Threads ----
threading.Thread(target=grabber,    daemon=True).start()
threading.Thread(target=inferencer, daemon=True).start()

# ---- MJPEG debug ----
def mjpeg_generator():
    boundary = b"--frame"
    min_interval = 1.0 / max(1, FPS_OUT)
    last_time = time.time()
    img_count = 0
    last_log = time.time()
    while True:
        try:
            jpg = jpeg_q.get(timeout=2.0)
            while True:
                try:
                    jpg = jpeg_q.get_nowait()
                except queue.Empty:
                    break
        except queue.Empty:
            continue
        now = time.time()
        elapsed = now - last_time
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        last_time = time.time()
        img_count += 1
        if last_time - last_log >= 1.0:
            img_count = 0; last_log = last_time
        yield boundary + b"\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"

@app.route("/video")
def video():
    return Response(mjpeg_generator(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/")
def index():
    return '<html><body><h2>YOLO Live</h2><img src="/video"/></body></html>'

def shutdown(*_):
    global stop_flag
    stop_flag = True
    try: publisher.stop()
    except Exception: pass

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT,  shutdown)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6000, threaded=True)
