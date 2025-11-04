# --- Base image avec FFmpeg ---
FROM jrottenberg/ffmpeg:6.1-ubuntu

# --- Définir variables par défaut (personnalisables à l’exécution) ---
ENV CAMERA_DEVICE=/dev/video0 \
    CAMERA_FORMAT=mjpeg \
    CAMERA_FPS=30 \
    CAMERA_SIZE=1280x720 \
    CAMERA_OUTPUT=libx264

# --- Commande FFmpeg low-latency (même que dans ton docker-compose) ---
CMD ["-hide_banner", "-loglevel", "error",
     "-fflags", "+discardcorrupt+nobuffer",
     "-err_detect", "ignore_err",
     "-flags", "low_delay",
     "-thread_queue_size", "64",
     "-use_wallclock_as_timestamps", "1",
     "-f", "v4l2",
     "-input_format", "${CAMERA_FORMAT}",
     "-framerate", "${CAMERA_FPS}",
     "-video_size", "${CAMERA_SIZE}",
     "-i", "${CAMERA_DEVICE}",
     "-c:v", "${CAMERA_OUTPUT}",
     "-pix_fmt", "yuv420p",
     "-profile:v", "baseline",
     "-tune", "zerolatency",
     "-preset", "veryfast",
     "-bf", "0",
     "-g", "${CAMERA_FPS}",
     "-keyint_min", "${CAMERA_FPS}",
     "-x264-params", "bframes=0:scenecut=0:rc-lookahead=0:ref=1",
     "-f", "rtsp",
     "-rtsp_transport", "udp",
     "-flush_packets", "1",
     "-max_interleave_delta", "0",
     "rtsp://mediamtx:8554/cam"]
