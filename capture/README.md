docker rm -f vision-hub-capture

docker run -d \
  --name vision-hub-capture \
  --device /dev/video2:/dev/video10 \
  --network vision-hub-net \
  -e CAMERA_DEVICE=/dev/video10 \
  -e CAMERA_FORMAT=mjpeg \
  -e CAMERA_FPS=30 \
  -e CAMERA_SIZE=1280x720 \
  -e CAMERA_OUTPUT=libx264 \
  -e RTSP_URL=rtsp://mediamtx:8554/cam \
  vision-hub-capture


usb-Vimicro_Corp._Lenovo_FHD_Webcam_Lenovo_FHD_Webcam_Audio-video-index0
