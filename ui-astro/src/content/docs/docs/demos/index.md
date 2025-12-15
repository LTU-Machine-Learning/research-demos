---
title: Backend Demos
description: Overview of backend demo workloads and their execution model within Vision Hub.
---

## What is a demo?

In Vision Hub, a **demo** is a self-contained backend workload exposing a single capability through a controlled execution model.

From the platform’s perspective, a demo is:
- packaged as a Docker image / Swarm service,
- started/stopped **on demand** by the Control API,
- connected to shared infrastructure (MediaMTX, capture) only when required,
- observable via health endpoints and runtime logs.

A demo is a backend execution unit managed by orchestration logic (it is not “a frontend feature”).

---

## Common execution model

All demos follow the same lifecycle:

1. Frontend requests startup via the Control API.
2. Required dependencies are started if needed (MediaMTX, capture).
3. The demo service is scaled to `1` replica.
4. The frontend connects to the demo outputs (WS / HTTP / annotated stream).
5. Periodic heartbeats keep the demo alive while it is actively used.
6. The demo is stopped automatically when idle.

---

## Available demos

- **YOLO — Object detection**  
  Real-time object detection; emits bounding boxes over WebSocket.  
  → `/docs/demos/yolo`

- **Pose — Human pose estimation**  
  Emits 17-keypoint skeletons over WebSocket (optional annotated outputs).  
  → `/docs/demos/pose`

- **Price — House price estimation**  
  Structured-input ML inference exposed as HTTP endpoints (rework in progress).  
  → `/docs/demos/price`

- **Chang — Cross-platform model deployment (external contribution)**  
  Demo container authored outside this repository; see the page for the integration-level view and contact.  
  → `/docs/demos/chang`

---

## Related pages

- `/docs/api`
- `/docs/infrastructure/swarm`
- `/docs/video`