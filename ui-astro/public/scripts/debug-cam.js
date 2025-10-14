// public/scripts/debug-cam.js
(function () {
  const $ = (id) => document.getElementById(id);

  const startBtn = $('start');
  const stopBtn  = $('stop');

  const videoCam = $('webrtc');
  const stCamEl  = $('rtcCam');
  const epCamEl  = $('epCam');

  let stopCam = null;

  function resolveWhepCam() {
    // 1) essayer l'URL affichée par endpoints.js
    const fromSpan = epCamEl?.textContent?.trim();
    if (fromSpan) return fromSpan;

    // 2) fallback: reconstruire depuis location (au cas où endpoints.js n'a pas encore tourné)
    const base = `${location.protocol}//${location.hostname}:8889`;
    return `${base}/cam/whep`;
  }

  async function startCam() {
    // stop en cours
    if (stopCam) { try { stopCam(); } catch {} stopCam = null; }

    const WHEP_CAM = resolveWhepCam();
    console.log('[debug-cam] starting with', WHEP_CAM);

    if (!WHEP_CAM || !/^https?:\/\//.test(WHEP_CAM)) {
      console.warn('[debug-cam] URL invalide:', WHEP_CAM);
      stCamEl.textContent = 'no-url';
      return;
    }

    try {
      stopCam = await window.WHEP.play(WHEP_CAM, videoCam, stCamEl);
    } catch (e) {
      console.error('[debug-cam] start error:', e);
      stCamEl.textContent = 'error';
    }
  }

  function stopCamFn() {
    if (stopCam) { try { stopCam(); } catch {} stopCam = null; }
  }

  startBtn?.addEventListener('click', startCam);
  stopBtn?.addEventListener('click',  stopCamFn);

  // auto-start pour tester
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startCam);
  } else {
    startCam();
  }
})();
