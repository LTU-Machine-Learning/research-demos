docker rm -f vision-hub-capture

docker run -d \
  --name vision-hub-capture \
  --device /dev/video0:/dev/video10 \
  --network vision-hub-net \
  -e CAMERA_FPS=30 \
  -e CAMERA_SIZE=1280x720 \
  -e CAMERA_FORMAT=mjpeg \
  -e CAMERA_OUTPUT=libx264 \
  vision-hub-capture
