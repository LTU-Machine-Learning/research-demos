// public/scripts/quality.js
// Écoute "whep-connected" (émis par whep-player.js) et met à jour #qCam / #qAnnot
(function () {
  const elCam   = document.getElementById('qCam');
  const elAnnot = document.getElementById('qAnnot');

  function fmt(ms) {
    if (ms == null || !isFinite(ms)) return null;
    return `${Math.round(ms)} ms`;
  }

  function attach(pc, videoEl, which) {
    const out = which === 'cam' ? elCam : elAnnot;
    if (!out) return;

    let stopped = false;

    // 1) getStats(): jitter buffer & decode time (toutes les ~1s)
    async function loopStats() {
      if (stopped) return;
      try {
        const stats = await pc.getStats();
        let rtp = null;
        stats.forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'video') rtp = r; });

        let jbMs = null, decMs = null;
        if (rtp) {
          if (rtp.jitterBufferDelay != null && rtp.jitterBufferEmittedCount > 0) {
            jbMs = (rtp.jitterBufferDelay / rtp.jitterBufferEmittedCount) * 1000;
          }
          if (rtp.totalDecodeTime != null && rtp.framesDecoded > 0) {
            decMs = (rtp.totalDecodeTime / rtp.framesDecoded) * 1000;
          }
        }

        // 2) PlaybackQuality: drop %
        let dropStr = null;
        try {
          const q = videoEl.getVideoPlaybackQuality?.();
          if (q && q.totalVideoFrames) {
            const pct = 100 * (q.droppedVideoFrames || 0) / q.totalVideoFrames;
            dropStr = `drop ${pct.toFixed(1)}%`;
          }
        } catch { /* noop */ }

        // Compose affichage
        const parts = [];
        if (jbMs != null)  parts.push(`jitter ${fmt(jbMs)}`);
        if (decMs != null) parts.push(`decode ${fmt(decMs)}`);
        if (dropStr)       parts.push(dropStr);

        out.textContent = parts.length ? parts.join(' • ') : '—';
        out.title = `Stats:\n${parts.join('\n') || '—'}`;
      } catch {
        // en cas de souci temporaire, ne rien spammer
      }
      setTimeout(loopStats, 1000);
    }
    loopStats();

    // clean quand la PC se ferme
    pc.addEventListener?.('connectionstatechange', () => {
      if (pc.connectionState === 'closed') { stopped = true; out.textContent = '—'; out.title = ''; }
    });
  }

  window.addEventListener('whep-connected', (ev) => {
    const { pc, videoEl, url } = ev.detail || {};
    if (!pc || !videoEl || typeof url !== 'string') return;
    if (url.includes('/cam/'))   attach(pc, videoEl, 'cam');
    if (url.includes('/annot/')) attach(pc, videoEl, 'annot');
  });
})();
