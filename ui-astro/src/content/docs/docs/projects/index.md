---
title: Project Overview — Intentions and Constraints
description: Design goals, constraints, and guiding principles behind the Vision Hub platform.
---

## Purpose of the Project

Vision Hub is a **technical demonstration platform** for real-time AI systems, not a monolithic application.

It provides a unified environment to:
- host heterogeneous demos,
- expose them behind a single web UI,
- operate under latency + resource constraints,
- remain deployable across distributed nodes.

The platform prioritizes **architectural clarity**, **runtime efficiency**, and **operational control** over feature completeness.

---

## Target Use Cases

- Live demonstrations of CV/ML pipelines (object detection, pose estimation, OCR, tabular ML).
- Interactive demos requiring immediate visual feedback.
- Controlled execution of GPU workloads in shared environments.
- Academic / research-oriented presentations where infrastructure transparency matters.

Non-goals:
- multi-tenant production SaaS,
- long-running inference backend,
- consumer product UI.

---

## Core Constraints

### Real-time interaction
Several demos operate on live video input and require fast feedback. This drives:
- encoding / transport choices,
- pipeline topology (separation of video vs. inference metadata),
- strict split of responsibilities between frontend, API, and demos.

### Limited and shared GPU resources
GPU capacity is remote and expensive to keep idle. Therefore:
- demos are started on demand,
- idle teardown is mandatory,
- placement constraints (GPU node) are enforced at the orchestration layer.

### Distributed deployment
Frontend and GPU backend do not necessarily share a physical LAN. The system must:
- avoid implicit localhost assumptions,
- rely on explicit network primitives (overlay LAN),
- keep endpoints stable from the frontend perspective.

### Consent and privacy
Camera-based demos require explicit, temporary consent. Enforcement is handled by the orchestration API (not by individual demos) to keep the rule consistent.

---

## Design Intentions

### Modular demos
Each demo is a self-contained backend workload:
- packaged as a container/service,
- startable/stoppable independently,
- sharing only a small set of common dependencies (media proxy, capture).

### Centralized orchestration
Lifecycle operations (start/stop/status/idle) are routed through a single control plane (the Control API). This keeps:
- infrastructure access centralized,
- frontend logic thin,
- behavior consistent across demos.

### Separation of video and inference
Inference services emit **metadata** (boxes/keypoints), not processed video (except when explicitly republishing annotated RTSP for validation/debug).

Video distribution is centralized (MediaMTX), and the frontend applies overlays.

### Infrastructure transparency
The platform is intentionally debuggable:
- containers/services and their health endpoints remain visible,
- network design is documented,
- constraints are explicit (GPU placement, overlay network, ports).

---

## Related pages

- [Global architecture](/docs/architecture)
- [Control API](/docs/api)
- [Video pipeline](/docs/video)
- [Docker Swarm backend](/docs/infrastructure/swarm)
- [Network and connectivity](/docs/infrastructure/network)