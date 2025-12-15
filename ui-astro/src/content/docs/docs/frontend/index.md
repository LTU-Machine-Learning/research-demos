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
- [Control API](/docs/api)
- [Project constraints](/docs/projects)

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

`/demo/[slug]` is prerendered and uses `getStaticPaths()` for supported demo slugs:
`yolo`, `pose`, `price`, `chang`.

---

### `public/scripts/` (runtime logic)
Demo runtime behavior is implemented as static JS modules loaded by demo pages:
- `whep.js` — WHEP/WebRTC client (creates a MediaStream on a `<video>` element)
- `viewer.js` — demo runtime coordinator (WHEP + WS + overlay + start/stop/heartbeat)
- `overlay-classmap.js` — `window.overlayClassMap` (COCO fallback names for class indices)
- overlay helpers: `overlay-contain.js`, `overlay-yolo.js`, `overlay-ws.js`, etc.
- `prices.js` — form submission logic for the price-estimation demo
- debug helpers: `debug.js` (plus `public/legacy/` kept for older experiments)

---

## Global UI Layout (SiteLayout)

`src/layouts/SiteLayout.astro` defines the global structure shared by the app:
- topbar: brand + navigation links + a command-style search (`Ctrl/⌘ K`) over a local `commands[]` registry
- persistent Debug entry point + mobile menu
- animated background scene
- footer with privacy/contact/projects links

Layout invariant:
- flex column layout + `main.page { flex: 1; }` ensures footer stays at the bottom on short pages.

---

## Demo Runtime Page (`/demo/[slug]`)

`src/pages/demo/[slug].astro` renders two UI types based on `cfg.kind` from `src/lib/demos.ts`.

### Video demos (`kind: "video"`)
Rendered as a stack (video + canvas overlay):
- `<video ... autoplay playsinline muted>`
- `<canvas ...>`
- loading overlay + compact debug controls

Runtime configuration is passed via `data-*` attributes on the root element:
- `data-cam` → WHEP endpoint shorthand (e.g. `:8889/cam/whep`, `:8889/chang_annot/whep`)
- `data-ws` → overlay WebSocket shorthand (e.g. `:6002/ws/dets`, `:6001/ws/pose`)
- `data-ws-kind` → `boxes | pose | none`
- `data-orch` → orchestrator base (default `:8090`)
- `data-demoid` → demo identifier (`yolo`, `pose`, `chang`, …)
- `data-token` → orchestrator token

For video demos, the page loads:
- `/scripts/overlay-classmap.js`
- `/scripts/viewer.js`

### Form demos (`kind: "form"`)
The price demo renders a form and POSTs JSON to the price API.
Endpoint resolution is driven by `cfg.api` and/or `PUBLIC_PRICE_API` (frontend config), then a fallback.

For non-video demos, the page loads:
- `/scripts/prices.js`

---

## Orchestration Integration (viewer.js)

`public/scripts/viewer.js` is the runtime coordinator for video demos.

### Consent gating
- consent is stored per demo in localStorage: `vh_consent_<demoId>`
- consent JWTs are issued by the orchestrator:
  - `POST {ORCH}/consent?demo=<id>` → `{ token, expiresAt }`
- demo shutdown requests carry:
  - `X-Token: <orchestrator token>`
  - `X-Consent-Token: <consent JWT>`

### Demo lifecycle
The runtime calls:
- `GET  /demos/<id>/status`
- `POST /demos/<id>/start?wait=1&timeout=90`
- `POST /demos/<id>/stop`
- `POST /demos/<id>/heartbeat`

The heartbeat loop is periodic (~25s) with `keepalive: true`.

### Live video (WHEP/WebRTC)
- WHEP endpoints are resolved from `data-cam` and normalized to absolute HTTP(S) URLs.
- `connectWhep(url, video)` is implemented in `public/scripts/whep.js`.
- `chang` uses a larger retry/grace window (pipeline can take longer to become ready).

### Overlays (WebSocket metadata → canvas)
- overlay WS endpoint comes from `data-ws` (or defaults based on `data-ws-kind`)
- supported modes:
  - `boxes`: bounding boxes + labels
  - `pose`: skeleton/keypoints
  - `none`: no overlay WS (e.g. chang, already-annotated stream)

Boxes payload expectations:
- `{ w, h, boxes: [{x1,y1,x2,y2, cls?, conf?, label?}, ...] }`
- label resolution priority: `label` → `overlayClassMap[cls]` → `#<cls>`

Pose payload expectations:
- `people` with 17 keypoints per person
- `skeleton` can be provided by backend; otherwise a default edge list is used
- coordinates are mapped with “contain” semantics to match the displayed video fit

---

## Local Demo Configuration (`src/lib/demos.ts`)

`src/lib/demos.ts` is the canonical “frontend view” of supported demos:
- WHEP base uses MediaMTX HTTP port `:8889`
- WS endpoints:
  - `pose` → `:6001/ws/pose`
  - `yolo` → `:6002/ws/dets`
- orchestrator base defaults to `:8090`
- `chang` uses WHEP-only (`wsKind: "none"`) and consumes an annotated stream path (`/chang_annot/whep`)

---

## Notes on Legacy/Unused Paths

Some modules exist but are not in the active `/demo/[slug]` runtime path:
- `src/components/OverlayPlayer.astro` (legacy init path)
- `src/lib/api.ts` (minimal typed client; runtime calls are in `viewer.js`)
- `src/data/endpoints.ts` (alternative endpoint derivation not currently used by `demos.ts`)

---

## Related pages

- [Global architecture](/docs/architecture)
- [Control API](/docs/api)
- [Video pipeline](/docs/video)
- [Docker Swarm backend](/docs/infrastructure/swarm)
- [Network and connectivity](/docs/infrastructure/network)