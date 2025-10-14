// Goal: draw boxes INSIDE the visible <video> area (object-fit: contain),
// en réutilisant la géométrie de ton overlay.js (dw/dh/dx/dy + SRC_W/H).

export function createContainOverlay({ video, canvas }) {
  if (!video || !canvas) throw new Error('createContainOverlay: missing video/canvas');
  const ctx = canvas.getContext('2d');

  let BOXES = [];
  let SRC_W = 0, SRC_H = 0;
  let running = false;

  function setBoxes(arr) { BOXES = Array.isArray(arr) ? arr : []; }
  function clearBoxes()   { BOXES = []; }
  function setSourceSize(w, h) {
    SRC_W = (w|0) > 0 ? (w|0) : 0;
    SRC_H = (h|0) > 0 ? (h|0) : 0;
  }

  // même approche que ton code: on colle le buffer canvas à la taille CSS du <video>
  function syncCanvasSizeToVideo() {
    const w = video.clientWidth  | 0;
    const h = video.clientHeight | 0;
    if (!w || !h) return false;
    if (canvas.width !== w)  canvas.width  = w;
    if (canvas.height !== h) canvas.height = h;
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    return true;
  }

  function computeDrawRect() {
    const cw = canvas.width, ch = canvas.height;
    const vw = video.videoWidth  | 0;
    const vh = video.videoHeight | 0;
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
    const refW = SRC_W > 0 ? SRC_W : vw;
    const refH = SRC_H > 0 ? SRC_H : vh;
    const sx = dw / refW;
    const sy = dh / refH;

    ctx.clearRect(0, 0, cw, ch);

    // DEBUG optionnel : cadre bleu pour vérifier la zone visible
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

  function loop() {
    if (!running) return;
    drawOnce();
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      try { video.requestVideoFrameCallback(() => loop()); return; } catch {}
    }
    requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    if (video.readyState >= 2) loop();
    else video.addEventListener('loadedmetadata', loop, { once: true });
  }
  function stop() {
    running = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    clearBoxes();
  }

  // API publique
  return { start, stop, setBoxes, clearBoxes, setSourceSize };
}
