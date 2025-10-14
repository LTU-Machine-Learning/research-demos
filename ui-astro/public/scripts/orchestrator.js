// public/scripts/orchestrator.js
(function () {
  const $ = (id) => document.getElementById(id);

  const btnStart = $('start');
  const btnStop  = $('stop');

  const vCam     = $('webrtc');
  const vAnnot   = $('annotRtc');

  const stCamEl  = $('rtcCam');
  const stAnEl   = $('rtcAnnot');
  const fpsCamEl = $('fpsCam');
  const fpsAnEl  = $('fpsAnnot');
  const qCamEl   = $('qCam');
  const qAnEl    = $('qAnnot');

  function getLagEl() { return document.getElementById('lagAnnot'); }

  function buildWhepUrl(kind) {
    const cfg = window.getConfig?.() || {};
    const base = `${location.protocol}//${location.hostname}:${cfg.basePort ?? 8889}`;
    const p = kind === 'cam' ? (cfg.camPath ?? '/cam/whep') : (cfg.annotPath ?? '/annot/whep');
    return `${base}${p}`;
  }

  // fallback legacy (si jamais)
  function resolveWhepFromSpan(spanId, fallbackKind) {
    const span = document.getElementById(spanId);
    const fromSpan = span?.textContent?.trim();
    if (fromSpan) return fromSpan;
    return buildWhepUrl(fallbackKind);
  }

  let stopCam = null;
  let stopAnnot = null;

  function resetCard(kind) {
    if (kind === 'cam') {
      if (vCam)     vCam.srcObject = null;
      if (stCamEl)  stCamEl.textContent = '—';
      if (fpsCamEl) fpsCamEl.textContent = '—';
      if (qCamEl)   qCamEl.textContent = '—';
    } else {
      if (vAnnot)   vAnnot.srcObject = null;
      if (stAnEl)   stAnEl.textContent = '—';
      if (fpsAnEl)  fpsAnEl.textContent = '—';
      if (qAnEl)    qAnEl.textContent = '—';
      const lagEl = getLagEl();
      if (lagEl) { lagEl.textContent = '—'; lagEl.title = ''; }
    }
  }

  async function startAll() {
    await stopAll();

    btnStart?.setAttribute('disabled', 'true');
    btnStop?.removeAttribute('disabled');

    if (stCamEl)  stCamEl.textContent = 'init';
    if (stAnEl)   stAnEl.textContent  = 'init';
    if (fpsCamEl) fpsCamEl.textContent = '—';
    if (fpsAnEl)  fpsAnEl.textContent  = '—';
    if (qCamEl)   qCamEl.textContent   = '—';
    if (qAnEl)    qAnEl.textContent    = '—';
    const lagEl = getLagEl(); if (lagEl) { lagEl.textContent = '—'; lagEl.title = ''; }

    const cfg = window.getConfig?.() || {};
    // Les spans restent affichés “à titre indicatif”; on utilise la config
    const WHEP_CAM   = buildWhepUrl('cam')   || resolveWhepFromSpan('epCam',   'cam');
    const WHEP_ANNOT = buildWhepUrl('annot') || resolveWhepFromSpan('epAnnot', 'annot');

    try {
      stopCam = await window.WHEP.play(WHEP_CAM, vCam, stCamEl);
    } catch (e) {
      console.error('[orchestrator] CAM start error:', e);
      if (stCamEl) stCamEl.textContent = 'error';
    }

    try {
      stopAnnot = await window.WHEP.play(WHEP_ANNOT, vAnnot, stAnEl);
    } catch (e) {
      console.error('[orchestrator] ANNOT start error:', e);
      if (stAnEl) stAnEl.textContent = 'error';
    }

    try { window.overlayStart?.(); } catch {}
  }

  async function stopAll() {
    try { stopCam?.(); }   catch {}
    try { stopAnnot?.(); } catch {}
    stopCam = null; stopAnnot = null;

    try { window.overlayStop?.(); } catch {}

    resetCard('cam'); resetCard('annot');

    btnStart?.removeAttribute('disabled');
    btnStop?.setAttribute('disabled', 'true');
  }

  btnStart?.addEventListener('click', startAll);
  btnStop?.addEventListener('click',  stopAll);

  // Autostart selon config
  function maybeAutoStart() {
    const cfg = window.getConfig?.() || {};
    if (!cfg.autostart) return;

    const go = () => startAll();

    if (window.WHEP && typeof window.WHEP.play === 'function') {
      go();
      return;
    }
    // attendre l'évènement "whep-ready" (émis par whep-player)
    const onReady = () => {
      window.removeEventListener('whep-ready', onReady);
      if (window.WHEP?.play) go();
    };
    window.addEventListener('whep-ready', onReady);

    // petit filet de sécurité au cas où l'évènement est passé avant l'écoute
    setTimeout(() => { if (window.WHEP?.play) onReady(); }, 300);
  }

  // Si la config change (port, chemins, etc.), on peut redémarrer si déjà en cours
  window.onConfigChange?.((cfg) => {
    // mets à jour les spans d’info endpoints
    const epCam = document.getElementById('epCam');
    const epAn  = document.getElementById('epAnnot');
    if (epCam) epCam.textContent = buildWhepUrl('cam');
    if (epAn)  epAn.textContent  = buildWhepUrl('annot');
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeAutoStart);
  } else {
    maybeAutoStart();
  }
})();
