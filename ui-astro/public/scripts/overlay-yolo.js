// public/scripts/overlay-yolo.js
export function mountOverlay(video, canvas) {
  const ctx = canvas.getContext('2d');
  const DPR = Math.max(1, window.devicePixelRatio || 1);

  function sizeToVideo() {
    const w = video.videoWidth || 0;
    const h = video.videoHeight || 0;
    if (!w || !h) return; // on redimensionnera dès qu'on aura des dimensions
    canvas.width  = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.width  = '100%';
    canvas.style.height = '100%';
  }

  // Dessin minimal “preuve de vie”
  function drawOverlay() {
    // sécurité si pas encore prêt
    if (!video.videoWidth || !video.videoHeight) return;

    // (ré)adapte la taille si la résolution a changé
    const needW = Math.round(video.videoWidth * DPR);
    const needH = Math.round(video.videoHeight * DPR);
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Cadre vert
    const pad = 10 * DPR;
    ctx.lineWidth = 4 * DPR;
    ctx.strokeStyle = '#27d07d';
    ctx.strokeRect(pad, pad, canvas.width - 2 * pad, canvas.height - 2 * pad);

    // Badge résolution
    const label = `${video.videoWidth}×${video.videoHeight}`;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(pad, pad, (label.length * 11 + 16) * DPR, 36 * DPR);
    ctx.fillStyle = '#e8eefc';
    ctx.font = `${18 * DPR}px system-ui, sans-serif`;
    ctx.fillText(label, (pad + 8 * DPR), (pad + 24 * DPR));

    // 👉 ici tu peux dessiner tes boxes/landmarks YOLO
    // ex: drawBox(x, y, w, h), drawKeypoints(points), etc.
  }

  // Boucle de rendu synchronisée sur les frames vidéo
  function loop() {
    drawOverlay();
    if (video.requestVideoFrameCallback) {
      video.requestVideoFrameCallback(loop);
    } else {
      setTimeout(loop, 33);
    }
  }

  // Quand les métadonnées arrivent, on a les dimensions
  const onMeta = () => {
    sizeToVideo();
    // Démarre la boucle seulement après avoir une dimension > 0
    loop();
  };

  if (video.videoWidth && video.videoHeight) {
    // déjà prêt (reconnexion)
    sizeToVideo();
    loop();
  } else if (video.readyState >= 1) { // HAVE_METADATA
    onMeta();
  } else {
    video.addEventListener('loadedmetadata', onMeta, { once: true });
  }

  // Resize fenêtre → ajuste DPR/style (le buffer est géré dans drawOverlay)
  window.addEventListener('resize', sizeToVideo);
}
