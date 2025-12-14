---
title: Global Architecture
description: High-level system architecture of the Vision Hub platform, including components, responsibilities, and data flows.
---

## Architectural Overview

Vision Hub is designed as a **distributed, service-oriented system** where each major responsibility is isolated into a dedicated component.  
The architecture prioritizes explicit boundaries, predictable data flows, and controlled interactions between subsystems.

At a high level, the platform is composed of four major layers:

1. **Frontend application**
2. **Control and orchestration API**
3. **Runtime backend (Docker Swarm)**
4. **Overlay network layer**

Each layer is independently deployable and replaceable.

---

## Component Responsibilities

### Frontend Application (Astro)

The frontend is a **pure client-facing application** responsible for:

- navigation and documentation pages,
- demo selection and activation,
- live visualization (video + overlays),
- user consent interaction.

The frontend:
- does **not** perform AI inference,
- does **not** manage infrastructure state,
- does **not** directly communicate with Docker or GPU resources.

All infrastructure interactions are delegated to the control API.

Detailed frontend responsibilities are described in  
→ [Frontend architecture](/docs/frontend)

---

### Control API

The control API acts as the **single orchestration authority** of the platform.

Its responsibilities include:
- maintaining a registry of available demos,
- managing demo lifecycle (start, stop, status),
- exposing health and heartbeat endpoints,
- handling user consent and short-lived tokens,
- acting as a controlled gateway to the Docker Swarm.

The API intentionally does not:
- process video streams,
- perform inference,
- expose low-level Docker internals to the frontend.

This separation ensures that infrastructure control remains centralized and auditable.

Further details are provided in  
→ [Control API design](/docs/api)

---

### Runtime Backend (Docker Swarm)

All runtime services are hosted inside a Docker Swarm cluster.

This includes:
- the video capture service,
- the media distribution service,
- AI demo services (GPU-bound or CPU-bound).

Key properties of the backend:
- no demo runs by default,
- services are started on demand,
- GPU scheduling is enforced at the Swarm level,
- services are isolated and stateless whenever possible.

The Swarm configuration defines:
- service placement constraints,
- resource limits,
- network attachments.

More details are provided in  
→ [Docker Swarm architecture](/docs/infrastructure/swarm)

---

### Overlay Network Layer

Frontend and backend nodes may be deployed on physically separate machines.  
To maintain a consistent execution model, Vision Hub relies on a **virtual overlay network**.

Characteristics:
- all nodes appear as part of the same logical LAN,
- fixed private IP addressing is used,
- Swarm services communicate without relying on public routing.

The overlay network enables:
- multi-node Swarm operation,
- remote GPU usage,
- transparent service discovery.

Primary connectivity is provided by ZeroTier.  
A secondary VPN solution (Headscale / Tailscale) is maintained for administrative access only.

Network design is detailed in  
→ [Network and connectivity](/docs/infrastructure/network)

---

## Data and Control Flows

### Control Flow (Lifecycle)

1. The user selects a demo from the frontend.
2. The frontend requests demo activation via the control API.
3. The API validates the request and triggers the corresponding Swarm service.
4. The frontend polls or subscribes to demo status updates.
5. When the demo is stopped, the API tears down the service.

The frontend never directly controls backend services.

---

### Video and Inference Flow

Vision Hub explicitly separates **video transport** from **inference output**.

- Video is captured once and distributed centrally.
- AI services subscribe to the video stream as input only.
- Inference results are emitted as structured metadata (e.g. bounding boxes, keypoints).
- The frontend overlays inference metadata on top of the live video stream.

This avoids:
- feedback loops,
- re-encoding latency,
- compounded processing delays.

The full pipeline is detailed in  
→ [Video pipeline](/docs/video)

---

## Architectural Boundaries

Several boundaries are strictly enforced:

- **Frontend ↔ Infrastructure**  
  No direct Docker or GPU access from the frontend.

- **Inference ↔ Video distribution**  
  AI services never emit video streams.

- **Demo ↔ Demo**  
  Demos are isolated and unaware of each other.

- **Network ↔ Application logic**  
  Network configuration is externalized and not embedded in application code.

These boundaries are intentional and central to the platform’s maintainability.

---

## Scalability and Limitations

The architecture supports:
- horizontal scaling of demos,
- controlled GPU sharing,
- addition of new demos without modifying existing ones.

However, the platform is not designed for:
- large-scale public exposure,
- untrusted multi-user environments,
- high-availability guarantees.

These limitations are a consequence of deliberate scope choices.

---

## Next sections

- [Frontend architecture](/docs/frontend)
- [Control API design](/docs/api)
- [Video pipeline](/docs/video)
- [Docker Swarm backend](/docs/infrastructure/swarm)
- [Network and connectivity](/docs/infrastructure/network)
