// public/scripts/debug-annot.js
(function () {
  const $ = (id) => document.getElementById(id);

  const startBtn = $('start');
  const stopBtn  = $('stop');

  const videoAnnot = $('annotRtc');
  const stAnnotEl  = $('rtcAnnot');
  const epAnnotEl  = $('epAnnot');

  let stopAnnot = null;

  function resolveWhepAnnot() {
    // 1) d'abord ce qu’a injecté endpoints.js
    const fromSpan = epAnnotEl?.textContent?.trim();
    if (fromSpan) return fromSpan;
    // 2) fallback depuis location
    const base = `${location.protocol}//${location.hostname}:8889`;
    return `${base}/annot/whep`;
  }

  async function startAnnot() {
    if (stopAnnot) { try { stopAnnot(); } catch {} stopAnnot = null; }

    const WHEP_ANNOT = resolveWhepAnnot();
    console.log('[debug-annot] starting with', WHEP_ANNOT);

    if (!WHEP_ANNOT || !/^https?:\/\//.test(WHEP_ANNOT)) {
      console.warn('[debug-annot] URL invalide:', WHEP_ANNOT);
      stAnnotEl.textContent = 'no-url';
      return;
    }

    try {
      stopAnnot = await window.WHEP.play(WHEP_ANNOT, videoAnnot, stAnnotEl);
    } catch (e) {
      console.error('[debug-annot] start error:', e);
      stAnnotEl.textContent = 'error';
    }
  }

  function stopAnnotFn() {
    if (stopAnnot) { try { stopAnnot(); } catch {} stopAnnot = null; }
  }

  startBtn?.addEventListener('click', startAnnot);
  stopBtn?.addEventListener('click',  stopAnnotFn);

  // auto-start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAnnot);
  } else {
    startAnnot();
  }
})();
