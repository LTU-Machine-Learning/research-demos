---
title: Project Overview — Intentions and Constraints
description: Design goals, constraints, and guiding principles behind the Vision Hub platform.
---

## Purpose of the Project

Vision Hub was designed as a **technical demonstration platform** for real-time AI systems, not as a monolithic application or a single-purpose service.

Its primary goal is to provide a unified environment capable of:
- hosting heterogeneous AI demos,
- exposing them through a single web interface,
- operating under real-time and resource constraints,
- remaining deployable across distributed infrastructure.

The platform prioritizes **clarity of architecture**, **runtime efficiency**, and **operational control** over feature completeness.

---

## Target Use Cases

Vision Hub targets the following use cases:

- Live demonstrations of computer vision models (object detection, pose estimation, OCR).
- Interactive AI demos requiring real-time visual feedback.
- Controlled execution of GPU workloads in shared environments.
- Academic or research-oriented presentations where infrastructure transparency matters.

It is **not** designed as:
- a multi-tenant production SaaS,
- a long-running inference backend,
- a user-facing consumer application.

---

## Core Constraints

### Real-time interaction
Several demos rely on live video input and immediate visual feedback.  
End-to-end latency must remain low enough to preserve user interaction quality.

This constraint directly impacts:
- video encoding choices,
- pipeline topology,
- frontend/backend responsibilities.

---

### Limited and shared GPU resources
GPU resources are:
- hosted remotely,
- shared across multiple services,
- expensive to keep idle.

As a result:
- demos are instantiated on demand,
- no GPU workload runs permanently,
- lifecycle management is a first-class concern.

---

### Distributed deployment
The frontend and backend do not necessarily run on the same physical machine.

This implies:
- explicit network design,
- strict separation of responsibilities,
- avoidance of implicit localhost assumptions.

The platform must behave consistently across local and remote nodes.

---

### User consent and privacy
Some demos rely on live camera input.  
User consent must therefore be:
- explicit,
- temporary,
- revocable.

Consent handling is enforced at the orchestration level rather than embedded in individual demos.

---

## Design Intentions

### Modular demos
Each demo is:
- self-contained,
- packaged as a Docker service,
- startable and stoppable independently.

No demo assumes the presence or state of another.

---

### Centralized orchestration
All demo lifecycle operations are routed through a single control API.

This enables:
- consistent state management,
- controlled access to infrastructure,
- simplified frontend logic.

Details are provided in  
→ [Control API architecture](/docs/api/overview)

---

### Separation of video and inference
Inference services never output video streams.  
They emit structured metadata only.

Video handling is centralized and shared.

This architectural decision is critical for latency control and scalability, and is detailed in  
→ [Video pipeline design](/docs/video/overview)

---

### Infrastructure transparency
The platform is intentionally not abstracted behind opaque tooling.

Key infrastructure elements (containers, networks, services) remain:
- observable,
- debuggable,
- documented.

This is a deliberate choice aligned with the educational and demonstrative nature of the project.

---

## Project Scope and Evolution

Vision Hub evolved from a local, Compose-based prototype to a distributed Swarm-based system.

Earlier architectural stages are documented in  
→ [Technical decisions and evolution](/docs/projects/decisions)

The current design reflects accumulated constraints rather than theoretical optimality.

---

## Next sections

- [Global architecture](/docs/architecture/global)
- [Frontend architecture](/docs/frontend)
- [Control API design](/docs/api)
