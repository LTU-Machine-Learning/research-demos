// whep.js — minimal, robust WHEP client (non-trickle)
// Usage: import { connectWhep } from "/scripts/whep.js";
//        const pc = await connectWhep("http://<HOST>:8889/whep/cam", videoEl);

export async function connectWhep(whepUrl, videoEl, opts = {}) {
  const {
    stunServers = [
      { urls: "stun:stun.l.google.com:19302" },
      // { urls: "stun:stun.cloudflare.com:3478" },
    ],
    iceGatherTimeoutMs = 2000, // small but enough on LAN
    log = console,
  } = opts;

  if (!whepUrl) throw new Error("whepUrl is required");
  if (!videoEl) throw new Error("videoEl is required");

  // 1) PeerConnection with STUN; bundle/mux for fewer ports
  const pc = new RTCPeerConnection({
    iceServers: stunServers,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });

  // attach remote media
  pc.ontrack = (ev) => {
    try { videoEl.srcObject = ev.streams[0]; } catch {}
  };

  // optional logging (handy when debugging ICE)
  pc.addEventListener("iceconnectionstatechange", () => {
    log.debug?.("[WHEP] iceConnectionState:", pc.iceConnectionState);
  });
  pc.addEventListener("connectionstatechange", () => {
    log.debug?.("[WHEP] connectionState:", pc.connectionState);
  });
  pc.addEventListener("icegatheringstatechange", () => {
    log.debug?.("[WHEP] iceGatheringState:", pc.iceGatheringState);
  });

  // 2) recvonly transceiver
  pc.addTransceiver("video", { direction: "recvonly" });

  // 3) Create offer and wait for ICE gathering to finish (non-trickle)
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const t = setTimeout(resolve, iceGatherTimeoutMs);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        resolve();
      }
    });
  });

  // NOTE: Use the finalized (post-ICE) SDP
  const local = pc.localDescription?.sdp || offer.sdp;

  // 4) POST offer SDP to WHEP endpoint
  const resp = await fetch(whepUrl, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: local,
  });
  if (!resp.ok) {
    try { pc.close(); } catch {}
    throw new Error(`WHEP answer HTTP ${resp.status}`);
  }

  // 5) Apply answer
  const answerSdp = await resp.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  // 6) Autoplay helpers
  videoEl.muted = true;           // allow autoplay without user gesture
  videoEl.playsInline = true;
  try { await videoEl.play().catch(() => {}); } catch {}

  // 7) small helper to cleanup
  pc._whepClose = () => {
    try {
      if (videoEl.srcObject) {
        videoEl.srcObject.getTracks?.().forEach(t => { try { t.stop(); } catch {} });
        videoEl.srcObject = null;
      }
    } catch {}
    try { pc.close(); } catch {}
  };

  return pc;
}
