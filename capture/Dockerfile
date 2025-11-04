FROM jrottenberg/ffmpeg:6.1-ubuntu

# Valeurs par défaut (surchageables avec -e)
ENV CAMERA_DEVICE=/dev/video0 \
    CAMERA_FORMAT=mjpeg \
    CAMERA_FPS=30 \
    CAMERA_SIZE=1280x720 \
    CAMERA_OUTPUT=libx264 \
    RTSP_URL=rtsp://mediamtx:8554/cam

# Copie de l'entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# On remplace l'ENTRYPOINT de l'image de base
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
