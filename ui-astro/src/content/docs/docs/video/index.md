---
title: Video
description: "Single camera → MediaMTX fan-out (RTSP + WHEP/WebRTC) → overlays out-of-band (WS)."
---

## Model

A single physical camera is captured once and published to **MediaMTX**. Consumers subscribe to MediaMTX:
- browser playback via **WHEP/WebRTC**,
- demo services via **RTSP**.

AI overlays (boxes / keypoints) are transported **out-of-band** via WebSocket from the demo containers.

## Components

### Capture (local container, not a Swarm service)

Location: `capture/` (`capture/Dockerfile`, `capture/entrypoint.sh`)

- reads V4L2 (`CAMERA_DEVICE`, default `/dev/video0`)
- encodes low-latency H.264 (baseline, no B-frames)
- publishes to MediaMTX: `rtsp://mediamtx:8554/cam` (via `RTSP_URL`)

Operational: managed by the orchestrator as `CAPTURE_NAME=vision-hub-capture`.

### MediaMTX (Swarm service)

Config: `mediamtx/mediamtx.yml` (bind-mounted by `stack.yml`)

- RTSP in/out (publish + play)
- WHEP/WebRTC for browsers
- fan-out redistribution (single publisher → multiple consumers)

## Ports (stack.yml)

MediaMTX:
- 8554/tcp (RTSP)
- 8889/tcp (WHEP/WHIP HTTP)
- 8189/udp (WebRTC transport; MediaMTX v1.15.x single UDP port)
- 8189/tcp (temporary debug)

## Paths

MediaMTX accepts any publisher path (`paths.all.source: publisher`).

In Vision Hub:
- `cam` (raw camera stream from capture)
- `chang_annot` (annotated output from Chang demo pipeline)

Optional paths (demo-dependent):
- `annot` (YOLO annotated RTSP output)
- `pose_annot` (Pose annotated RTSP output)

## Browser endpoints (WHEP)

WHEP endpoint form:
- `http://<mediamtx-host>:8889/<path>/whep`

Examples:
- `http://192.168.10.2:8889/cam/whep`
- `http://192.168.10.2:8889/chang_annot/whep`

## Overlay separation

Video transport:
- capture → MediaMTX (RTSP publish)
- browser ↔ MediaMTX (WHEP/WebRTC)
- demos ← MediaMTX (RTSP read)

Metadata overlays:
- YOLO boxes: WS from YOLO container (`/ws/dets`)
- Pose keypoints: WS from Pose container (`/ws/pose`)
- Chang: WS disabled by default (video already annotated)

## WebRTC ICE candidate selection

ICE candidates are constrained by `webrtcIPsFromInterfacesList` + `webrtcAdditionalHosts` in `mediamtx/mediamtx.yml` to avoid advertising docker bridges / loopback.

## Related pages

- /docs/infrastructure/network
- /docs/infrastructure/swarm
- /docs/frontend
- /docs/demos/yolo
- /docs/demos/pose
- /docs/demos/chang