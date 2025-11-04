#!/usr/bin/env bash
set -euo pipefail

# Echo utile pour debug
echo "[capture] using device=${CAMERA_DEVICE} fmt=${CAMERA_FORMAT} fps=${CAMERA_FPS} size=${CAMERA_SIZE} enc=${CAMERA_OUTPUT} -> ${RTSP_URL}"

exec ffmpeg \
  -hide_banner -loglevel error \
  -fflags +discardcorrupt+nobuffer \
  -err_detect ignore_err \
  -flags low_delay \
  -thread_queue_size 64 \
  -use_wallclock_as_timestamps 1 \
  -f v4l2 \
  -input_format "${CAMERA_FORMAT}" \
  -framerate "${CAMERA_FPS}" \
  -video_size "${CAMERA_SIZE}" \
  -i "${CAMERA_DEVICE}" \
  -c:v "${CAMERA_OUTPUT}" \
  -pix_fmt yuv420p \
  -profile:v baseline \
  -tune zerolatency \
  -preset veryfast \
  -bf 0 \
  -g "${CAMERA_FPS}" \
  -keyint_min "${CAMERA_FPS}" \
  -x264-params "bframes=0:scenecut=0:rc-lookahead=0:ref=1" \
  -f rtsp \
  -rtsp_transport udp \
  -flush_packets 1 \
  -max_interleave_delta 0 \
  "${RTSP_URL}"
