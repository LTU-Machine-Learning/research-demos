#!/usr/bin/env python3
import os
import subprocess
import signal
import sys
import time

# RTSP from mediamtx (Vision Hub)
CAMERA_RTSP = os.getenv("CAMERA_RTSP", "rtsp://mediamtx:8554/cam")

# Local UDP endpoint expected by uimain
UDP_TARGET = "udp://127.0.0.1:12345?pkt_size=1316&reuse=1"
UIMAIN_INPUT = "udp://127.0.0.1:12345?fifo_size=5000000&overrun_nonfatal=1"

UIMAIN_WORKDIR = "/root/project_nep/cside"
UIMAIN_MODEL = "backends/yolov8-onnx-cpp/checkpoints/yolov8n-pose.onnx"

ffmpeg_proc = None
uimain_proc = None


def start_ffmpeg():
    global ffmpeg_proc
    cmd = [
        "ffmpeg",
        "-fflags", "nobuffer",
        "-flags", "low_delay",
        "-rtsp_transport", "udp",
        "-i", CAMERA_RTSP,
        "-map", "0:v:0",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-g", "30",
        "-keyint_min", "30",
        "-x264-params", "repeat-headers=1:scenecut=0:open_gop=0",
        "-f", "mpegts",
        "-mpegts_flags", "+resend_headers+initial_discontinuity",
        "-muxdelay", "0",
        "-muxpreload", "0",
        "-flush_packets", "1",
        UDP_TARGET,
    ]
    print("[chang-demo] Starting ffmpeg:", " ".join(cmd), flush=True)
    ffmpeg_proc = subprocess.Popen(cmd)


def start_uimain():
    global uimain_proc
    os.chdir(UIMAIN_WORKDIR)
    cmd = [
        "./uimain",
        "s",
        UIMAIN_MODEL,
        UIMAIN_INPUT,
        "12346",
    ]
    print("[chang-demo] Starting uimain:", " ".join(cmd), flush=True)
    uimain_proc = subprocess.Popen(cmd)


def shutdown(signum, frame):
    print(f"[chang-demo] Caught signal {signum}, shutting down...", flush=True)
    global ffmpeg_proc, uimain_proc

    if uimain_proc and uimain_proc.poll() is None:
        uimain_proc.terminate()
        try:
            uimain_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            uimain_proc.kill()

    if ffmpeg_proc and ffmpeg_proc.poll() is None:
        ffmpeg_proc.terminate()
        try:
            ffmpeg_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            ffmpeg_proc.kill()

    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"[chang-demo] CAMERA_RTSP={CAMERA_RTSP}", flush=True)

    start_ffmpeg()
    # small delay to let ffmpeg start pushing
    time.sleep(2)
    start_uimain()

    # Wait for uimain; if it exits, we exit (Swarm restart_policy can restart us)
    exit_code = uimain_proc.wait()
    print(f"[chang-demo] uimain exited with code {exit_code}", flush=True)

    if ffmpeg_proc and ffmpeg_proc.poll() is None:
        ffmpeg_proc.terminate()
        try:
            ffmpeg_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            ffmpeg_proc.kill()

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
