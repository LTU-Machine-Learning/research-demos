---
title: Vision Hub — Technical Documentation
description: Architecture, design decisions, and implementation details of the Vision Hub platform.
---

## Overview

Vision Hub is a modular, container-based platform designed to host and operate multiple real-time AI demonstrations from a single web interface.  
Its primary objective is to expose computer vision and machine learning demos in a **low-latency**, **resource-efficient**, and **on-demand** manner, while keeping the frontend lightweight and the backend scalable.

The platform is built around a clear separation of concerns:
- a **frontend web application** responsible for user interaction and visualization ([Frontend]( /docs/frontend/overview )),
- a **control API** responsible for orchestration ([API]( /docs/api/overview )),
- a **Docker Swarm backend** hosting compute-intensive services, including GPU-based inference ([Swarm]( /docs/infrastructure/swarm )).

No AI workload is executed directly on the frontend node.

---

## Core Design Principles

### On-demand execution
AI demos are **not running by default**.  
Each demo is instantiated as a Docker service and started only when explicitly requested by the frontend via the control API.

This design choice is detailed in the section  
→ [Demo lifecycle and orchestration](/docs/infrastructure/swarm#service-lifecycle)

---

### Low-latency video pipeline
Real-time interaction is a core constraint of the platform.  
To minimize latency:
- video capture is performed once, from a single source,
- the raw video stream is never re-encoded by AI services,
- inference results are transmitted separately as metadata overlays.

The full video architecture is described in  
→ [Video pipeline architecture](/docs/video/overview)

---

### Stateless frontend
The frontend does not maintain any persistent state related to demos or infrastructure.  
All runtime information (demo availability, status, consent, lifecycle) is retrieved from the API.

Frontend structure and responsibilities are detailed in  
→ [Frontend architecture](/docs/frontend/overview)

---

## High-Level Architecture

At a high level, Vision Hub is composed of the following elements:

- **Frontend (Astro)**  
  Web application responsible for navigation, visualization, and user interaction.  
  Displays live video streams and AI overlays, and triggers demo lifecycle actions via the API.  
  → [Frontend documentation](/docs/frontend/overview)

- **Control API**  
  Central orchestration component maintaining the registry of available demos and exposing lifecycle endpoints.  
  → [API documentation](/docs/api/overview)

- **Docker Swarm Backend**  
  Hosts all runtime services, including capture, media distribution, and AI demos.  
  → [Swarm architecture](/docs/infrastructure/swarm)

- **Overlay Network**  
  Virtual LAN interconnecting frontend and backend nodes.  
  → [Network and connectivity](/docs/infrastructure/network)

---

## Video and Data Flow

The platform relies on a centralized video distribution model:

1. A dedicated capture container acquires video from a local camera using FFmpeg.
2. The stream is forwarded to a media server responsible for protocol handling and redistribution.
3. AI services subscribe to the stream as input only.
4. Inference results are emitted through WebSocket connections.
5. The frontend overlays AI metadata on top of the live video stream.

A detailed breakdown of this pipeline is available in  
→ [Capture and MediaMTX pipeline](/docs/video/pipeline)

---

## Deployment Model

The frontend is typically deployed on a local demonstration machine, while GPU-enabled backend nodes are hosted remotely.  
All nodes are joined into a single Docker Swarm cluster and connected through an overlay network.

- Primary overlay network: ZeroTier  
- Backup administrative access: Headscale / Tailscale (SSH only)

Network design and rationale are detailed in  
→ [Network architecture](/docs/infrastructure/network)

---

## Scope of This Documentation

This documentation focuses on:
- architectural decisions and their rationale,
- internal component interactions,
- deployment and orchestration details,
- technical constraints and limitations.

It does **not** aim to be a step-by-step tutorial for end users, but rather a technical reference.

---

## Next sections

- [Project overview and constraints](/docs/projects)
- [Global architecture](/docs/architecture/global)
- [Frontend application](/docs/frontend)
- [Control API](/docs/api)
