---
title: Swarm
description: How the Swarm cluster is structured and how the stack is deployed.
---

# Swarm

## Goal

Run Vision Hub on Docker Swarm, with a clear split between:

- **Frontend / control plane**: `ui-astro`, `mediamtx`, `api` (orchestrator)
- **GPU backend**: inference demos (`yolo`, `pose`, `chang-demo`) and (currently) `price-api`

Reference file: `stack.yml` at repository root.

---

## Cluster topology

### Nodes

From `docker node ls`:

- **B** — Swarm manager (Leader), labeled `role=frontend`
- **Ubuntu-22** — Swarm worker, labeled `gpu=true`
- **tomtom-feurlaptop** — client machine (no labels; not targeted by placements)

### Placement constraints

Services are placed using `deploy.placement.constraints` in `stack.yml`:

- `node.labels.role == frontend` → pin to **B**
- `node.labels.gpu == true` → pin to **Ubuntu-22**
- `node.role == manager` → ensures the orchestrator runs on a manager node (needs Swarm control)

---

## Deployment

### 1) Swarm overlay network (prerequisite)

`stack.yml` expects an **external** overlay network:

- `networks.hub.external: true`
- `networks.hub.name: vision-hub-net`

Create it once on the manager (**B**):

    docker network create -d overlay --attachable vision-hub-net

### 2) Deploy the stack

On **B** (manager):

    docker stack deploy -c stack.yml vision-hub

---

## Services (from stack.yml)

### Frontend node (B)

#### `mediamtx`
- Constraint: `node.labels.role == frontend`
- Ports:
  - `8554/tcp` — RTSP
  - `8889/tcp` — WHEP/WHIP HTTP
  - `8189/udp` — WebRTC (MediaMTX v1.15.3 single UDP port)
  - `8189/tcp` — temporary WebRTC/TCP (debug)
- Config bind-mount:
  - `/srv/vision-hub/mediamtx.yml:/mediamtx.yml:ro`

#### `ui-astro`
- Constraint: `node.labels.role == frontend`
- Port:
  - `4321/tcp`
- Update policy:
  - `update_config.order: start-first`

#### `api` (orchestrator)
- Constraints:
  - `node.labels.role == frontend`
  - `node.role == manager`
- Port:
  - `8090/tcp`
- Docker control:
  - `/var/run/docker.sock:/var/run/docker.sock`

The orchestrator is responsible for:
- scaling Swarm services (`yolo`, `pose`, `chang-demo`, `price-api`) up/down,
- managing the **local capture container** (`vision-hub-capture`) via Docker API.
  - Note: capture is intentionally treated as “local-only” (not deployed as a Swarm service).

---

### GPU backend node (Ubuntu-22)

#### `yolo`
- Constraint: `node.labels.gpu == true`
- Published port:
  - `6002/tcp` → container `6000`
- Exposes:
  - `/ws/dets` (WebSocket detections)
  - `/video` (MJPEG debug)
  - `/` (basic HTML landing page)

#### `pose`
- Constraint: `node.labels.gpu == true`
- Published port:
  - `6001/tcp` → container `6000`
- Exposes:
  - `/ws/pose` (WebSocket keypoints)
  - `/healthz` (JSON stats)
  - `/video` (MJPEG only when `DRAW_ON_VIDEO=1`)

#### `chang-demo`
- Constraint: `node.labels.gpu == true`
- Published port:
  - `7000/tcp` (health endpoint exposed by the supervisor script)
- Health:
  - `GET /healthz` returns **200** only if the 3-process chain is alive; **503** otherwise.

#### `price-api` (current deployment)
- Constraint: `node.labels.gpu == true` (GPU not required; pinned to the backend node for now)
- Published port:
  - `8080/tcp` → container `8080`
- Bind-mount:
  - `/srv/vision-hub/model:/app/model:ro`
- Healthcheck:
  - `curl -fsS http://127.0.0.1:8080/healthz`

---

## Update strategy

Most services use:

- `deploy.update_config.order: start-first`
- `deploy.restart_policy.condition: any`

This favors *minimizing visible downtime* when updating a single service image.

---

## Useful ops commands

List services / tasks:

    docker stack services vision-hub
    docker stack ps vision-hub

Inspect a service:

    docker service inspect vision-hub_yolo --pretty

Follow logs:

    docker service logs -f vision-hub_yolo
    docker service logs -f vision-hub_pose
    docker service logs -f vision-hub_chang-demo
    docker service logs -f vision-hub_mediamtx
    docker service logs -f vision-hub_api

Network inspection:

    docker network inspect vision-hub-net

---

## Related pages

- [Infrastructure overview](/docs/infrastructure)
- [Network](/docs/infrastructure/network)