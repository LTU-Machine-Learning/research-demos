FROM jrottenberg/ffmpeg:6.1-ubuntu

# Outils utiles (optionnels) pour debug cam
RUN apt-get update && apt-get install -y --no-install-recommends \
    v4l-utils tzdata && rm -rf /var/lib/apt/lists/*

ENV CAMERA_DEVICE=/dev/video0 \
    CAMERA_FORMAT=mjpeg \
    CAMERA_FPS=30 \
    CAMERA_SIZE=1280x720 \
    CAMERA_OUTPUT=libx264 \
    RTSP_URL=rtsp://mediamtx:8554/cam \
    RTSP_TRANSPORT=udp

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
