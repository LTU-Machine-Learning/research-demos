#!/usr/bin/env python3
import os
import subprocess
import signal
import sys
import time
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# RTSP from mediamtx (Vision Hub input)
CAMERA_RTSP = os.getenv("CAMERA_RTSP", "rtsp://192.168.10.2:8554/cam")

# ffmpeg writes to this
UDP_IN_URL = "udp://127.0.0.1:12345"

# uimain reads this
UIMAIN_INPUT = "udp://127.0.0.1:12345?fifo_size=5000000&overrun_nonfatal=1"

# Port where uimain outputs
UIMAIN_OUTPUT_PORT = os.getenv("UIMAIN_OUTPUT_PORT", "12346")
UDP_OUT_URL = f"udp://127.0.0.1:{UIMAIN_OUTPUT_PORT}?fifo_size=5000000&overrun_nonfatal=1"

# RTSP endpoint to publish annotated output back to mediamtx
OUTPUT_RTSP = os.getenv("OUTPUT_RTSP", "rtsp://192.168.10.2:8554/chang_annot")

# Paths for uimain
UIMAIN_WORKDIR = "/root/project_nep/cside"
UIMAIN_MODEL = "backends/yolov8-onnx-cpp/checkpoints/yolov8n-pose.onnx"

ffmpeg_in_proc = None
ffmpeg_out_proc = None
uimain_proc = None
stop_all = False
health_server = None  # <- important so shutdown() never sees an undefined name


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
    print("[chang-demo] ffmpeg_in:", " ".join(cmd), flush=True)
    ffmpeg_in_proc = subprocess.Popen(cmd)


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
    print("[chang-demo] uimain:", " ".join(cmd), flush=True)
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
    print("[chang-demo] ffmpeg_out:", " ".join(cmd), flush=True)
    ffmpeg_out_proc = subprocess.Popen(cmd)


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


def shutdown(signum, frame):
    print(f"[chang-demo] Caught signal {signum}, shutting down...", flush=True)
    global ffmpeg_in_proc, ffmpeg_out_proc, uimain_proc, health_server

    # Use kill_proc helper for all three
    for p in (uimain_proc, ffmpeg_out_proc, ffmpeg_in_proc):
        kill_proc(p)

    if health_server is not None:
        try:
            health_server.shutdown()
        except Exception:
            pass
        health_server = None

    sys.exit(0)


def watch_uimain(proc, ready_flag, failed_flag, timeout_s=10):
    """
    Read uimain logs:
      - If we see 'ERROR: Could not open video stream', mark failed.
      - If we see 'image:' or 'Speed:' lines, mark ready.
    """
    t_start = time.time()
    for line in proc.stdout:
        sys.stdout.write("[uimain] " + line)
        sys.stdout.flush()

        if "ERROR: Could not open video stream" in line:
            failed_flag["v"] = True
            break

        # Heuristic: these only appear when frames are actually processed
        if "image:" in line or "Speed:" in line:
            ready_flag["v"] = True

        if time.time() - t_start > timeout_s and not ready_flag["v"]:
            # Took too long to become ready → treat as failed start
            failed_flag["v"] = True
            break

    # If the process exits very quickly without ever becoming ready → failed
    proc.wait()
    if not ready_flag["v"] and (time.time() - t_start) < timeout_s:
        failed_flag["v"] = True


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
    print(f"[chang-demo] health server listening on 0.0.0.0:{port}/healthz", flush=True)


def main():
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # start HTTP /healthz in the background
    start_health_server()

    print(f"[chang-demo] CAMERA_RTSP={CAMERA_RTSP}", flush=True)
    print(f"[chang-demo] OUTPUT_RTSP={OUTPUT_RTSP}", flush=True)
    print(f"[chang-demo] UIMAIN_OUTPUT_PORT={UIMAIN_OUTPUT_PORT}", flush=True)

    global ffmpeg_in_proc, ffmpeg_out_proc, uimain_proc

    # 1) Start ffmpeg_in once
    start_ffmpeg_in()
    time.sleep(2)

    # 2) Loop until uimain starts in "good" mode
    while not stop_all:
        ready = {"v": False}
        failed = {"v": False}

        proc = start_uimain()
        t = threading.Thread(target=watch_uimain, args=(proc, ready, failed), daemon=True)
        t.start()

        # Wait until either ready or failed
        while not (ready["v"] or failed["v"]) and proc.poll() is None and not stop_all:
            time.sleep(0.2)

        if ready["v"]:
            print("[chang-demo] uimain is READY, starting ffmpeg_out", flush=True)
            uimain_proc = proc
            break  # leave the loop, go publish
        else:
            print("[chang-demo] uimain FAILED to start correctly, retrying...", flush=True)
            kill_proc(proc)
            time.sleep(1)

    if stop_all:
        shutdown(signal.SIGTERM, None)
        return

    # 3) Start ffmpeg_out only once uimain is healthy
    start_ffmpeg_out()

    # 4) Wait for uimain to end; if it dies, we stop everything
    exit_code = uimain_proc.wait()
    print(f"[chang-demo] uimain exited with code {exit_code}", flush=True)
    shutdown(signal.SIGTERM, None)


if __name__ == "__main__":
    main()
