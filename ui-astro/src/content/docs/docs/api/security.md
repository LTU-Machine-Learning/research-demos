---
title: Security & Privacy — Tokens, Consent, and Exposure
description: Operational security model of Vision Hub - orchestrator token, consent JWTs, and what is (and is not) protected.
---

## Scope

- **Infrastructure control** is protected by a shared **orchestrator token**.
- **Camera use** is gated by a short-lived **consent token** (JWT) issued by the Control API.ensure

This page documents *what these tokens protect*, *how they flow through the system*, and *what surfaces remain public by design*.

---

## Token types

### 1) Orchestrator token (`ORCH_TOKEN`)

**Purpose:** authorize *infrastructure control* actions in the Control API (start/stop, debug routes, lifecycle endpoints).

**Where it lives:**
- Control API env: `ORCH_TOKEN`
- Frontend runtime: passed as `data-token` to `/scripts/viewer.js` (demo runtime)

**How it is sent:**
- `X-Token: <ORCH_TOKEN>` header (preferred)
- or `?token=<ORCH_TOKEN>` query parameter (fallback for simple tooling)

**Implication:** anyone who obtains `ORCH_TOKEN` can control Swarm services via the API.

---

### 2) Consent token (`X-Consent-Token`)

**Purpose:** prove *explicit and recent user consent* for camera-based demos.

**Issuance endpoint:**
- `POST /consent?demo=<demo_id|*>`

**Properties:**
- short-lived JWT (HS256)
- signed with `CONSENT_SECRET`
- bounded by `CONSENT_TTL_SECONDS`
- audience checked (`CONSENT_AUD`)
- scoped by a `demo` claim (`<demo_id>` or `*`)

**How it is used:**
- the frontend requests consent just-in-time, stores it client-side with an expiry timestamp, then sends it on protected actions as:
  - `X-Consent-Token: <jwt>`

**Enforcement:**
- endpoints that start/stop or otherwise activate *camera-backed* demo execution should validate the consent JWT (signature, exp, aud, demo scope).
- the orchestrator token still remains required for infrastructure control.

> The goal is not “authn/authz per user”, but preventing accidental camera activation without a user-facing acknowledgement flow.

---

## Consent lifecycle (frontend ↔ API)

Client-side consent state is cached to avoid spamming the user with modals:

- storage key pattern: `vh_consent_<demoId>`
- stored payload typically includes: `{ token, expiresAt }`
- on expiry, the frontend requests a new token via `POST /consent`.

Typical flow for a camera demo:

1. user navigates to `/demo/<id>`
2. frontend checks local consent cache
3. if missing/expired → displays consent UI and requests a token
4. frontend starts the demo via the Control API with:
   - `X-Token: ...`
   - `X-Consent-Token: ...`
5. frontend sends periodic heartbeats to prevent idle shutdown

---

## What is public (by design)

Vision Hub exposes *demo outputs* to the browser. This implies some ports/services are reachable from the client network.

Commonly exposed surfaces (see `stack.yml` and `/docs/infrastructure/network`):

- **UI:** `:4321/tcp`
- **Control API:** `:8090/tcp`
- **MediaMTX:**
  - RTSP `:8554/tcp`
  - WHEP/WHIP `:8889/tcp`
  - WebRTC UDP `:8189/udp` (plus `:8189/tcp` temporarily while debugging)

Depending on deployment, the GPU demo ports may also be reachable (e.g. `:6001`, `:6002`, `:7000`). If these ports are exposed, treat them as **internal/demo surfaces**, not “secure APIs”.

**Important:** the orchestrator token does *not* protect MediaMTX endpoints or demo container endpoints unless you explicitly proxy them behind an auth layer.

---

## Data minimization expectations

### Camera video
- the system is designed around **live streaming**, not recording.
- video is transported via RTSP/WebRTC. If you add recording (MediaMTX recording, ffmpeg tee, etc.), treat it as a separate feature with explicit consent and retention rules.

### Inference metadata (WS overlays)
- YOLO/Pose demos send structured overlays (boxes/keypoints) over WebSocket.
- this data can be considered *derived* from video and may still be sensitive in some contexts.

### Logs
Operational logs can leak sensitive information (URLs, IPs, error traces). Prefer:
- avoiding logging raw tokens
- not logging full request bodies for `/predict` or other user inputs
- keeping MediaMTX on reasonable log levels in shared environments

---

## Threat model and limitations

This project currently assumes:
- a controlled environment (lab/demo network)
- trusted operator and limited audience
- no hostile multi-user access

Not covered by design:
- strong user isolation / per-user permissions
- per-demo ACLs
- rate limiting / abuse protection
- DDoS resilience

If you need public exposure, add a proper edge layer:
- HTTPS reverse proxy (TLS termination)
- authentication (OIDC, SSO, basic auth at minimum)
- network ACLs / firewalling to keep RTSP and demo ports private
- rate limiting on the Control API

---

## Hardening checklist (practical)

- Set a strong `ORCH_TOKEN` and rotate it if leaked.
- Set a strong `CONSENT_SECRET` and rotate periodically.
- Keep `CONSENT_TTL_SECONDS` short (minutes, not hours).
- Restrict `ALLOW_ORIGINS` to the UI origin(s).
- Avoid exposing `:8554` (RTSP) publicly unless required.
- Prefer exposing only `:8889` (WHEP) + `:8189/udp` for browser streaming.
- Consider placing the Control API behind a reverse proxy with auth.
- Treat demo container ports (`6001/6002/7000`) as internal; avoid public exposure when possible.

---

## Related pages

- [Control API](/docs/api)
- [Frontend architecture](/docs/frontend)
- [Network](/docs/infrastructure/network)
- [Swarm](/docs/infrastructure/swarm)