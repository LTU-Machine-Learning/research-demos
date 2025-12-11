// public/scripts/endpoints.js
(function () {
  function endpointsFromLocation(loc = window.location) {
    const base = `${loc.protocol}//${loc.hostname}:8889`;
    return {
      cam:   `${base}/cam/whep`,
      annot: `${base}/annot/whep`,
    };
  }

  function initEndpoints() {
    const epCamEl   = document.getElementById('epCam');
    const epAnnotEl = document.getElementById('epAnnot');
    if (!epCamEl || !epAnnotEl) {
      console.warn('[endpoints] elements #epCam / #epAnnot introuvables');
      return;
    }

    const eps = endpointsFromLocation();
    epCamEl.textContent   = eps.cam;
    epAnnotEl.textContent = eps.annot;

    console.log('[endpoints] set', eps);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEndpoints);
  } else {
    initEndpoints();
  }
})();
