---
title: Chang Demo – Cross-platform Detection Pipeline
description: External demo showcasing model distillation and deployment across heterogeneous hardware targets.
---

## Overview

The **Chang demo** is an externally developed demonstration integrated into Vision Hub as-is.  
It showcases a **cross-platform object detection deployment pipeline**, focusing on **model distillation and portability** rather than real-time overlay metadata.

This demo is **not authored nor maintained** within the Vision Hub project.

Primary author and maintainer:  
**Chang Liu** — `chang.liu@ltu.se`

---

## Objective

The main objective of this demo is to:

- distill detection models into lightweight YOLO variants,
- export them to portable runtimes (ONNX / Hailo),
- deploy the same inference pipeline across heterogeneous hardware targets.

This demo is primarily concerned with **deployment feasibility**, not frontend interaction or overlay composition.

---

## High-level pipeline

The pipeline can be summarized as:

Detection models
→ distilled into YOLO variants
→ exported to ONNX / Hailo formats
→ executed via C++ / Qt inference runtime
→ deployed to heterogeneous targets


Target platforms include:
- x86 (CPU / CUDA),
- Intel iGPU (OpenVINO),
- mobile platforms,
- embedded accelerators (Hailo-8L, Raspberry Pi).

A high-level architectural overview is provided by the author (see accompanying presentation).

---

## Integration within Vision Hub

Within Vision Hub, this demo is treated as a **black-box service**.

Location:
- `chang-demo/run_demo.py`
- `chang-demo/Dockerfile`

Vision Hub:
- does **not** interact with the internal inference logic,
- only supervises container lifecycle,
- exposes health status and annotated RTSP output.

---

## Runtime orchestration model

The container acts as a **process supervisor** coordinating three subprocesses:

1. **ffmpeg_in**  
   RTSP input from MediaMTX → local UDP stream  

2. **uimain (C++ / Qt)**  
   ONNX-based inference binary  

3. **ffmpeg_out**  
   UDP output → RTSP annotated stream back to MediaMTX  

The pipeline is restarted automatically if **any subprocess exits**.

---

## Video handling characteristics

Key design choices:

- **No re-encoding on input**  
  RTSP input is passed through as MPEG-TS (`-c:v copy`) to minimize latency.

- **UDP used internally**  
  Local UDP is used between processes to decouple inference from transport.

- **Annotated RTSP output**  
  Final output is H.264 encoded and republished to MediaMTX.

This design prioritizes **robustness and portability** over minimal end-to-end latency.

---

## Health monitoring

The demo exposes a minimal health endpoint:

- `GET /healthz` (port `7000`)

Health is considered **OK** only if:
- `ffmpeg_in` is running,
- `uimain` is running,
- `ffmpeg_out` is running.

This endpoint is used directly by:
- Docker healthchecks,
- Vision Hub orchestration API.

---

## Failure handling & restart logic

The container implements a **supervised execution loop**:

- infinite retry on startup failures,
- log-based readiness detection for `uimain`,
- full pipeline teardown and restart on any process crash.

This makes the demo resilient to:
- RTSP interruptions,
- inference crashes,
- transient MediaMTX failures.

---

## Frontend interaction

Unlike other Vision Hub demos:

- no WebSocket metadata is emitted,
- no structured overlay data is exposed,
- frontend consumes only the **annotated RTSP stream**.

As a result:
- this demo bypasses the standard overlay architecture,
- integration is video-only.

---

## Design rationale (author-provided)

According to the demo author:

- **YOLO + ONNX Runtime** were chosen for platform agnosticism,
- **C++ / Qt** enables deployment on constrained or embedded targets,
- inference backends can be swapped without rewriting application logic.

Vision Hub does not modify or reinterpret these design choices.

---

## Scope disclaimer

Vision Hub:
- does not maintain the inference code,
- does not validate model accuracy,
- does not control training or distillation procedures.

For internal model design, performance, or portability details, please contact:  
**chang.liu@ltu.se**

---

## Related documentation

- `/docs/demos/yolo`
- `/docs/demos/pose`
- `/docs/video`
- `/docs/infrastructure/swarm`
