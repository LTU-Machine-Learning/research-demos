# app.py — YOLO Pose (WS keypoints only) + optional annotated outputs + DEBUG
import os, time, threading, queue, subprocess, signal, logging, json, shutil, socket
from typing import Optional, Dict, Any, List

import cv2, av, torch, numpy as np
from flask import Flask, Response, jsonify
from flask_sock import Sock
from ultralytics import YOLO

# -------------------- Logging --------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("POSE")

# -------------------- Env --------------------
RTSP_URL        = os.getenv("RTSP_URL",        "rtsp://mediamtx:8554/cam")
MODEL           = os.getenv("MODEL",           "yolov8n-pose.pt")
CONF            = float(os.getenv("CONF",      "0.35"))
IOU             = float(os.getenv("IOU",       "0.45"))
MAX_DET         = int(os.getenv("MAX_DET",     "50"))
FPS_OUT         = int(os.getenv("FPS_OUT",     "30"))
JPEG_QUALITY    = int(os.getenv("JPEG_QUALITY","80"))
FORCE_CPU       = os.getenv("FORCE_CPU",       "0") == "1"

# Optional annotated RTSP republish
ANNOT_URL       = os.getenv("ANNOT_URL",       "rtsp://mediamtx:8554/pose_annot")
RTSP_TRANSPORT  = os.getenv("RTSP_TRANSPORT",  "udp")      # "udp" | "tcp"
DRAW_ON_VIDEO   = os.getenv("DRAW_ON_VIDEO",   "0") == "1" # draw skeleton on MJPEG/RTSP frames
KP_THR          = float(os.getenv("KP_THR",    "0.25"))

# -------------------- Torch / model --------------------
torch.backends.cudnn.benchmark = True
try:
    torch.set_float32_matmul_precision("high")
except Exception:
    pass

# GPU diagnostics
cuda_ok = False
cuda_err = None
try:
    cuda_ok = torch.cuda.is_available() and not FORCE_CPU
except Exception as e:
    cuda_err = str(e)

if cuda_ok:
    device, half = 0, True
    log.info("[POSE] GPU + FP16")
else:
    device, half = "cpu", False
    log.info(f"[POSE] CPU (FORCE_CPU={FORCE_CPU}, torch.cuda.is_available()={torch.cuda.is_available()}, err={cuda_err})")

model = YOLO(MODEL).to(device)

# -------------------- Flask + WS --------------------
app = Flask(__name__)
sock = Sock(app)
_ws_clients = set()

# live stats (surfaced in /healthz)
_stats = {
    "frames_in": 0,
    "last_frame_in_ts": 0.0,
    "people_last": 0,
    "ws_clients": 0,
    "ffmpeg_running": False,
    "annot_url": ANNOT_URL,
    "rtsp_transport": RTSP_TRANSPORT,
    "using_gpu": bool(cuda_ok),
    "half": bool(half),
    "last_broadcast_ts": 0.0,
}

@sock.route("/ws/pose")
def ws_pose(ws):
    _ws_clients.add(ws)
    _stats["ws_clients"] = len(_ws_clients)
    log.info(f"[WS] client connected (total={_stats['ws_clients']})")
    try:
        while True:
            if ws.receive() is None:
                break
    finally:
        _ws_clients.discard(ws)
        _stats["ws_clients"] = len(_ws_clients)
        log.info(f"[WS] client disconnected (total={_stats['ws_clients']})")

def _broadcast(payload: Dict[str, Any]):
    if not _ws_clients:
        return
    buf = json.dumps(payload, separators=(",", ":"))
    dead = []
    for cli in list(_ws_clients):
        try:
            cli.send(buf)
        except Exception:
            dead.append(cli)
    for d in dead:
        _ws_clients.discard(d)
    _stats["ws_clients"] = len(_ws_clients)
    _stats["last_broadcast_ts"] = time.time()

# -------------------- IO / Queues --------------------
frame_q: "queue.Queue[np.ndarray]" = queue.Queue(maxsize=8)
jpeg_q: "queue.Queue[bytes]"       = queue.Queue(maxsize=8)
stop_flag = False

# Low-latency PyAV settings
AV_OPEN_OPTS = {
    "rtsp_transport": RTSP_TRANSPORT,
    "fflags": "nobuffer",
    "flags": "low_delay",
    "max_delay": "0",
    "probesize": "32000",
    "analyzeduration": "0",
    "reorder_queue_size": "0",
    "stimeout": "3000000",  # 3s
}

def open_container():
    try:
        return av.open(RTSP_URL, options=AV_OPEN_OPTS)
    except Exception as e:
        log.warning(f"[grabber] open_container failed: {e}")
        return None

def grabber():
    """RTSP → BGR frames into frame_q with minimal latency."""
    global stop_flag
    backoff = 0.5
    container = None
    stream = None
    log.info(f"[grabber] opening {RTSP_URL} (transport={RTSP_TRANSPORT})")
    while not stop_flag:
        try:
            if container is None:
                container = open_container()
                if container is None:
                    time.sleep(backoff); backoff = min(backoff * 2, 5.0); continue
                stream = next(s for s in container.streams if s.type == "video")
                stream.thread_type = "AUTO"
                try:
                    stream.codec_context.skip_frame = "DEFAULT"
                    stream.codec_context.flags2 |= 0x00000800  # AV_CODEC_FLAG2_FAST
                except Exception:
                    pass
                backoff = 0.5
                log.info("[grabber] connected to RTSP")

            for pkt in container.demux(stream):
                if stop_flag:
                    break
                for f in pkt.decode():
                    img = f.to_ndarray(format="bgr24")
                    try:
                        while True:
                            frame_q.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        frame_q.put_nowait(img)
                        _stats["frames_in"] += 1
                        _stats["last_frame_in_ts"] = time.time()
                    except queue.Full:
                        pass

        except Exception as e:
            log.warning(f"[grabber] exception: {e}")
            try:
                if container:
                    container.close()
            except Exception:
                pass
            container, stream = None, None
            time.sleep(0.2)

    try:
        if container:
            container.close()
    except Exception:
        pass
    log.info("[grabber] stopped")

# -------------------- Optional RTSP publisher --------------------
class RtspPublisher:
    def __init__(self, url: str, fps: int = 30, transport: str = "udp"):
        self.url = url
        self.fps = int(fps)
        self.transport = transport
        self.proc: Optional[subprocess.Popen] = None

    def _start(self, w: int, h: int):
        if not self.url:
            log.info("[PUB] ANNOT_URL empty -> publisher disabled")
            return
        if not shutil.which("ffmpeg"):
            log.error("[PUB] ffmpeg NOT found in PATH -> cannot publish RTSP")
            return
        W = int(w) - (int(w) % 2)
        H = int(h) - (int(h) % 2)
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",

            # raw frames in via stdin
            "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(self.fps), "-i", "-",

            # video only
            "-an",

            # encoder: low-latency baseline H.264, no B-frames, short GOP
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-profile:v", "baseline",
            "-tune", "zerolatency",
            "-preset", "veryfast",
            "-bf", "0",
            "-g", str(self.fps),
            "-keyint_min", str(self.fps),
            "-x264-params", "bframes=0:scenecut=0:rc-lookahead=0:ref=1",

            # RTSP muxer: prefer low buffering
            "-f", "rtsp",
            "-rtsp_transport", self.transport,
            "-flush_packets", "1",
            "-max_interleave_delta", "0",

            self.url,
        ]
        log.info(f"[PUB] ffmpeg start {W}x{H}@{self.fps} → {self.url} ({self.transport})")
        try:
            self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, bufsize=0)
            _stats["ffmpeg_running"] = True
        except Exception as e:
            log.exception(f"[PUB] failed to start ffmpeg: {e}")
            self.proc = None
            _stats["ffmpeg_running"] = False

    def write(self, frame: np.ndarray):
        if frame is None:
            return
        if self.proc is None:
            h, w = frame.shape[:2]
            self._start(w, h)
            if self.proc is None:
                return
        try:
            self.proc.stdin.write(frame.tobytes())
        except Exception as e:
            log.error(f"[PUB] stdin write error: {e} (restart next frame)")
            self.stop()

    def stop(self):
        if self.proc:
            try:
                try:
                    self.proc.stdin.close()
                except Exception:
                    pass
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=2.0)
                except Exception:
                    self.proc.kill()
            finally:
                self.proc = None
                _stats["ffmpeg_running"] = False

publisher = RtspPublisher(ANNOT_URL, fps=FPS_OUT, transport=RTSP_TRANSPORT) if ANNOT_URL else None

# -------------------- Pose utils --------------------
SKELETON: List[List[int]] = [
    [5,6],[5,7],[7,9],[6,8],[8,10],[11,12],[5,11],[6,12],
    [11,13],[13,15],[12,14],[14,16],[0,5],[0,6],[0,1],[0,2],[1,3],[2,4]
]

def crop_to_stride(img: np.ndarray, stride: int = 32) -> np.ndarray:
    h, w = img.shape[:2]
    new_h = (h // stride) * stride
    new_w = (w // stride) * stride
    y0 = (h - new_h) // 2
    x0 = (w - new_w) // 2
    return img[y0:y0+new_h, x0:x0+new_w]

def draw_pose(frame: np.ndarray, kpts: np.ndarray, kp_thr: float = 0.2):
    """kpts: (N,17,3) with (x,y,conf)"""
    for person in kpts:
        vis = person[:, 2] >= kp_thr
        # lines
        for a, b in SKELETON:
            if vis[a] and vis[b]:
                x1, y1 = map(int, person[a, :2])
                x2, y2 = map(int, person[b, :2])
                cv2.line(frame, (x1, y1), (x2, y2), (0,255,255), 2, cv2.LINE_AA)
        # points
        for j in range(17):
            if vis[j]:
                x, y = map(int, person[j, :2])
                cv2.circle(frame, (x, y), 3, (0,255,0), -1, lineType=cv2.LINE_AA)

# -------------------- Inferencer --------------------
def inferencer():
    global stop_flag
    jpeg_params = [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]

    # Warmup (GPU)
    if device != "cpu":
        dH = dW = 640
        dummy = torch.zeros((1,3,dH,dW), device=device, dtype=(torch.float16 if half else torch.float32))
        with torch.no_grad():
            model(dummy); model(dummy)
        log.info("[infer] warmup done on GPU")

    last_log = time.time()
    while not stop_flag:
        try:
            fr = frame_q.get(timeout=0.5)
        except queue.Empty:
            # periodic log if no frames
            if time.time() - last_log > 5:
                log.info("[infer] waiting for frames…")
                last_log = time.time()
            continue

        try:
            fr = crop_to_stride(fr, 32)
            h, w = fr.shape[:2]

            with torch.no_grad():
                r = model.predict(
                    source=fr, imgsz=(w, h), conf=CONF, iou=IOU,
                    device=device, half=half, verbose=False, max_det=MAX_DET
                )[0]

            poses_payload: List[Dict[str, Any]] = []
            people_count = 0

            if r.keypoints is not None:
                k_xy  = r.keypoints.xy
                k_cf  = getattr(r.keypoints, "conf", None)

                pts   = k_xy.detach().cpu().numpy()                            # (N,17,2)
                confs = k_cf.detach().cpu().numpy() if k_cf is not None else None  # (N,17)

                if confs is not None:
                    k3 = np.dstack([pts, confs[..., None]])                    # (N,17,3)
                else:
                    ones = np.ones((pts.shape[0], pts.shape[1], 1), dtype=pts.dtype)
                    k3 = np.concatenate([pts, ones], axis=-1)

                def clean_point(x: float, y: float, c: Optional[float]):
                    if not (np.isfinite(x) and np.isfinite(y)): return None
                    if (x == 0 and y == 0): return None
                    if c is not None and c < KP_THR: return None
                    return [float(x), float(y)]

                for person in k3:
                    arr: List[Optional[List[float]]] = []
                    for j in range(person.shape[0]):
                        x, y, c = float(person[j,0]), float(person[j,1]), float(person[j,2])
                        arr.append(clean_point(x, y, c))
                    # count if it has at least a couple of valid points
                    if sum(1 for p in arr if p is not None) >= 2:
                        people_count += 1
                    poses_payload.append({"kpts": arr})

                if DRAW_ON_VIDEO and k3.size:
                    draw_pose(fr, k3, kp_thr=KP_THR)

            _stats["people_last"] = people_count

            # WS sender
            _broadcast({
                "ts": int(time.time()*1000),
                "w": int(w), "h": int(h),
                "skeleton": SKELETON,
                "people": poses_payload
            })

            # MJPEG (optional)
            if DRAW_ON_VIDEO:
                ok, buf = cv2.imencode(".jpg", fr, jpeg_params)
                if ok:
                    try:
                        while True: jpeg_q.get_nowait()
                    except queue.Empty: pass
                    try: jpeg_q.put_nowait(buf.tobytes())
                    except queue.Full: pass

            # RTSP publish
            if publisher:
                publisher.write(fr)

        except Exception as e:
            log.warning(f"[infer] exception: {e}")
            continue

# -------------------- Threads --------------------
threading.Thread(target=grabber,    daemon=True).start()
threading.Thread(target=inferencer, daemon=True).start()

# -------------------- HTTP endpoints --------------------
@app.route("/video")
def video():
    """Optional MJPEG endpoint (only useful if DRAW_ON_VIDEO=1)."""
    if not DRAW_ON_VIDEO:
        return Response("DRAW_ON_VIDEO=0", status=200, mimetype="text/plain")
    boundary = b"--frame"
    min_interval = 1.0 / max(1, FPS_OUT)
    last_time = time.time()

    def gen():
        nonlocal last_time
        while True:
            try:
                jpg = jpeg_q.get(timeout=2.0)
                while True:
                    try: jpg = jpeg_q.get_nowait()
                    except queue.Empty: break
            except queue.Empty:
                continue
            now = time.time()
            dt = now - last_time
            if dt < min_interval:
                time.sleep(min_interval - dt)
            last_time = time.time()
            yield boundary + b"\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n"

    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

@app.route("/healthz")
def healthz():
    # quick connectivity probe to MediaMTX RTSP tcp socket (best-effort)
    rtsp_host = os.getenv("MTX_HOST", "mediamtx")
    rtsp_port = int(os.getenv("MTX_RTSP_PORT", "8554"))
    reachable = False
    try:
        with socket.create_connection((rtsp_host, rtsp_port), timeout=0.5):
            reachable = True
    except Exception:
        pass
    out = dict(_stats)
    out["mediamtx_rtsp_reachable"] = reachable
    return jsonify(out)

@app.route("/")
def index():
    return '<html><body><h2>Pose Live (WS keypoints)</h2><p>WS: /ws/pose</p></body></html>'

# -------------------- Shutdown --------------------
def shutdown(*_):
    global stop_flag
    stop_flag = True
    try:
        if publisher:
            publisher.stop()
    except Exception:
        pass

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT,  shutdown)

# -------------------- Main --------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6000, threaded=True)
