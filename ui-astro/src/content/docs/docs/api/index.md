---
title: Control API
description: FastAPI orchestrator for demo lifecycle, consent enforcement, and Docker Swarm control.
---

## Scope

The Control API is the **single control-plane** of Vision Hub:
- exposes a small HTTP surface to the frontend (start/stop/status/heartbeat),
- scales Docker Swarm services (0 ↔ 1 replicas),
- manages the **local capture container** (hysteresis / idle stop),
- issues and validates **short-lived consent JWTs**.

Code location:
- `api/app.py` (FastAPI app + orchestration logic)
- `api/Dockerfile` + `api/requirements.txt`

Related:
- [Architecture](/docs/architecture)
- [Frontend](/docs/frontend)
- [Swarm](/docs/infrastructure/swarm)
- [Network](/docs/infrastructure/network)
- [Projects](/docs/projects)

---

## Auth model

### Orchestrator token
All control endpoints are protected by the orchestrator token:
- header: `X-Token: <token>`
- or query: `?token=<token>`

Configured via `ORCH_TOKEN` (defaults to `dev-token`).

---

## Demo registry

Demos are registered in-process via `DEMOS` (in `api/app.py`). Each entry defines:
- `service`: Swarm service short name (scaled 0 ↔ 1)
- `health_url`: internal HTTP health probe (overlay DNS)
- `needs`: dependencies to bring up before the demo (typically `mediamtx` + `capture`)

Current registered demos:
- `yolo` → `service: yolo`, `needs: ["mediamtx", "capture"]`
- `pose` → `service: pose`, `needs: ["mediamtx", "capture"]`
- `chang` → `service: chang-demo`, `needs: ["mediamtx", "capture"]`
- `price` → `service: price-api`, `needs: []`

### Swarm service naming
The API maps a short name to the deployed Swarm service name:

- `STACK_NAME` defaults to `vision-hub`
- service name becomes `<STACK_NAME>_<service>`, e.g. `vision-hub_yolo`

---

## Consent JWTs

The API issues short-lived consent tokens to support explicit “camera consent” UX.

### Issue token
`POST /consent?demo=<id|*>` → `{ token, expiresAt }`

Token properties:
- HS256 signature (`CONSENT_SECRET`)
- audience check (`CONSENT_AUD`, default `vision-hub`)
- TTL (`CONSENT_TTL_SECONDS`, default 600s)
- scope claim: `demo: "<demo_id>"` or `"*"`

### Enforced endpoint
Consent is currently enforced on:
- `POST /demos/{demo_id}/stop` (requires `X-Consent-Token: <jwt>`)

The API validates signature/expiration/audience + scope (`claims.demo` must match `{demo_id}` or `"*"`).

---

## Public endpoints

- `GET /healthz` → liveness `{ ok: true }`

---

## Control endpoints

### List demos
`GET /demos`

Returns a list of:
- `id`
- `exists` (service exists in Swarm)
- `running` (at least one task is in `running` state)
- `url` (browser-facing URL derived by `_browser_url_for()`)

### Demo status
`GET /demos/{demo_id}/status`

Same as `/demos` but for one demo.

If the demo is already running and the API has no heartbeat entry yet, it will “adopt” it by seeding `_last_beat[demo_id]` (so idle monitoring applies after API restarts).

### Start demo
`POST /demos/{demo_id}/start?wait=1&timeout=90`

Behavior:
- starts core dependencies (`CORE = ["mediamtx"]`)
- starts demo-specific dependencies from `needs`
- scales the demo service to 1 replica
- optional health wait (`wait=1`): polls `health_url` until HTTP status < 400 or `timeout`
- records activity (`_active_demos`, `_last_beat`) and ensures idle monitoring is running

### Stop demo
`POST /demos/{demo_id}/stop`

Requirements:
- orchestrator token (`X-Token`)
- consent token (`X-Consent-Token`) for that demo (or `"*"`)

Behavior:
- scales demo service to 0
- clears heartbeat + active state
- triggers capture idle-stop scheduling (if no other demo is active)

### Heartbeat
`POST /demos/{demo_id}/heartbeat`

Frontend calls this periodically while the demo page is open.
The heartbeat updates `_last_beat` and keeps shared dependencies consistent.

---

## Idle / auto-stop

A background loop (“idle monitor”) checks `_last_beat` and stops demos that have been idle for:
- `IDLE_SECONDS` (default 300s)

If a demo is stopped due to idle:
- service is scaled to 0,
- demo is removed from `_active_demos`,
- capture stop may be scheduled (see below).

---

## Shared dependencies

### MediaMTX (Swarm service)
`mediamtx` is treated as a core dependency and is scaled up before camera-based demos start.

### Capture (local-only container)
Capture is **not** a Swarm service here: it is a local container controlled via the Docker socket mounted into the API container (`/var/run/docker.sock`).

Capture control uses hysteresis knobs:
- `CAPTURE_MIN_DOWN` (avoid immediate restart after stop)
- `CAPTURE_MIN_UP` (avoid immediate stop after start)
- `CAPTURE_IDLE_GRACE` (delay before stopping capture once idle)
- `CAPTURE_STARTUP_SETTLE` (settle time after start)

Operationally:
- capture starts when the first demo requiring it starts,
- capture stops only after *all* demos are inactive and the grace delay has elapsed.

---

## Debug endpoints

The API exposes token-protected debug routes intended for the UI debug panel:
- `GET  /debug/demos`
- `POST /debug/demos/{id}/start`
- `POST /debug/demos/{id}/stop`
- `POST /debug/demos/{id}/restart`
- `POST /debug/capture/restart`
- `POST /debug/core/{name}/restart`
- `POST /debug/all/soft-restart`

These endpoints do not require consent (admin-style actions).

---

## Configuration summary (env)

Security:
- `ORCH_TOKEN`
- `CONSENT_SECRET`, `CONSENT_TTL_SECONDS`, `CONSENT_AUD`

Swarm:
- `STACK_NAME`

CORS:
- `ALLOW_ORIGINS`
- `ALLOW_ORIGIN_REGEX`

Idle & adoption:
- `IDLE_SECONDS`
- `ADOPT_ON_STARTUP`, `ADOPT_DELAY_SEC`, `ADOPT_MODE`

Capture:
- `CAPTURE_NAME`
- `CAPTURE_IDLE_GRACE`, `CAPTURE_MIN_DOWN`, `CAPTURE_MIN_UP`, `CAPTURE_STARTUP_SETTLE`

Public URL mapping:
- `PUBLIC_BASE_GPU`
- `PUBLIC_BASE_NO_GPU`

---

## Related pages

- [Demos](/docs/demos)
- [Video](/docs/video)
- [Swarm](/docs/infrastructure/swarm)
- [Network](/docs/infrastructure/network)