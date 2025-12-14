---
title: Control API
description: FastAPI orchestrator for demo lifecycle, consent enforcement, and Docker Swarm control.
---

## Purpose

The Control API (FastAPI) is the **single orchestration authority** of Vision Hub.  
It is the only component allowed to interact with Docker (Swarm) and it exposes a small HTTP surface to:

- list demos and their running state,
- start/stop demos on demand,
- enforce **camera consent** using short-lived JWTs,
- reclaim resources automatically through an idle/heartbeat mechanism,
- coordinate shared services (MediaMTX, capture).

Related:
- [Global architecture](/docs/architecture)
- [Frontend architecture](/docs/frontend)
- [Projects: constraints](/docs/projets)

---

## Runtime Model

### Demo registry (static)
Demos are defined in an in-memory registry (`DEMOS`) containing, for each demo:
- `service`: Swarm service short name (scaled 0↔1)
- `health_url`: internal health probe URL (in-cluster DNS)
- `needs`: dependencies to start before the demo (e.g. `mediamtx`, `capture`)

Registered demos:
- `yolo` → service `yolo`, needs `mediamtx` + `capture`
- `pose` → service `pose`, needs `mediamtx` + `capture`
- `chang` → service `chang-demo`, needs `mediamtx` + `capture`
- `price` → service `price-api`, no shared deps

A small helper computes a browser-facing URL per demo (`_browser_url_for`) using:
- `PUBLIC_BASE_GPU` (GPU node / backend host)
- `PUBLIC_BASE_NO_GPU` (frontend / non-GPU host)

---

## Authentication

### Orchestrator token (required)
All non-public endpoints require an orchestrator token:
- `X-Token: <token>` header **or**
- `?token=<token>` query param

Token value is read from `ORCH_TOKEN` (default: `dev-token`).  
This token protects **infrastructure control**, not end-user identity.

---

## Consent Model (Camera / Recording)

### Consent issuance
`POST /consent?demo=<id|*>`

Returns a short-lived JWT:

- signed with `CONSENT_SECRET` (HS256),
- audience `CONSENT_AUD` (default: `vision-hub`),
- TTL `CONSENT_TTL_SECONDS` (default: 600s),
- scoped to a demo via the `demo` claim (`demo_id` or `*`).

Response shape:
- `token` (JWT)
- `expiresAt` (epoch ms, for browser storage)

### Consent enforcement
`POST /demos/{demo_id}/stop` requires:

- `X-Token` (orchestrator token)
- `X-Consent-Token` (consent JWT)

The API validates:
- signature + expiration,
- audience,
- demo scope (`claims.demo` must match `{demo_id}` or `*`).

This ensures demo shutdown actions are tied to explicit user consent flows.

---

## Lifecycle Endpoints (Overview)

### List demos
`GET /demos`

Returns, for each demo:
- `exists` (service exists in Swarm)
- `running` (at least one desired running task is actually running)
- `url` (browser URL derived from `_browser_url_for`)

### Demo status
`GET /demos/{demo_id}/status`

Same shape as above, but for a single demo.  
If a demo is running and no heartbeat exists yet, the API “adopts” it by setting an initial `_last_beat` entry (status-based adoption).

### Start demo
`POST /demos/{demo_id}/start?wait=1&timeout=90`

Behavior:
1. Auth (`X-Token`)
2. Start core services (`CORE = ["mediamtx"]`)
3. Start dependencies from `needs`:
   - `mediamtx` is scaled in Swarm
   - `capture` is managed locally (see below)
4. Scale the demo service to `1`
5. If `wait=1`, poll `health_url` until HTTP < 400 (or timeout)
6. Mark demo active (`_active_demos`) and set heartbeat time (`_last_beat`)
7. Ensure idle monitor is running + reconcile shared deps

Returns:
- `{ ok: true, id, url }`

### Stop demo
`POST /demos/{demo_id}/stop`

Behavior:
- auth + consent verification,
- scale demo service to `0`,
- remove heartbeat tracking,
- remove from `_active_demos`,
- schedule capture stop if needed,
- reconcile shared deps.

### Heartbeat
`POST /demos/{demo_id}/heartbeat`

Used by the frontend while a demo page is “active”.
- updates `_last_beat[demo_id]`,
- ensures idle monitor is running,
- keeps shared deps consistent.

---

## Idle / Auto-Stop Mechanism

A background thread (“idle-monitor”) checks periodically:

- if `now - lastBeat > IDLE_SECONDS` (default: 300s),
  then the demo service is scaled to `0`,
  heartbeat state is cleared,
  `_active_demos` is updated,
  capture stop may be scheduled.

This guarantees demos are not left running indefinitely when:
- users close the tab,
- the network disconnects,
- the UI crashes.

---

## Shared Dependencies

### MediaMTX (core service)
MediaMTX is managed as a Swarm service and is always started before camera-based demos.

### Capture (local-only container with hysteresis)
Capture is treated as `LOCAL_ONLY = {"capture"}` and is managed as a *container* (not a Swarm service) via Docker API.

To avoid flapping and stabilize the webcam pipeline, capture uses hysteresis:
- `CAPTURE_MIN_DOWN`: minimum time capture must stay stopped before restarting
- `CAPTURE_MIN_UP`: minimum time capture must stay running before it may be stopped
- `CAPTURE_IDLE_GRACE`: delay before stopping capture once no demos are active
- `CAPTURE_STARTUP_SETTLE`: small settle delay after starting

In practice:
- capture starts when the first demo requiring it starts,
- capture stops only after all demos become inactive and the grace timer expires,
- rapid start/stop cycles are avoided.

---

## Adoption on Startup

On API startup, an optional adoption step can detect already-running demo services:
- enabled by `ADOPT_ON_STARTUP=1`
- after `ADOPT_DELAY_SEC`, the API checks each demo service and initializes `_last_beat`
- this prevents the API from “forgetting” running workloads after a restart

---

## Debug Endpoints

The API exposes `/debug/*` routes (token-protected) intended for the frontend Debug panel.

Notable properties:
- no consent requirements (admin-style controls),
- can force scale demos up/down,
- can restart capture,
- can restart core services (MediaMTX),
- can soft-restart the stack (stop demos + restart core).

Key routes:
- `GET  /debug/demos`
- `POST /debug/demos/{id}/start|stop|restart`
- `POST /debug/capture/restart`
- `POST /debug/core/{name}/restart`
- `POST /debug/all/soft-restart`

---

## Environment Variables (Summary)

Security:
- `ORCH_TOKEN`
- `CONSENT_SECRET`, `CONSENT_TTL_SECONDS`, `CONSENT_AUD`

Networking / browser URL mapping:
- `PUBLIC_BASE_GPU`
- `PUBLIC_BASE_NO_GPU`

CORS:
- `ALLOW_ORIGINS`
- `ALLOW_ORIGIN_REGEX`

Idle + adoption:
- `IDLE_SECONDS`
- `ADOPT_ON_STARTUP`, `ADOPT_DELAY_SEC`, `ADOPT_MODE`

Capture hysteresis:
- `CAPTURE_NAME`
- `CAPTURE_IDLE_GRACE`, `CAPTURE_MIN_DOWN`, `CAPTURE_MIN_UP`, `CAPTURE_STARTUP_SETTLE`

Swarm naming:
- `STACK_NAME` (default: `vision-hub`)

---

## Next sections

- [Video pipeline](/docs/video)
- [Docker Swarm backend](/docs/infrastructure/swarm)
- [Network and connectivity](/docs/infrastructure/network)
