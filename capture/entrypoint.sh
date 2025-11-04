#!/usr/bin/env bash
set -Eeuo pipefail

: "${CAMERA_DEVICE:?Set CAMERA_DEVICE (e.g. /dev/video10)}"
: "${RTSP_URL:?Set RTSP_URL (e.g. rtsp://mediamtx:8554/cam-capture)}"

CAMERA_FORMAT="${CAMERA_FORMAT:-mjpeg}"
CAMERA_FPS="${CAMERA_FPS:-30}"
CAMERA_SIZE="${CAMERA_SIZE:-1280x720}"
CAMERA_OUTPUT="${CAMERA_OUTPUT:-libx264}"
RTSP_TRANSPORT="${RTSP_TRANSPORT:-tcp}"

if [[ ! -e "$CAMERA_DEVICE" ]]; then
  echo "[capture] device not found: $CAMERA_DEVICE" >&2
  sleep 3
  exit 1
fi

echo "[capture] using device=${CAMERA_DEVICE} fmt=${CAMERA_FORMAT} fps=${CAMERA_FPS} size=${CAMERA_SIZE} enc=${CAMERA_OUTPUT} -> ${RTSP_URL} (${RTSP_TRANSPORT})"

args=(
  -hide_banner -loglevel error
  -fflags +discardcorrupt+nobuffer
  -err_detect ignore_err
  -flags low_delay
  -thread_queue_size 64
  -use_wallclock_as_timestamps 1
  -analyzeduration 0
  -probesize 32k
  -f v4l2
  -input_format "$CAMERA_FORMAT"
  -framerate "$CAMERA_FPS"
  -video_size "$CAMERA_SIZE"
  -i "$CAMERA_DEVICE"
  -c:v "$CAMERA_OUTPUT"
  -pix_fmt yuv420p
  -profile:v baseline
  -tune zerolatency
  -preset veryfast
  -bf 0
  -g "$CAMERA_FPS"
  -keyint_min "$CAMERA_FPS"
  -x264-params "bframes=0:scenecut=0:rc-lookahead=0:ref=1"
  -f rtsp
  -rtsp_transport "$RTSP_TRANSPORT"
  -flush_packets 1
  -max_interleave_delta 0
  "$RTSP_URL"
)

# Log propre des args
printf '[capture] ffmpeg args: '; printf '%q ' "${args[@]}"; echo

exec ffmpeg "${args[@]}"
