---
title: YOLO Pose – Pose Estimation Demo
description: RTSP ingest → YOLOv8-Pose inference → WebSocket keypoints (optional annotated outputs).
---

## Scope

This demo runs **YOLOv8-Pose** on a live RTSP feed and emits **pose keypoints** as WebSocket metadata for the frontend overlay renderer.

Code location:
- `pose/app.py`
- `pose/Dockerfile`
- `pose/requirements.txt`

Runtime is managed on-demand by the Control API (start/stop + idle shutdown).

---

## Interfaces

- WebSocket keypoints: `GET /ws/pose`
- Health/metrics: `GET /healthz`
- Optional MJPEG debug: `GET /video` (only if `DRAW_ON_VIDEO=1`)
- Optional RTSP republish: via `ANNOT_URL` (FFmpeg subprocess)

---

## Data path

1. **Input**: RTSP stream from MediaMTX (default `rtsp://mediamtx:8554/cam`) in `pose/app.py` (`RTSP_URL`).
2. **Decode**: PyAV with low-latency options + frame dropping (bounded queues).
3. **Inference**: Ultralytics YOLOv8-Pose on CPU or CUDA (FP16 when CUDA).
4. **Output (primary)**: JSON payloads broadcast over `/ws/pose` (no client→server messages expected).

---

## Environment-driven configuration

The process is configured entirely by environment variables (see `pose/app.py` top-level `os.getenv(...)` section).

Input / model:
- `RTSP_URL` (default `rtsp://mediamtx:8554/cam`)
- `MODEL` (default `yolov8n-pose.pt`)
- `CONF`, `IOU`, `MAX_DET`
- `FORCE_CPU` (set `1` to force CPU)

Output / debug:
- `FPS_OUT` (used for optional MJPEG pacing and RTSP publish cadence)
- `JPEG_QUALITY`
- `KP_THR` (keypoint confidence threshold applied during serialization)
- `DRAW_ON_VIDEO` (`1` enables drawing + MJPEG + RTSP publish path)

Optional RTSP republish:
- `ANNOT_URL` (default `rtsp://mediamtx:8554/pose_annot`)
- `RTSP_TRANSPORT` (`udp` or `tcp` for PyAV ingest + FFmpeg RTSP muxing)

Note: if you do not set `RTSP_URL`, the default points to the in-cluster MediaMTX service name (`mediamtx`) on port `8554`.

---

## Device selection & model loading

- CUDA is used when available and `FORCE_CPU=0`.
- FP16 is enabled when running on CUDA (`half=True`).
- cuDNN benchmark mode is enabled (`torch.backends.cudnn.benchmark = True`).

The demo logs whether CUDA is used and why (including exceptions captured during CUDA availability checks).

---

## RTSP ingest (PyAV)

The RTSP reader runs in the `grabber()` thread:
- opens the RTSP input using `AV_OPEN_OPTS` (low buffering / low delay),
- decodes frames to BGR,
- aggressively drops old frames when the queue is full (latency over completeness),
- retries with backoff on failures.

The decode stage and inference stage are decoupled by bounded queues (`frame_q`, `jpeg_q`).

---

## Pose serialization & WebSocket payload

Inference runs in `inferencer()`:
- frames are stride-cropped (`crop_to_stride(..., stride=32)`) to match model assumptions and avoid odd sizes,
- `model.predict(...)` is called under `torch.no_grad()`,
- keypoints are extracted from `r.keypoints`:
  - `xy` coordinates
  - optional per-keypoint confidence (`conf`)
- points are filtered:
  - NaN / inf discarded
  - `(0,0)` discarded
  - confidence below `KP_THR` discarded
- output is broadcast to all WebSocket clients.

Payload shape (as sent):
- `ts`: epoch ms
- `w`, `h`: frame dimensions used for coordinates
- `skeleton`: edge list (pairs of keypoint indices)
- `people`: list of `{ kpts: [...] }` where `kpts` contains 17 entries (each entry is `[x,y]` or `null`)

---

## Optional annotated outputs

### MJPEG (`/video`)
Enabled only if `DRAW_ON_VIDEO=1`:
- frames are JPEG-encoded with OpenCV (`cv2.imencode`)
- served as multipart MJPEG for debugging overlays.

### RTSP republish (`ANNOT_URL`)
If `ANNOT_URL` is set and `ffmpeg` is available in the container:
- frames (optionally with skeleton drawn) are pushed to an FFmpeg subprocess (`RtspPublisher`)
- encoding is configured for low latency (no B-frames, baseline profile, short GOP)
- output is published back to MediaMTX under the configured RTSP path.

---

## Health endpoint (`/healthz`)

`/healthz` returns a JSON snapshot of:
- frame ingest counters / timestamps,
- last detected people count,
- active WebSocket client count,
- whether the FFmpeg publisher is running,
- whether GPU is used,
- a best-effort TCP reachability probe to MediaMTX RTSP port.

This endpoint is intended for orchestrator readiness checks and the frontend debug panel.

---

## Related pages

- [Demos overview](/docs/demos)
- [YOLO boxes demo](/docs/demos/yolo)
- [Video transport](/docs/video)
- [Control API](/docs/api)
- [Swarm backend](/docs/infrastructure/swarm)