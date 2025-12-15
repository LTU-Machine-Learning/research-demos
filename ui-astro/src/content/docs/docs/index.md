---
title: Vision Hub — Technical Documentation
description: Architecture, design decisions, and implementation details of the Vision Hub platform.
---

## Overview

Vision Hub is a modular, container-based platform used to run multiple real-time AI demonstrations from a single web interface.

The platform is split into three main concerns:
- an **Astro frontend** for navigation and visualization ([Frontend](/docs/frontend)),
- a **control API** that orchestrates demo lifecycle ([API](/docs/api)),
- a **Docker Swarm backend** that hosts media + inference services ([Swarm](/docs/infrastructure/swarm)).

No AI workload runs on the frontend node.

---

## Core design principles

### On-demand execution
Demos are **not** running by default. Each demo is a Swarm service scaled up only when requested by the frontend through the control API.

See: [Service lifecycle](/docs/infrastructure/swarm#service-lifecycle)

### Low-latency video pipeline
A single capture source feeds a media relay (MediaMTX). Demos subscribe to the stream as input and emit inference results as metadata overlays.

See: [Video pipeline](/docs/video)

### Stateless frontend
The frontend holds no persistent infrastructure state; demo status and lifecycle are retrieved from the API.

See: [Frontend architecture](/docs/frontend)

---

## High-level architecture

- **Frontend (Astro)** — UI, live playback (WHEP/WebRTC), overlays, consent UX.
- **Control API** — demo registry + lifecycle endpoints (start/stop/status/heartbeat).
- **Swarm runtime** — MediaMTX, capture, inference demos, and auxiliary services.
- **Connectivity** — nodes joined into a single overlay network for service-to-service traffic.

See:
- [Architecture](/docs/architecture)
- [Network](/docs/infrastructure/network)

---

## Video and data flow

1. Capture container publishes the camera stream to MediaMTX (RTSP publish).
2. Browser consumes live video via WHEP/WebRTC (MediaMTX).
3. Inference services consume RTSP and emit metadata (WebSocket/HTTP).
4. Frontend renders overlays on top of the live stream.

See: [Video pipeline](/docs/video)

---

## Deployment model

- Swarm nodes are connected through **ZeroTier** to provide stable private-LAN semantics across hosts.
- Services communicate on the Swarm overlay network (`vision-hub-net`).

See: [Network architecture](/docs/infrastructure/network)

---

## Next sections

- [Projects (scope & constraints)](/docs/projects)
- [Architecture](/docs/architecture)
- [Demos catalog](/docs/demos)
- [Frontend](/docs/frontend)
- [Control API](/docs/api)
- [Swarm infrastructure](/docs/infrastructure/swarm)