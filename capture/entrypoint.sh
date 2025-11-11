#!/usr/bin/env bash
set -Eeuo pipefail

: "${CAMERA_DEVICE:?Set CAMERA_DEVICE (e.g. /dev/video10)}"
: "${RTSP_URL:?Set RTSP_URL (e.g. rtsp://mediamtx:8554/cam)}"

CAMERA_FORMAT="${CAMERA_FORMAT:-mjpeg}"
CAMERA_FPS="${CAMERA_FPS:-30}"
CAMERA_SIZE="${CAMERA_SIZE:-1280x720}"
CAMERA_OUTPUT="${CAMERA_OUTPUT:-libx264}"

# ➜ UDP par défaut (changer en "tcp" si besoin)
RTSP_TRANSPORT="${RTSP_TRANSPORT:-udp}"

# H.264 “low latency”
X264_PARAMS="${X264_PARAMS:-bframes=0:scenecut=0:rc-lookahead=0:ref=1}"

if [[ ! -e "$CAMERA_DEVICE" ]]; then
  echo "[capture] device not found: $CAMERA_DEVICE" >&2
  sleep 3
  exit 1
fi

echo "[capture] device=${CAMERA_DEVICE} fmt=${CAMERA_FORMAT} fps=${CAMERA_FPS} size=${CAMERA_SIZE} enc=${CAMERA_OUTPUT} -> ${RTSP_URL} (${RTSP_TRANSPORT})"

args=(
  -hide_banner -loglevel error

  # ↓ réduire la latence d'entrée
  -fflags +discardcorrupt+nobuffer
  -err_detect ignore_err
  -flags low_delay
  -thread_queue_size 64
  -use_wallclock_as_timestamps 1
  -analyzeduration 0
  -probesize 32k

  # Source webcam
  -f v4l2
  -input_format "$CAMERA_FORMAT"
  -framerate "$CAMERA_FPS"
  -video_size "$CAMERA_SIZE"
  -i "$CAMERA_DEVICE"
)

# Encodage vidéo
enc=(
  -c:v "$CAMERA_OUTPUT"
  -pix_fmt yuv420p
  -profile:v baseline
  -tune zerolatency
  -preset veryfast
  -bf 0
  -g "$CAMERA_FPS"
  -keyint_min "$CAMERA_FPS"
)

# Sortie RTSP (UDP/TCP selon RTSP_TRANSPORT)
out=(
  -f rtsp
  -rtsp_transport "$RTSP_TRANSPORT"
  -flush_packets 1
  -max_interleave_delta 0
  -muxdelay 0 -muxpreload 0
  -reorder_queue_size 0
  "$RTSP_URL"
)

# Ajuste x264 params si libx264
if [[ "$CAMERA_OUTPUT" == "libx264" ]]; then
  enc+=(-x264-params "$X264_PARAMS")
fi

printf '[capture] ffmpeg args: '
printf '%q ' "${args[@]}" "${enc[@]}" "${out[@]}"; echo

# Boucle de reconnexion automatique
while true; do
  # Print a marker with timestamp at each start
  echo "[capture] $(date +'%F %T') starting ffmpeg …"
  stdbuf -oL -eL ffmpeg "${args[@]}" "${enc[@]}" "${out[@]}" \
    2> >(awk '{ print strftime("[ffmpeg %F %T]"), $0; fflush() }')
  rc=$?
  echo "[capture] $(date +'%F %T') ffmpeg exited ($rc), retrying in 3s..."
  sleep 3
done
