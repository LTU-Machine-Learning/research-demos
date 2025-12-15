---
title: Global Architecture
description: System-level architecture of Vision Hub: components, responsibilities, and control/video flows.
---

## Architectural Overview

Vision Hub is a distributed, container-based platform where each major responsibility is isolated into a dedicated component:

1. Frontend (Astro UI)
2. Control API (FastAPI orchestrator)
3. Runtime backend (Docker Swarm services)
4. Connectivity layer (virtual LAN + Swarm overlay networking)

The goal is a predictable, low-latency demo runtime with explicit boundaries between UI, orchestration, media transport, and inference.

---

## Component Responsibilities

### Frontend application (Astro)

Responsibilities:
- navigation and documentation pages,
- demo selection and activation UX,
- live visualization (WebRTC/WHEP video + overlay metadata),
- consent UX (camera-based demos).

Non-responsibilities:
- no inference execution,
- no Docker access,
- no direct scaling/placement decisions.

Related: /docs/frontend

---

### Control API (FastAPI)

The control API is the single orchestration authority.

Responsibilities:
- demo registry (mapping demo id → Swarm service + dependencies),
- lifecycle endpoints (start/stop/status/heartbeat),
- consent tokens (short-lived JWT) to gate camera-based actions,
- shared dependency coordination (MediaMTX + capture).

Non-responsibilities:
- no video processing,
- no inference,
- no UI.

Related: /docs/api

---

### Runtime backend (Docker Swarm)

The backend runs all runtime services as containers (Swarm services for most workloads, plus a local-only capture container on the frontend node).

Properties:
- demos are scaled to 0 by default and started on demand,
- GPU placement is enforced by Swarm node labels/constraints,
- services communicate over a common Swarm overlay network (vision-hub-net).

Related: /docs/infrastructure/swarm

---

### Connectivity layer (virtual LAN)

Nodes may be physically remote. Vision Hub assumes a “LAN-like” addressing model across nodes to keep service endpoints stable.

In practice:
- a virtual LAN (ZeroTier) is used to provide private, routable node-to-node connectivity,
- Swarm’s overlay network provides service discovery (DNS) and east-west traffic between services.

Important: the project is designed so most internal links are expressed as if all components were on the same LAN (initially developed on localhost / 192.168.10.0/24), then extended to remote nodes via ZeroTier without rewriting the application logic.

Related: /docs/infrastructure/network

---

## Control Flow (demo lifecycle)

The control path is intentionally centralized:

1. Frontend calls the Control API (start/stop/status/heartbeat).
2. Control API scales Swarm services and coordinates shared deps.
3. Frontend only consumes resulting endpoints (video stream + overlay WS).

The frontend never interacts directly with Docker or Swarm.

---

## Video and Inference Flow

Vision Hub separates video transport from inference output:

- one camera feed is captured once and published to MediaMTX,
- demos subscribe to the same source stream as input,
- inference results are emitted as metadata (WebSocket payloads),
- the frontend renders overlays on top of the live video.

This keeps video transport stable while allowing demos to change independently.

Related: /docs/video

---

## Architectural Boundaries

Enforced boundaries:
- UI cannot access Docker (only the API can).
- Demos do not depend on each other.
- Inference services do not own global video distribution (MediaMTX does).
- Network topology is externalized (virtual LAN + Swarm overlay), not hardcoded into the UI logic.

---

## Related pages

- /docs/frontend
- /docs/api
- /docs/video
- /docs/infrastructure/swarm
- /docs/infrastructure/network
- /docs/demos