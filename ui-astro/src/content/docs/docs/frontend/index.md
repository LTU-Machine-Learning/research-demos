---
title: Frontend Architecture
description: Astro frontend structure, routing, live demo runtime (WHEP + WebSocket overlays), and consent UX.
---

## Role and Scope

The frontend is an **Astro web application** responsible for:
- user-facing navigation (Home / Projects / Docs / Debug),
- rendering demo pages (live stream + overlays / interactive forms),
- **consent gating** for camera-based demos,
- calling the **orchestrator API** to start/stop demos and send heartbeats.

The frontend does **not** perform inference, does **not** stream processed video, and does **not** directly control Docker: orchestration is always done via the control API.

Related:
- [Global architecture](/docs/architecture)
- [Projects: constraints and intentions](/docs/projets)

---

## Code and Assets Layout

### `src/pages/` (routing)
Key routes:
- `/` → `src/pages/index.astro`
- `/projects` → `src/pages/projects.astro`
- `/projects/[slug]` → `src/pages/projects/[slug].astro`
- `/demo/[slug]` → `src/pages/demo/[slug].astro` (**demo runtime entry point**)
- `/docs/*` → Starlight content (`src/content/docs/...`)
- `/debug` → `src/pages/debug.astro`
- `/privacy`, `/contact`, `/404` → static utility pages

`/demo/[slug]` is **prerendered** and uses `getStaticPaths()` for the supported demo slugs:
`yolo`, `pose`, `price`, `chang`.

---

### `public/scripts/` (runtime logic)
Demo runtime behavior is implemented as static JS modules loaded by demo pages:
- `whep.js` — WHEP/WebRTC client (creates a live MediaStream on a `<video>` element)
- `viewer.js` — main demo runtime orchestrator (WHEP + WS + overlay + start/stop/heartbeat)
- `overlay-classmap.js` — provides `window.overlayClassMap` (COCO fallback names for class indices)
- overlay helpers: `overlay-contain.js`, `overlay-yolo.js`, `overlay-ws.js`, etc.
- `prices.js` — form submission logic for the price-estimation demo
- debug helpers: `debug.js`, plus a `public/legacy/` folder containing older experiments kept for reference

---

## Global UI Layout (SiteLayout)

`src/layouts/SiteLayout.astro` defines the global structure shared by the app:
- topbar with:
  - brand (LTU logo + Vision Hub),
  - navigation links (Home / Projects / Documentation),
  - a **command-style search bar** (`Ctrl/⌘ KӡK`) over a local `commands[]` registry,
  - a persistent **Debug** button and a burger menu for mobile layouts
- animated background scene (“blobs”)
- a footer with privacy/contact/projects links

Important UX traits:
- the page layout uses a flex column body + `main.page { flex: 1; }` to keep the footer at the bottom even on short pages
- a lightweight search launcher is implemented directly in the layout via `define:vars={{ commands }}` and client-side scoring/grouping (Projects / Demos / Tools)

---

## Demo Runtime Page (`/demo/[slug]`)

`src/pages/demo/[slug].astro` renders two distinct UI kinds based on `cfg.kind` from `src/lib/demos.ts`:

### Video demos (`kind: "video"`)
Rendered as a **stack** (video + canvas overlay):
- `<video id="yolo-video" autoplay playsinline muted>`
- `<canvas id="yolo-canvas">`
- a loading overlay (`#yolo-loading`)
- a compact debug menu (Start / Stop / Reconnect WS / Restart demo / Reset overlay)

Runtime configuration is passed via `data-*` attributes on the root element:

- `data-cam` → WHEP endpoint (e.g. `:8889/cam/whep`, `:8889/chang_annot/whep`)
- `data-ws` → overlay WebSocket endpoint (e.g. `:6002/ws/dets`, `:6001/ws/pose`)
- `data-ws-kind` → `boxes | pose | none`
- `data-orch` → orchestrator base (default `:8090`)
- `data-demoid` → demo identifier (`yolo`, `pose`, `chang`, …)
- `data-token` → orchestrator token (currently `dev-token` in config)

For video demos, the page loads:
- `/scripts/overlay-classmap.js` (COCO class names)
- `/scripts/viewer.js` (the actual runtime engine)

### Form demos (`kind: "form"`)
The price demo renders a form with:
- required fields (e.g., `living_area`, `rooms`)
- optional “Booli-enriched” fields (e.g., `construction_year`, `floor`, `rent`, `list_price`)
- form endpoint configured via `data-api`:
  - `cfg.api` or `PUBLIC_PRICE_API` or fallback `http://192.168.10.1:8080/predict`
- a small debug panel (ensure demo running / check health)

For non-video demos, the page loads:
- `/scripts/prices.js`

---

## Orchestration Integration (viewer.js)

`public/scripts/viewer.js` is the central runtime coordinator for video demos. It handles:

### 1) Consent gating (localStorage + modal + API)
- consent is stored per demo in localStorage: `vh_consent_<demoId>`
- if missing/expired, the runtime triggers `window.askConsent_<demoId>()` (provided by `ConsentModal`)
- the consent token is fetched via:
  - `POST {ORCH}/consent?demo=<id>` → `{ token, expiresAt }`
- demo start includes both:
  - `x-token: <orchestrator token>`
  - `X-Consent-Token: <consent JWT>`

Consent is therefore enforced as a precondition for demo activation.

---

### 2) Demo lifecycle (start/stop/status)
The runtime uses the orchestrator endpoints:
- `GET  /demos/<id>/status`
- `POST /demos/<id>/start?wait=1&timeout=90`
- `POST /demos/<id>/stop`
- `POST /demos/<id>/heartbeat`

Behavior:
- `ensureUp()` checks status and starts the demo if not running.
- start is retried if consent token expires mid-flight (401 → refresh consent → retry).
- `heartbeat` runs periodically (~25s) with `keepalive: true`.

---

### 3) Live video (WHEP/WebRTC)
- WHEP endpoint is derived from `data-cam` and normalized into an absolute HTTP(S) URL.
- the runtime calls `connectWhep(url, video)` from `/scripts/whep.js`.
- a retry policy is applied:
  - standard demos: low retry count (fast startup)
  - `chang`: larger retry window and initial grace delay (slower pipeline exposure)

---

### 4) Overlays (WebSocket metadata → canvas)
- overlay WebSocket URL is derived from `data-ws` (or fallback defaults per wsKind)
- supported modes:
  - `boxes`: bounding boxes + labels
  - `pose`: skeleton/keypoints
  - `none`: no overlay WS (used for `chang` where video is already annotated)

**Boxes mode**
- expected message shape: `{ w, h, boxes: [{x1,y1,x2,y2, cls?, conf?, label?}, ...] }`
- labels are derived using:
  - `b.label` if present
  - else `overlayClassMap[b.cls]` (COCO map)
  - else `#<cls>`
  - confidence appended as `%` when available
- last detections are cached in sessionStorage (`yolo:last-dets:<demoId>`) to reduce blank time on refresh/reconnect.

**Pose mode**
- expected message shape includes `people` (or `poses`) with 17 keypoints per person
- rendering runs in a RAF loop with a short “linger” window to avoid blinking on sparse updates
- optional `skeleton` edges can be provided by backend; otherwise a default edge list is used
- coordinates are mapped using **contain** semantics to match the displayed video fit.

---

## Local Demo Configuration (`src/lib/demos.ts`)

Demos are configured client-side via a static map:
- transport: mostly `whep`
- MediaMTX base port: `:8889` (WHEP endpoints)
- WS ports:
  - pose → `:6001/ws/pose`
  - detection → `:6002/ws/dets`
- orchestrator port: `:8090`
- `chang` uses WHEP-only (`wsKind: "none"`) and a dedicated annotated stream path (`/chang_annot/whep`)

This file is the canonical “frontend view” of demo endpoints and runtime mode.

---

## Notes on Legacy/Unused Paths

Some modules exist but are not currently used by `/demo/[slug]`:
- `src/components/OverlayPlayer.astro` appears to rely on `window.VH_INIT_OVERLAY` and `/scripts/debug-entry.js`, which is not part of the current demo runtime path (current runtime uses `viewer.js` directly).
- `src/lib/api.ts` is a minimal typed client but currently hardcodes `ORCH` as `http://${location.hostname}:8090` and a static token; the actual demo runtime uses fetch calls inside `viewer.js`.
- `src/data/endpoints.ts` provides location-based endpoint derivation but is not used by the current `demos.ts` mapping (which uses `:PORT/...` shorthands resolved by `viewer.js` helpers).

These components can be cleaned up or re-aligned later; they are retained for iteration speed and backwards compatibility during development.

---

## Next sections

- [Control API design](/docs/api)
- [Video pipeline](/docs/video)
- [Docker Swarm backend](/docs/infrastructure/swarm)
