// whep.js — minimal, robust WHEP client (non-trickle)
// Usage: import { connectWhep } from "/scripts/whep.js";
//        const pc = await connectWhep("http://<HOST>:8889/whep/cam", videoEl);

// whep.js — WHEP client avec logs ICE détaillés + 2 modes (LAN sans STUN / internet avec STUN)
export async function connectWhep(whepUrl, videoEl, opts = {}) {
  const {
    // Par défaut: **aucun STUN** (LAN). On testera ensuite le mode “avec STUN”.
    stunServers = [],
    iceGatherTimeoutMs = 2000,
    log = console,
  } = opts;

  if (!whepUrl) throw new Error("whepUrl is required");
  if (!videoEl) throw new Error("videoEl is required");

  const pc = new RTCPeerConnection({
    iceServers: stunServers,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });

  const tag = (m, ...a) => log.debug ? log.debug(`[WHEP] ${m}`, ...a) : log.log(`[WHEP] ${m}`, ...a);

  pc.ontrack = (ev) => { try { videoEl.srcObject = ev.streams[0]; } catch {} };

  pc.addEventListener("icecandidate", (ev) => {
    if (!ev.candidate) { tag("icecandidate: <end>"); return; }
    const c = ev.candidate;
    tag("icecandidate:", { type: c.type, protocol: c.protocol, address: c.address, port: c.port, foundation: c.foundation, relatedAddress: c.relatedAddress, relatedPort: c.relatedPort, candidate: c.candidate });
  });
  pc.addEventListener("iceconnectionstatechange", () => tag("iceConnectionState:", pc.iceConnectionState));
  pc.addEventListener("connectionstatechange",     () => tag("connectionState:",     pc.connectionState));
  pc.addEventListener("icegatheringstatechange",   () => tag("iceGatheringState:",   pc.iceGatheringState));

  pc.addTransceiver("video", { direction: "recvonly" });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Attendre la fin de la collecte ICE (non-trickle)
  await new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const t = setTimeout(resolve, iceGatherTimeoutMs);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(t); resolve(); }
    });
  });

  const sdp = pc.localDescription?.sdp || offer.sdp;

  // POST SDP vers WHEP
  const resp = await fetch(whepUrl, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: sdp,
  });
  if (!resp.ok) {
    try { pc.close(); } catch {}
    throw new Error(`WHEP answer HTTP ${resp.status}`);
  }

  const answerSdp = await resp.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  // Essaye autoplay
  videoEl.muted = true;
  videoEl.playsInline = true;
  try { await videoEl.play().catch(() => {}); } catch {}

  // Aide au debug si échec
  async function dumpSelectedPair(prefix) {
    try {
      const stats = await pc.getStats();
      let sel;
      stats.forEach((r) => {
        if (r.type === "transport" && r.selectedCandidatePairId && stats.get(r.selectedCandidatePairId)) {
          sel = stats.get(r.selectedCandidatePairId);
        }
      });
      if (!sel) {
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.selected) sel = r;
        });
      }
      if (sel) {
        const lc = stats.get(sel.localCandidateId);
        const rc = stats.get(sel.remoteCandidateId);
        tag(`${prefix} selected pair:`, {
          state: sel.state,
          nominated: sel.nominated,
          currentRtt: sel.currentRoundTripTime,
          bytesRecv: sel.bytesReceived,
          bytesSent: sel.bytesSent,
          local: lc ? { addr: lc.address, port: lc.port, type: lc.candidateType, proto: lc.protocol } : null,
          remote: rc ? { addr: rc.address, port: rc.port, type: rc.candidateType, proto: rc.protocol } : null,
        });
      } else {
        tag(`${prefix} selected pair: <none>`);
      }
    } catch (e) {
      tag(`${prefix} stats error:`, e?.message || e);
    }
  }

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "connected") dumpSelectedPair("OK");
    else if (pc.connectionState === "failed") dumpSelectedPair("FAIL");
  });

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
