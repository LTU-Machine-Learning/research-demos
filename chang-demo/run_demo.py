#!/usr/bin/env python3
import os
import subprocess
import signal
import sys
import time

# RTSP from mediamtx (Vision Hub input)
CAMERA_RTSP = os.getenv("CAMERA_RTSP", "rtsp://mediamtx:8554/cam")

# ffmpeg writes to this
UDP_IN_URL = "udp://127.0.0.1:12345"

# uimain reads this (simple URL for OpenCV)
UIMAIN_INPUT = "udp://127.0.0.1:12345"

# Port where uimain outputs (we assume this from its CLI, default 12346)
UIMAIN_OUTPUT_PORT = os.getenv("UIMAIN_OUTPUT_PORT", "12346")
UDP_OUT_URL = f"udp://127.0.0.1:{UIMAIN_OUTPUT_PORT}?fifo_size=5000000&overrun_nonfatal=1"

# RTSP endpoint to publish annotated output back to mediamtx
OUTPUT_RTSP = os.getenv("OUTPUT_RTSP", "rtsp://mediamtx:8554/chang_annot")

# Paths for uimain
UIMAIN_WORKDIR = "/root/project_nep/cside"
UIMAIN_MODEL = "backends/yolov8-onnx-cpp/checkpoints/yolov8n-pose.onnx"

ffmpeg_in_proc = None
ffmpeg_out_proc = None
uimain_proc = None


def start_ffmpeg_in():
    """RTSP (mediamtx) -> UDP 127.0.0.1:12345"""
    global ffmpeg_in_proc
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
        UDP_IN_URL,
    ]
    print("[chang-demo] ffmpeg_in:", " ".join(cmd), flush=True)
    ffmpeg_in_proc = subprocess.Popen(cmd)


def start_uimain():
    """uimain: UDP in -> annotated output on UDP_OUT_PORT"""
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
    uimain_proc = subprocess.Popen(cmd)


def start_ffmpeg_out():
    """UDP from uimain -> RTSP to mediamtx"""
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


def shutdown(signum, frame):
    print(f"[chang-demo] Caught signal {signum}, shutting down...", flush=True)
    global ffmpeg_in_proc, ffmpeg_out_proc, uimain_proc

    procs = [uimain_proc, ffmpeg_out_proc, ffmpeg_in_proc]
    for p in procs:
        if p and p.poll() is None:
            p.terminate()
    time.sleep(2)
    for p in procs:
        if p and p.poll() is None:
            p.kill()

    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"[chang-demo] CAMERA_RTSP={CAMERA_RTSP}", flush=True)
    print(f"[chang-demo] OUTPUT_RTSP={OUTPUT_RTSP}", flush=True)
    print(f"[chang-demo] UIMAIN_OUTPUT_PORT={UIMAIN_OUTPUT_PORT}", flush=True)

    # 1) start input ffmpeg
    start_ffmpeg_in()
    time.sleep(2)

    # 2) start uimain
    start_uimain()
    time.sleep(2)

    # 3) start output ffmpeg
    start_ffmpeg_out()

    # Wait for uimain; if it exits, we exit -> Swarm will restart us
    exit_code = uimain_proc.wait()
    print(f"[chang-demo] uimain exited with code {exit_code}", flush=True)

    # Cleanup
    shutdown(signal.SIGTERM, None)


if __name__ == "__main__":
    main()
