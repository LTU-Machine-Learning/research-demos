// public/scripts/whep-player.js
// Expose window.WHEP.play(whepUrl, videoEl, stateEl) -> stopFn
(function () {
  if (!window.WHEP) window.WHEP = {};

  function getIceServers() {
    try {
      const cfg = (typeof window.getConfig === 'function') ? window.getConfig() : null;
      if (cfg && Array.isArray(cfg.iceServers) && cfg.iceServers.length) return cfg.iceServers;
    } catch {}
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }

  /**
   * @param {string} whepUrl
   * @param {HTMLVideoElement} videoEl
   * @param {HTMLElement} [stateEl]
   * @returns {Promise<() => void>} stop function
   */
  async function play(whepUrl, videoEl, stateEl) {
    const setState = (s) => { if (stateEl) stateEl.textContent = s; };

    setState('init');

    // --- RTCPeerConnection (NOTE: pas de "const pc" en double !) ---
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });

    // Events (logs & état)
    pc.onicegatheringstatechange = () => console.log('[WHEP]', whepUrl, 'iceGathering:', pc.iceGatheringState);
    pc.oniceconnectionstatechange = () => console.log('[WHEP]', whepUrl, 'ice:', pc.iceConnectionState);
    pc.onsignalingstatechange     = () => console.log('[WHEP]', whepUrl, 'signaling:', pc.signalingState);
    pc.onconnectionstatechange    = () => { setState(pc.connectionState); console.log('[WHEP]', whepUrl, 'connection:', pc.connectionState); };

    // Receiver (video only)
    pc.addTransceiver('video', { direction: 'recvonly' });

    pc.ontrack = (ev) => {
      console.log('[WHEP]', whepUrl, 'ontrack');
      const stream = ev.streams?.[0];
      if (videoEl && stream) {
        videoEl.srcObject = stream;
        videoEl.play?.().catch(()=>{});
      }
    };

    // --- Négociation WHEP ---
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    console.log('[WHEP]', whepUrl, 'POST offer');
    const res = await fetch(whepUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    });
    if (!res.ok) {
      try { pc.close(); } catch {}
      setState('error');
      throw new Error(`WHEP ${res.status} @ ${whepUrl}`);
    }

    const answer = await res.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });

    setState('connected');
    console.log('[WHEP]', whepUrl, 'answer OK');

    // Publier la PC pour les autres modules (FPS/quality)
    try {
      videoEl._pc = pc;                         // pratique pour debug console
      videoEl.dataset.whep = whepUrl;
      window.dispatchEvent(new CustomEvent('whep-connected', {
        detail: { pc, videoEl, url: whepUrl }
      }));
    } catch {}

    // --- Stop Function ---
    return () => {
      try { pc.close(); } catch {}
      try {
        const ms = videoEl?.srcObject;
        ms?.getTracks?.().forEach(t => t.stop());
      } catch {}
      if (videoEl) {
        try { videoEl.pause?.(); } catch {}
        videoEl.srcObject = null;
        // forcer l'écran noir
        try { videoEl.removeAttribute?.('src'); videoEl.load?.(); } catch {}
      }
      setState('stopped');
    };
  }

  window.WHEP.play = play;

  try { window.dispatchEvent(new Event('whep-ready')); } catch {}
})();
