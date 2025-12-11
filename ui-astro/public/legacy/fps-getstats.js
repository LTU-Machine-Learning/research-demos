// public/scripts/fps-getstats.js
(function () {
  const elCam   = document.getElementById('fpsCam');
  const elAnnot = document.getElementById('fpsAnnot');

  function attach(pc, which) {
    const out = which === 'cam' ? elCam : elAnnot;
    if (!pc || !out) return;

    let lastT = performance.now();
    let lastF = 0;
    let picked = null;
    let stopped = false;

    async function loop() {
      if (stopped) return;
      try {
        const stats = await pc.getStats();
        let rtp = null;
        stats.forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'video') rtp = r; });
        if (rtp) {
          // 1) framesPerSecond direct si dispo
          if (!picked && typeof rtp.framesPerSecond === 'number') picked = 'framesPerSecond';

          const now = performance.now();
          const dt  = (now - lastT) / 1000;

          if (picked === 'framesPerSecond') {
            const fps = rtp.framesPerSecond;
            if (isFinite(fps)) out.textContent = fps.toFixed(1);
            lastT = now;
          } else {
            // 2) sinon on dérive sur framesDecoded/framesReceived
            const f = (typeof rtp.framesDecoded === 'number') ? rtp.framesDecoded
                    : (typeof rtp.framesReceived === 'number') ? rtp.framesReceived
                    : 0;
            if (dt > 0 && f >= lastF) {
              const fps = (f - lastF) / dt;
              if (isFinite(fps)) out.textContent = fps.toFixed(1);
              lastF = f; lastT = now;
            }
          }
        }
      } catch { /* noop */ }
      setTimeout(loop, 1000);
    }
    loop();

    // clean si la PC se ferme
    pc.addEventListener?.('connectionstatechange', () => {
      if (pc.connectionState === 'closed') { stopped = true; out.textContent = '—'; }
    });
  }

  window.addEventListener('whep-connected', (ev) => {
    const { pc, url } = ev.detail || {};
    if (!pc || typeof url !== 'string') return;
    if (url.includes('/cam/'))   attach(pc, 'cam');
    if (url.includes('/annot/')) attach(pc, 'annot');
  });
})();
