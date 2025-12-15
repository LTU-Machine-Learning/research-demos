---
title: Infrastructure
description: Swarm topology, networking layers, and service placement for Vision Hub.
---

This section documents how Vision Hub is deployed in **Docker Swarm**, with a focus on:

- **Swarm topology** (nodes, labels, placement constraints)
- **Networking layers** (ZeroTier overlay vs Swarm overlay vs underlay)
- **Core services** (MediaMTX, Orchestrator API, UI, GPU demos, webcam capture)

## Pages

- **[Swarm](/docs/infrastructure/swarm)** — nodes, labels, placement constraints, how the stack is deployed.
- **[Network](/docs/infrastructure/network)** — network layers, exposed ports, RTSP/WebRTC flows, MTU/fragmentation considerations.

## Quick context

### Current Swarm nodes

From `docker node ls`:

- **B**: Swarm **manager** + *frontend* (`role=frontend`)
- **Ubuntu-22**: Swarm worker + **GPU backend** (`gpu=true`)
- **tomtom-feurlaptop**: client node (no placement labels)

### Service-to-service network (Swarm overlay)

The stack attaches services to an **external Swarm overlay** network:

- `networks.hub.name = vision-hub-net`
- Swarm DNS aliases are used for internal addressing (e.g., `mediamtx`, `yolo`, `pose`, ...)

> This `hub` network is **not** ZeroTier. It is the Docker Swarm overlay used for inter-service traffic.

## Related pages

- Swarm: /docs/infrastructure/swarm
- Network: /docs/infrastructure/network
