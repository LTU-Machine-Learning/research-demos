---
title: YOLO – Object Detection Demo
description: RTSP ingest → YOLOv8 inference → (WS boxes + optional annotated RTSP) in Vision Hub.
---

## Overview

The **YOLO demo** performs real-time object detection on the shared camera stream and emits **metadata overlays** for the frontend.

Repository location:
- `yolo/app.py`
- `yolo/Dockerfile`
- `yolo/requirements.txt`

Runtime outputs:
- **WebSocket** detections: `GET /ws/dets` (JSON boxes)
- **MJPEG** debug stream: `GET /video`
- **Optional annotated RTSP** publish: `ANNOT_URL` (RTSP path published back into MediaMTX)

This container does **not** serve WebRTC directly: WebRTC/WHEP is provided by **MediaMTX** from RTSP paths.

---

## Inputs / Outputs

### Input
- RTSP input stream from MediaMTX: `RTSP_URL` (default: `rtsp://mediamtx:8554/cam`)

### Outputs
- WebSocket boxes stream: `/ws/dets`
- MJPEG debug stream: `/video`
- RTSP annotated stream: `ANNOT_URL` (default: `rtsp://mediamtx:8554/annot`)

In Vision Hub, the **frontend** typically consumes:
- video via **WHEP** from MediaMTX (`:8889/<path>/whep`)
- boxes via **WebSocket** from this container (`:6002/ws/dets` in the current Swarm mapping)

---

## Runtime configuration

Configuration is environment-driven (see `yolo/app.py`):

### Stream endpoints
- `RTSP_URL` — input RTSP URL (MediaMTX)
- `ANNOT_URL` — output RTSP URL (publish annotated frames back to MediaMTX)

### Inference / output parameters
- `IMG_SIZE_X`, `IMG_SIZE_Y` — target inference resolution (cropped to stride internally)
- `CONF`, `IOU`, `MAX_DET` — detection thresholds and cap
- `FPS_OUT` — output framerate target for the annotated RTSP publisher
- `DRAW_LABELS` — enable drawing labels on annotated frames
- `JPEG_QUALITY` — MJPEG encoding quality

### Device selection
- `FORCE_CPU=1` disables CUDA even if available
- `MODEL` selects the Ultralytics model file (default: `yolov8n.pt`)

---

## Internal pipeline

### 1) RTSP ingest and decode
A dedicated **grabber thread** reads RTSP and decodes frames using **PyAV** with low-latency options:
- `rtsp_transport=udp`
- `fflags=nobuffer`, `flags=low_delay`
- minimal probe/analyze (`probesize`, `analyzeduration`)
- `reorder_queue_size=0`

The grabber drops older frames aggressively when the queue is full to keep latency bounded.

### 2) Inference and overlay payload
The **inferencer thread**:
- crops frames to a stride-aligned shape (YOLO stride = 32),
- runs `model.predict(...)` under `torch.no_grad()`,
- extracts boxes + class indices + confidences.

The WebSocket payload contains:
- `w`, `h` (frame dimensions)
- `boxes`: list of `{x1,y1,x2,y2, cls, conf}`

**Important:** `cls` is an integer class index. On the frontend, indices are mapped to names using:
- backend-provided labels (if any in the future), otherwise
- `public/scripts/overlay-classmap.js` (COCO fallback map), otherwise
- `#<cls>`.

### 3) Annotated RTSP publish (optional)
When `ANNOT_URL` is set, the container uses an FFmpeg subprocess to publish annotated frames as RTSP:
- H.264 `libx264`, `-tune zerolatency`
- no B-frames (`bframes=0`, `-bf 0`)
- short GOP (`keyint≈FPS_OUT`) to keep seek/latency reasonable

This stream becomes a MediaMTX path that the frontend can consume via WebRTC/WHEP.

### 4) MJPEG debug stream
`/video` serves the latest annotated frames as MJPEG:
- TurboJPEG is used if available (`PyTurboJPEG`)
- otherwise OpenCV `cv2.imencode(".jpg")` is used

This endpoint is intended for quick inspection, not for the main UI runtime.

---

## Service integration in Swarm

In the current Swarm stack:
- the demo is deployed as a Swarm service (`yolo`)
- it is GPU-scheduled via a node label constraint (`node.labels.gpu == true`)
- it is started/stopped on demand by the Control API

The Control API also ensures shared dependencies (MediaMTX + capture) are available before scaling the demo.

---

## Related pages

- [Demos overview](/docs/demos)
- [Pose demo](/docs/demos/pose)
- [Video pipeline](/docs/video)
- [Control API](/docs/api)
- [Swarm backend](/docs/infrastructure/swarm)