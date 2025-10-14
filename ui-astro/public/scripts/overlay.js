// public/scripts/overlay.js
// Goal: draw boxes INSIDE the visible <video> area (object-fit: contain).
(function () {
  const $ = (id) => document.getElementById(id);

  const srcCamVideo  = $('webrtc');      // source stream (same as overlay)
  const overlayVideo = $('camOverlay');  // the <video> we overlay
  const canvas       = $('ovl');
  const ctx          = canvas.getContext('2d');

  // Boxes are expected in the "source space" (W×H) you send in WS; if you don't
  // send W/H, we assume they are in decoded video space (videoWidth×videoHeight).
  let BOXES = [];
  let SRC_W = 0, SRC_H = 0;

  // API used by WS script
  window.setOverlayBoxes = (arr) => { BOXES = Array.isArray(arr) ? arr : []; };
  window.clearOverlayBoxes = () => { BOXES = []; };
  window.setOverlaySourceSize = (w, h) => {
    SRC_W = (w|0) > 0 ? (w|0) : 0;
    SRC_H = (h|0) > 0 ? (h|0) : 0;
  };

  // Keep canvas exactly the same CSS size as the video element (no DPR scaling)
  function syncCanvasSizeToVideo() {
    const w = overlayVideo.clientWidth  | 0;
    const h = overlayVideo.clientHeight | 0;
    if (!w || !h) return false;
    if (canvas.width !== w)  canvas.width  = w;
    if (canvas.height !== h) canvas.height = h;
    // Make sure the CSS size also matches (it already should via your CSS)
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    return true;
  }

  // Compute the draw rectangle (letterboxed video area) inside the <video> box
  function computeDrawRect() {
    const cw = canvas.width, ch = canvas.height;
    const vw = overlayVideo.videoWidth  | 0;
    const vh = overlayVideo.videoHeight | 0;
    if (!cw || !ch || !vw || !vh) return null;

    const r  = Math.min(cw / vw, ch / vh);
    const dw = Math.round(vw * r);
    const dh = Math.round(vh * r);
    const dx = Math.floor((cw - dw) / 2);
    const dy = Math.floor((ch - dh) / 2);
    return { cw, ch, vw, vh, dx, dy, dw, dh };
  }

  function drawOnce() {
    if (!syncCanvasSizeToVideo()) return;
    const geom = computeDrawRect();
    if (!geom) return;

    const { cw, ch, vw, vh, dx, dy, dw, dh } = geom;

    // Choose reference space for incoming boxes
    const refW = SRC_W > 0 ? SRC_W : vw;
    const refH = SRC_H > 0 ? SRC_H : vh;

    // Scale from ref space -> drawn area
    const sx = dw / refW;
    const sy = dh / refH;

    ctx.clearRect(0, 0, cw, ch);

    // OPTIONAL: draw the blue frame once if you want to verify geometry
    // ctx.strokeStyle = 'rgba(0,150,255,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(dx, dy, dw, dh);

    ctx.lineWidth = 2;
    ctx.font = '12px system-ui';

    for (const b of BOXES) {
      const x = dx + (b.x || 0) * sx;
      const y = dy + (b.y || 0) * sy;
      const w = (b.w || 0) * sx;
      const h = (b.h || 0) * sy;

      ctx.strokeStyle = 'rgba(0,255,0,0.95)';
      ctx.strokeRect(x, y, w, h);

      if (b.label) {
        const pad = 3, tw = ctx.measureText(b.label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, y - 16, tw + pad * 2, 16);
        ctx.fillStyle = '#00ff00';
        ctx.fillText(b.label, x + pad, y - 4);
      }
    }
  }

  // Attach the same stream as cam preview to overlay video
  function attachOverlayVideo() {
    const ms = srcCamVideo?.srcObject;
    if (ms && overlayVideo.srcObject !== ms) {
      overlayVideo.srcObject = ms;
      overlayVideo.play?.().catch(()=>{});
    }
  }

  let running = false;
  function loop() {
    if (!running) return;
    drawOnce();
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      try { overlayVideo.requestVideoFrameCallback(() => loop()); return; } catch {}
    }
    requestAnimationFrame(loop);
  }

  function start() {
    attachOverlayVideo();
    if (running) return;
    running = true;
    if (overlayVideo.readyState >= 2) loop();
    else overlayVideo.addEventListener('loadedmetadata', loop, { once: true });
  }

  function stop() {
    running = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    window.clearOverlayBoxes?.();
    // do NOT change canvas size here; keep it matched to the video by CSS
  }

  // expose to orchestrator
  window.overlayStart = start;
  window.overlayStop  = stop;

  // auto-follow cam preview life cycle
  srcCamVideo?.addEventListener('playing', start);
  srcCamVideo?.addEventListener('emptied', stop);

  if (srcCamVideo?.readyState >= 2 && srcCamVideo.srcObject) start();
})();
