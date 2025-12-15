---
title: Network
description: Network layers (ZeroTier / Swarm overlay / underlay), exposed ports, and streaming paths.
---

## Network layers

### ZeroTier overlay (primary addressing model)

Vision Hub is operated as if all nodes were on the same LAN, even when physically remote. ZeroTier provides that LAN-like layer (private addressing + routing between nodes).

This keeps the original “LAN / 192.168.10.0/24” design model that Vision Hub was built around (initially developed on localhost / Ethernet P2P).

ZeroTier access is managed by the project owner. For access requests, contact:
- chang.liu@ltu.se (demo author)
- Tom Burellier (platform owner)

### Swarm overlay (service-to-service)

Inside Docker Swarm, services communicate over an external overlay network declared in `stack.yml`:

- network key: `networks.hub`
- external network name: `vision-hub-net`

This layer is for container-to-container traffic and Swarm DNS service discovery (e.g. `mediamtx`, `api`, `yolo`, `pose`, `price-api`, `chang-demo`).

### Underlay (physical / public connectivity)

Each node also has its physical connectivity (LAN/Wi-Fi/public IP). This underlay is the transport used by:
- ZeroTier tunnels
- Swarm VXLAN overlay encapsulation

It is not treated as the stable application addressing model.

Current node addressing (typical):
- Frontend node “B”: ZeroTier `192.168.10.2` (also has a public interface, e.g. `eno1`)
- GPU backend “Ubuntu-22”: ZeroTier `192.168.10.1` (also has a public interface, e.g. `eth0`)
- Laptop client: ZeroTier `192.168.10.3` (public IP varies)

## Published ports (stack.yml)

### UI / APIs
- `ui-astro`: 4321/tcp
- `api` (orchestrator): 8090/tcp
- `price-api`: 8080/tcp

### MediaMTX
- RTSP: 8554/tcp
- WHEP/WHIP HTTP: 8889/tcp
- WebRTC ICE/DTLS/SRTP: 8189/udp (MediaMTX v1.15.3 single UDP port model)
- WebRTC over TCP: 8189/tcp (temporary debugging path)

### Demo service HTTP
- `yolo`: published 6002/tcp (container listens on 6000)
- `pose`: published 6001/tcp (container listens on 6000)
- `chang-demo`: published 7000/tcp (health endpoint only)

## MediaMTX network configuration

Config file: `mediamtx/mediamtx.yml`

### WebRTC candidate advertisement

MediaMTX can restrict which interface IPs it advertises for WebRTC using:

- `webrtcIPsFromInterfaces: yes`
- `webrtcIPsFromInterfacesList: [ "eno1", "wlp1s0" ]`
- `webrtcAdditionalHosts: [ "192.168.10.2", "130.240.94.235" ]`

If WebRTC sessions must be reachable primarily via ZeroTier, the ZeroTier interface (and/or its IP) must be advertised as a candidate. That means adding the ZeroTier interface name to `webrtcIPsFromInterfacesList` and/or adding the ZeroTier IP to `webrtcAdditionalHosts`.

### RTSP UDP payload sizing

- `udpMaxPayloadSize: 1200`

This is a mitigation for UDP fragmentation when RTSP/RTP flows traverse overlay encapsulations (VXLAN, ZeroTier) and/or constrained networks.

## Video paths

### Capture → MediaMTX (`/cam`)

Capture publishes a single camera stream to MediaMTX:

- RTSP ingest endpoint: `rtsp://mediamtx:8554/cam`

Capture implementation lives under `capture/`:
- `capture/Dockerfile`
- `capture/entrypoint.sh`

The pipeline uses FFmpeg with low-latency parameters (baseline H.264, no B-frames, short GOP, small probe/buffer) and an infinite reconnect loop.

Note: capture is treated as a “local-only” container by the control API (not a Swarm service), because the webcam device is physically attached to the frontend node.

### MediaMTX → Browser (WHEP/WebRTC)

The frontend consumes MediaMTX via WHEP:

- WHEP base: `http://<host>:8889/<path>/whep`

The canonical path for the raw camera stream is:
- `/cam/whep`

Annotated demo streams are published under their own RTSP paths (e.g. `chang_annot`, `pose_annot`) and consumed through WHEP the same way.

## Chang demo: in-container UDP chain + RTSP republish

Implementation: `chang-demo/run_demo.py`

Pipeline (all UDP hops are on `127.0.0.1` inside the container):
1) `ffmpeg_in`: RTSP in → UDP `127.0.0.1:12345` (MPEG-TS, `-c:v copy`)
2) `uimain`: UDP in → UDP out (`UIMAIN_OUTPUT_PORT`)
3) `ffmpeg_out`: UDP out → RTSP publish (`OUTPUT_RTSP`)

Health:
- `GET http://<host>:7000/healthz`
- returns 200 only if the three subprocesses are alive (else 503)

In the current stack configuration, Chang uses fixed endpoints pointing to the ZeroTier LAN:
- `CAMERA_RTSP=rtsp://192.168.10.2:8554/cam`
- `OUTPUT_RTSP=rtsp://192.168.10.2:8554/chang_annot`

## Related pages

- [Infrastructure overview](/docs/infrastructure)
- [Swarm topology](/docs/infrastructure/swarm)
- [Video pipeline](/docs/video)
- [Chang demo](/docs/demos/chang)