
# Vision Hub

Vision Hub is a **multi-demo platform** to discover and run **real-time computer vision + ML demos** from a single UI.
It’s designed for **lab / kiosk / demo-room setups**: one web frontend, a small orchestrator API, and multiple independent demo backends.

> **Made by:** Tom Burellier (Maintainer / Integrator)  
> **Context:** Demo platform for applied AI / computer vision experiments (LTU lab-friendly).

---

## What you get

- A **web UI** (Astro) listing demos and opening a live viewer page
- A lightweight **orchestrator API** that can start/stop demos on demand (and manage “consent” tokens)
- A **video hub** (MediaMTX) to route streams (RTSP / WebRTC WHEP) between capture + demos + browsers
- Independent demo backends:
  - **YOLO Object Detection** (boxes via WebSocket overlay)
  - **YOLO Pose Estimation** (keypoints overlay)
  - **Chang demo** (Arabic line detection pipeline; ONNX Runtime + C++/Qt, integrated into Vision Hub)
  - **House Price Estimation** (FastAPI + LightGBM; trained on data provided by **Booli**)

---

## High-level architecture

The platform separates **video transport** from **inference** and from **UI rendering**:


         ┌───────────────────────┐
         │        UI (Astro)      │  http://<host>:4321
         │  /projects /demo/...   │
         └───────────┬───────────┘
                     │
                     │ controls (start/stop/status + consent)
                     ▼
            ┌───────────────────┐
            │ Orchestrator API  │  http://<host>:8090
            │ /demos/<id>/...   │
            └───────────┬───────┘
                        │ starts/stops demo containers
                        │
  ┌─────────────────────┼──────────────────────────┐
  │                     │                          │
  ▼                     ▼                          ▼


┌─────────────┐ ┌──────────────┐ ┌────────────────┐
│ Capture │ │ YOLO / Pose │ │ Chang pipeline │
│ (USB cam → │ │ (decode → AI │ │ (ONNX/C++ Qt) │
│ RTSP) │ │ → WS overlay) │ │ → annotated RTSP │
└──────┬───────┘ └──────┬───────┘ └───────┬────────┘
│ │ │
│ RTSP (input) │ RTSP input + WS data │ RTSP output
▼ ▼ ▼
┌─────────────────────────────────┐
│ MediaMTX │
│ RTSP ↔ WebRTC (WHEP) ↔ HLS │
└─────────────────────────────────┘
│
│ WebRTC WHEP (low-latency preview)
▼
Browser <video> + canvas overlay


---

## Repository layout (human view)

You’ll typically find these top-level folders:

- `ui-astro/` — the web UI (Astro + Starlight docs)
- `API/` — orchestrator API (start/stop/status/consent/heartbeat)
- `mediamtx/` — MediaMTX configuration (RTSP/WebRTC hub)
- `capture/` — camera ingest (USB cam → RTSP)
- `yolo/` — YOLO object detection service (WS boxes + optional debug)
- `pose/` — YOLO pose estimation service (WS keypoints)
- `chang-demo/` — Chang’s demo integration (Arabic line detection pipeline)
- `price-estimation/` — house price estimation (training + FastAPI serving)

> Folder names may vary slightly depending on how you publish images in your stack, but the roles above are stable.

---

## How demos are launched

The UI does **not** directly start containers.  
Instead, it talks to the orchestrator:

- `GET /demos/<id>/status` → is it running?
- `POST /demos/<id>/start?wait=1` → bring it up if needed
- `POST /demos/<id>/stop` → stop it
- `POST /consent?demo=<id>` → mint a short-lived consent token for viewer start
- `POST /demos/<id>/heartbeat` → keep-alive while the viewer page stays open

This keeps the UI simple, and lets you enforce:
- per-demo start rules
- timeouts / auto-stop policies
- “consent required” gating for camera-based demos

---

## How video reaches the browser (WHEP)

Most demos are viewed via **WebRTC WHEP** exposed by MediaMTX.

Typical flow:
1. Capture publishes RTSP to MediaMTX (raw camera)
2. A demo service subscribes (RTSP) and may publish an annotated stream (RTSP)
3. MediaMTX exposes a **WHEP** endpoint for the stream
4. The UI viewer page uses `connectWhep()` to play it in `<video>`

This gives:
- very low latency
- good network behavior in a lab LAN
- one consistent “viewer” implementation across demos

---

## Overlays (boxes / keypoints)

The video stream stays clean.
Overlays are drawn in the browser using a `<canvas>` on top of the `<video>`:

- Boxes mode: demo backend pushes detections over **WebSocket**  
  The viewer converts them to `{x,y,w,h,label}` and draws them on a canvas.
- Pose mode: demo backend pushes keypoints over **WebSocket**  
  The viewer draws skeleton edges + points with smoothing/linger.

This is why the UI stays fast:  
the browser draws lightweight geometry instead of decoding a fully annotated stream.

---

## Chang demo (Arabic line detection)

This integration focuses on an **Arabic line detection** pipeline.

High level:
- Model(s) are distilled/exported to ONNX for portability
- Inference runs with **ONNX Runtime**
- The pipeline is implemented in **C++/Qt** to stay cross-platform friendly
- Vision Hub wraps it into a demo: start/stop via orchestrator + view as a stream

---

## House Price Estimation demo (Booli)

This demo predicts Swedish home prices with uncertainty bounds.

- **Data:** Provided by **Booli** (Sweden). Huge thanks to Booli for enabling this dataset access.
- **Model:** LightGBM (median + quantile bounds)
- **Serving:** FastAPI endpoint consumed by the UI

> In the UI, this is a “tabular ML” demo (not video), but it lives in Vision Hub the same way: a project page + a runnable demo route.

---

## Running the stack

This repo is designed to run via container orchestration (Docker Swarm in the lab, but Compose also works).

At a minimum you need:
- UI
- Orchestrator
- MediaMTX
- One demo (YOLO / Pose / Chang / Price)

Then add:
- capture, if you want live camera input

---

## Credits

- Maintainer / Integrator: **Tom Burellier**
- Chang demo contributor: **Chang** (Arabic line detection pipeline integration)
- Data partner (price demo): **Booli** (Sweden)

Upstream projects are listed per-demo in the UI project pages.

