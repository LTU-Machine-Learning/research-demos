#!/usr/bin/env python3
import os
import subprocess
import signal
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# ========= BASIC CONFIG =========

# RTSP from mediamtx (Vision Hub input)
CAMERA_RTSP = os.getenv("CAMERA_RTSP", "rtsp://192.168.10.2:8554/cam")

# ffmpeg writes to this
UDP_IN_URL = "udp://127.0.0.1:12345"

# uimain reads this
UIMAIN_INPUT = "udp://127.0.0.1:12345?fifo_size=5000000&overrun_nonfatal=1"

# Port where uimain outputs
UIMAIN_OUTPUT_PORT = os.getenv("UIMAIN_OUTPUT_PORT", "12346")
UDP_OUT_URL = (
    f"udp://127.0.0.1:{UIMAIN_OUTPUT_PORT}"
    "?fifo_size=5000000&overrun_nonfatal=1"
)

# RTSP endpoint to publish annotated output back to mediamtx
OUTPUT_RTSP = os.getenv("OUTPUT_RTSP", "rtsp://192.168.10.2:8554/chang_annot_test")

# Paths for uimain
UIMAIN_WORKDIR = "/root/project_nep/cside"
UIMAIN_MODEL = "backends/yolov8-onnx-cpp/checkpoints/latin-int8-swin.onnx"

# ========= COLORS / LOG HELPERS =========

COLOR_RESET = "\033[0m"
COLOR_OK = "\033[92m"      # green
COLOR_ERR = "\033[91m"     # red
COLOR_WARN = "\033[93m"    # yellow
COLOR_INFO = "\033[96m"    # cyan
COLOR_BOLD = "\033[1m"

def log_info(msg: str):
    print(f"{COLOR_INFO}[chang-demo]{COLOR_RESET} {msg}", flush=True)

def log_ok(msg: str):
    print(f"{COLOR_OK}[chang-demo][OK]{COLOR_RESET} {msg}", flush=True)

def log_warn(msg: str):
    print(f"{COLOR_WARN}[chang-demo][WARN]{COLOR_RESET} {msg}", flush=True)

def log_err(msg: str):
    print(f"{COLOR_ERR}[chang-demo][ERROR]{COLOR_RESET} {msg}", flush=True)

# ========= GLOBAL STATE =========

ffmpeg_in_proc = None
ffmpeg_out_proc = None
uimain_proc = None
stop_all = False
health_server = None  # <- important so shutdown() never sees an undefined name

# ========= SUBPROCESS HELPERS =========

def kill_proc(p):
    if p and p.poll() is None:
        try:
            p.terminate()
        except Exception:
            pass
        try:
            p.wait(timeout=2)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass

def wait_for_start(name: str, proc: subprocess.Popen, timeout_s: int = 5) -> bool:
    """
    Wait a few seconds; if the process dies during that period, treat as a failed start.
    """
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if proc.poll() is not None:
            log_err(f"{name} exited early with code {proc.returncode}")
            return False
        time.sleep(0.2)
    log_ok(f"{name} appears to be running")
    return True

# ========= PIPELINE STARTERS =========

def start_ffmpeg_in():
    """RTSP (mediamtx) -> UDP 127.0.0.1:12345 (copy, no re-encode)."""
    global ffmpeg_in_proc
    cmd = [
        "ffmpeg",
        "-loglevel", "info",
        "-rtsp_transport", "tcp",
        "-analyzeduration", "1000000",
        "-probesize", "1000000",
        "-i", CAMERA_RTSP,
        "-map", "0:v:0",
        "-c:v", "copy",  # <== NO re-encode, low latency
        "-f", "mpegts",
        "-mpegts_flags", "+resend_headers+initial_discontinuity",
        "-muxdelay", "0",
        "-muxpreload", "0",
        "-flush_packets", "1",
        UDP_IN_URL,
    ]
    log_info("Starting ffmpeg_in:")
    print("   " + " ".join(cmd), flush=True)
    ffmpeg_in_proc = subprocess.Popen(cmd)
    return ffmpeg_in_proc

def start_uimain():
    """Start uimain and return the process."""
    global uimain_proc
    os.chdir(UIMAIN_WORKDIR)
    cmd = [
        "./uimain",
        "s",
        UIMAIN_MODEL,
        UIMAIN_INPUT,
        UIMAIN_OUTPUT_PORT,
    ]
    log_info("Starting uimain:")
    print("   " + " ".join(cmd), flush=True)
    uimain_proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    return uimain_proc

def start_ffmpeg_out():
    """UDP from uimain -> RTSP to mediamtx."""
    global ffmpeg_out_proc
    cmd = [
        "ffmpeg",
        "-fflags", "nobuffer",
        "-flags", "low_delay",
        "-i", UDP_OUT_URL,
        "-map", "0:v:0",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p",
        "-f", "rtsp",
        "-rtsp_transport", "tcp",
        "-muxdelay", "0",
        "-muxpreload", "0",
        OUTPUT_RTSP,
    ]
    log_info("Starting ffmpeg_out:")
    print("   " + " ".join(cmd), flush=True)
    ffmpeg_out_proc = subprocess.Popen(cmd)
    return ffmpeg_out_proc

# ========= SIGNAL / SHUTDOWN =========

def shutdown(signum, frame):
    global ffmpeg_in_proc, ffmpeg_out_proc, uimain_proc, health_server, stop_all
    stop_all = True
    log_warn(f"Caught signal {signum}, shutting down...")

    for p in (uimain_proc, ffmpeg_out_proc, ffmpeg_in_proc):
        kill_proc(p)

    if health_server is not None:
        try:
            health_server.shutdown()
        except Exception:
            pass
        health_server = None

    sys.exit(0)

# ========= UIMAIN LOG WATCHER =========

def watch_uimain(proc, ready_flag, failed_flag, timeout_s=10):
    """
    Read uimain logs:
      - If we see 'ERROR: Could not open video stream', mark failed.
      - If we see 'image:' or 'Speed:' lines, mark ready (frames processed).
      - If it takes too long without becoming ready, mark failed.
    """
    t_start = time.time()
    for raw_line in proc.stdout:
        if stop_all:
            break

        line = raw_line.rstrip("\n")

        if "ERROR" in line:
            # Highlight errors
            print(f"{COLOR_ERR}[uimain][ERROR]{COLOR_RESET} {line}", flush=True)
        elif "image:" in line or "Speed:" in line:
            # These only appear when frames are processed -> READY signal
            if not ready_flag["v"]:
                log_ok("uimain started processing frames (image/Speed logs detected)")
            ready_flag["v"] = True
            print(f"{COLOR_OK}[uimain][READY]{COLOR_RESET} {line}", flush=True)
        else:
            # Less important spam, but still prefixed
            print(f"[uimain] {line}", flush=True)

        if "ERROR: Could not open video stream" in line:
            failed_flag["v"] = True
            break

        if (time.time() - t_start) > timeout_s and not ready_flag["v"]:
            log_err(
                "uimain did not start processing frames within "
                f"{timeout_s}s, marking as failed"
            )
            failed_flag["v"] = True
            break

    # If the process exits quickly without ever becoming ready → failed
    proc.wait()
    if not ready_flag["v"] and (time.time() - t_start) < timeout_s and not stop_all:
        log_err("uimain exited early before becoming ready")
        failed_flag["v"] = True

# ========= HEALTH ENDPOINT =========

def pipeline_ok() -> bool:
    """Return True if all 3 subprocesses appear alive."""
    if ffmpeg_in_proc is None or ffmpeg_in_proc.poll() is not None:
        return False
    if uimain_proc is None or uimain_proc.poll() is not None:
        return False
    if ffmpeg_out_proc is None or ffmpeg_out_proc.poll() is not None:
        return False
    return True

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/healthz":
            self.send_response(404)
            self.end_headers()
            return

        ok = pipeline_ok()
        body = (b'{"ok":true}' if ok else b'{"ok":false}')

        self.send_response(200 if ok else 503)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # avoid noisy logs on stdout
    def log_message(self, fmt, *args):
        return

def start_health_server():
    global health_server
    port = int(os.getenv("HEALTH_PORT", "7000"))
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    th = threading.Thread(target=server.serve_forever, daemon=True)
    th.start()
    health_server = server
    log_ok(f"health server listening on 0.0.0.0:{port}/healthz")

# ========= ONE PIPELINE CYCLE (with retries) =========

def run_pipeline_cycle():
    """
    Start ffmpeg_in → uimain → ffmpeg_out, with retries.
    If any component dies after being ready, we clean up and return
    so the caller can restart the whole cycle.
    """
    global ffmpeg_in_proc, ffmpeg_out_proc, uimain_proc

    # ---- 1) Start ffmpeg_in with infinite retries ----
    while not stop_all:
        log_info("Starting ffmpeg_in (new cycle)")
        ffmpeg_in_proc = start_ffmpeg_in()
        if wait_for_start("ffmpeg_in", ffmpeg_in_proc, timeout_s=5):
            break
        log_warn("ffmpeg_in failed to start, retrying in 3s...")
        kill_proc(ffmpeg_in_proc)
        ffmpeg_in_proc = None
        time.sleep(3)

    if stop_all:
        return

    # Small delay so mediamtx/RTSP handshake is done
    time.sleep(2)

    # ---- 2) Loop until uimain is READY (frames processed) ----
    while not stop_all:
        ready = {"v": False}
        failed = {"v": False}

        log_info("Starting uimain (new attempt)")
        proc = start_uimain()
        t = threading.Thread(target=watch_uimain, args=(proc, ready, failed), daemon=True)
        t.start()

        # Wait until either ready or failed
        while not (ready["v"] or failed["v"]) and proc.poll() is None and not stop_all:
            time.sleep(0.2)

        if stop_all:
            kill_proc(proc)
            return

        if ready["v"]:
            log_ok("uimain is READY (frames are flowing)")
            uimain_proc = proc
            break
        else:
            log_warn("uimain FAILED to start correctly, killing and retrying in 2s...")
            kill_proc(proc)
            uimain_proc = None
            time.sleep(2)

    if stop_all:
        return

    # ---- 3) Start ffmpeg_out with retries ----
    while not stop_all:
        log_info("Starting ffmpeg_out (new attempt)")
        ffmpeg_out_proc = start_ffmpeg_out()
        if wait_for_start("ffmpeg_out", ffmpeg_out_proc, timeout_s=5):
            break
        log_warn("ffmpeg_out failed to start, retrying in 3s...")
        kill_proc(ffmpeg_out_proc)
        ffmpeg_out_proc = None
        time.sleep(3)

    if stop_all:
        return

    log_ok(
        f"{COLOR_BOLD}PIPELINE READY — RTSP out on {OUTPUT_RTSP}"
        f"{COLOR_RESET}"
    )

    # ---- 4) Monitor; if any proc dies, restart whole pipeline ----
    while not stop_all:
        if ffmpeg_in_proc.poll() is not None:
            log_warn("ffmpeg_in died, restarting full pipeline...")
            break
        if uimain_proc.poll() is not None:
            log_warn("uimain died, restarting full pipeline...")
            break
        if ffmpeg_out_proc.poll() is not None:
            log_warn("ffmpeg_out died, restarting full pipeline...")
            break
        time.sleep(1)

    # ---- 5) Clean up before next cycle ----
    log_info("Cleaning up current pipeline cycle...")
    for p in (uimain_proc, ffmpeg_out_proc, ffmpeg_in_proc):
        kill_proc(p)

    ffmpeg_in_proc = None
    ffmpeg_out_proc = None
    uimain_proc = None

# ========= MAIN =========

def main():
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    start_health_server()

    log_info(f"CAMERA_RTSP={CAMERA_RTSP}")
    log_info(f"OUTPUT_RTSP={OUTPUT_RTSP}")
    log_info(f"UIMAIN_OUTPUT_PORT={UIMAIN_OUTPUT_PORT}")

    # Outer supervisor loop: keep restarting cycles until we get a signal
    while not stop_all:
        log_info("===== NEW PIPELINE CYCLE =====")
        run_pipeline_cycle()
        if stop_all:
            break
        log_warn("Pipeline cycle ended, restarting in 5s...")
        time.sleep(5)

    log_info("Exiting main loop.")

if __name__ == "__main__":
    main()
