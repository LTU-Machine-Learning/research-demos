# Nettoyage si besoin
docker rm -f vision-hub-capture 2>/dev/null || true

# Exemple avec by-id -> /dev/video10
docker run -d \
  --name vision-hub-capture \
  --restart unless-stopped \
  --network vision-hub-net \
  --device /dev/v4l/by-id/usb-Vimicro_Corp._Lenovo_FHD_Webcam_Lenovo_FHD_Webcam_Audio-video-index0:/dev/video10 \
  -e CAMERA_DEVICE=/dev/video10 \
  -e CAMERA_FORMAT=mjpeg \
  -e CAMERA_FPS=30 \
  -e CAMERA_SIZE=1280x720 \
  -e CAMERA_OUTPUT=libx264 \
  -e RTSP_TRANSPORT=udp \
  -e RTSP_URL=rtsp://mediamtx:8554/cam \
  vision-hub-capture:local
