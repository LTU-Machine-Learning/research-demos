// public/scripts/annot-lag.js
// Estime le délai (ms) base→annot de façon robuste (multi-ROI, contrôle de pic), recherche globale 0..max (pas de fenêtre adaptative).
(function () {
  const $ = (id) => document.getElementById(id);
  const vCam   = $('webrtc');
  const vAnnot = $('annotRtc');

  const SETTINGS = {
    expectedLagMs: 500,    // amorce EMA/biais
    maxLagMs:      3000,   // recherche globale 0..max
    stepMs:        10,     // pas de re-échantillonnage et du balayage
    spanMs:        2500,   // fenêtre temporelle des séries
    updateEveryMs: 500,    // période d’estimation
    medianWin:     5,      // filtre médian court
    emaFast:       0.45,   // EMA si confiance haute
    emaSlow:       0.25,   // EMA si confiance basse
    minConfidence: 0.35,   // seuil “confiance basse”
    minPeakMargin: 0.08,   // marge min best-vs-second pour accepter
    clamp:         [0, 3000], // bornes finales (0..max)
    rois: [
      { x:0.10, y:0.10, w:0.10, h:0.10 },
      { x:0.75, y:0.10, w:0.10, h:0.10 },
      { x:0.10, y:0.75, w:0.10, h:0.10 },
      { x:0.75, y:0.75, w:0.10, h:0.10 },
      { x:0.42, y:0.42, w:0.16, h:0.16 },
    ],
  };

  // UI
  function ensureLagField() {
    const kvs = vAnnot?.closest('.card')?.querySelector('.kvs');
    if (!kvs) return null;
    let s = kvs.querySelector('#lagAnnot');
    if (s) return s;
    const b = document.createElement('b'); b.textContent = 'Δ base→annot';
    s = document.createElement('span'); s.id='lagAnnot'; s.textContent='—';
    if (kvs.children.length >= 2) { kvs.insertBefore(b, kvs.children[2]||null); kvs.insertBefore(s, kvs.children[3]||null); }
    else { kvs.appendChild(b); kvs.appendChild(s); }
    return s;
  }
  const lagOut = ensureLagField();

  // Multi-ROI sampler
  function makeMultiSampler(videoEl, rois, keepMs = SETTINGS.spanMs+1000) {
    const cnv = document.createElement('canvas');
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    const buf = [];
    function lumaAvgRect(rx, ry, rw, rh) {
      cnv.width = rw; cnv.height = rh;
      ctx.drawImage(videoEl, rx, ry, rw, rh, 0, 0, rw, rh);
      const id = ctx.getImageData(0,0,rw,rh).data;
      let s = 0, n = rw*rh;
      for (let i=0;i<n;i++){ const r=id[4*i], g=id[4*i+1], b=id[4*i+2]; s += (0.2126*r + 0.7152*g + 0.0722*b); }
      return s/n;
    }
    function sampleOnce() {
      if (!videoEl || videoEl.readyState < 2) return;
      const vw = videoEl.videoWidth|0, vh = videoEl.videoHeight|0;
      if (!vw || !vh) return;
      let sum=0, cnt=0;
      for (const R of rois) {
        const rx=(R.x*vw)|0, ry=(R.y*vh)|0, rw=Math.max(4,(R.w*vw)|0), rh=Math.max(4,(R.h*vh)|0);
        sum += lumaAvgRect(rx, ry, rw, rh); cnt++;
      }
      const now = performance.now();
      buf.push({ t: now, v: sum/Math.max(1,cnt) });
      while (buf.length && now - buf[0].t > keepMs) buf.shift();
    }
    function tickRVFC(_n,_m){ sampleOnce(); try{ videoEl.requestVideoFrameCallback(tickRVFC);}catch{} }
    function tickRAF(){ sampleOnce(); requestAnimationFrame(tickRAF); }
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) { try{ videoEl.requestVideoFrameCallback(tickRVFC);}catch{ requestAnimationFrame(tickRAF);} }
    else { requestAnimationFrame(tickRAF); }
    return () => buf.slice();
  }

  // Prétraitement & resampling (low-pass léger, diff, z-score)
  function resampleZ(series, stepMs = SETTINGS.stepMs, spanMs = SETTINGS.spanMs) {
    if (!series || series.length < 5) return { t:[], v:[] };
    const end = series[series.length - 1].t;
    const start = Math.max(series[0].t, end - spanMs);
    const n = Math.max(1, Math.floor((end - start)/stepMs) + 1);
    const outT = new Array(n), rawV = new Array(n);
    let i = series.findIndex(p => p.t >= start); if (i < 0) i = 0;
    for (let k=0;k<n;k++){
      const t = start + k*stepMs; outT[k] = t;
      while (i+1 < series.length && series[i+1].t < t) i++;
      const p0 = series[i], p1 = series[Math.min(i+1, series.length-1)];
      rawV[k] = (p1.t === p0.t) ? p0.v : p0.v + (p1.v - p0.v) * ((t - p0.t) / (p1.t - p0.t));
    }
    // low-pass 3
    const lp = rawV.slice();
    for (let k=1; k<lp.length-1; k++) lp[k] = (rawV[k-1]+rawV[k]+rawV[k+1])/3;
    // high-pass (diff)
    for (let k=lp.length-1;k>0;k--) lp[k] = lp[k] - lp[k-1]; lp[0] = 0;
    // z-score + soft-clip
    const mean = lp.reduce((a,b)=>a+b,0)/lp.length;
    const sd = Math.sqrt(lp.reduce((a,b)=>a+(b-mean)*(b-mean),0)/lp.length) || 1;
    for (let k=0;k<lp.length;k++){ let z=(lp[k]-mean)/sd; if (z>3) z=3; else if (z<-3) z=-3; lp[k]=z; }
    return { t: outT, v: lp, stepMs };
  }

  // Corrélation 0..max avec contrôle de pic; biais doux vers prevLag
  function xcorrLagMs(Araw, Braw, opts = {}) {
    const { lagMin=0, lagMax=SETTINGS.maxLagMs, step=5, prevLag=null, minPeakMargin=SETTINGS.minPeakMargin } = opts;
    const A = resampleZ(Araw), B = resampleZ(Braw);
    const La = A.v.length, Lb = B.v.length;
    if (La < 30 || Lb < 30) return null;

    let best = { lag:0, score:-Infinity, count:0 };
    let second = { score:-Infinity };

    // On parcourt toute la fenêtre 0..max (pas de restriction adaptative)
    for (let L=lagMin; L<=lagMax; L+=step) {
      const m = Math.round(L/SETTINGS.stepMs);
      const i0 = 0, i1 = Math.min(La, Lb - m);
      const cnt = i1 - i0; if (cnt < 30) continue;

      let s=0, sa=0, sb=0;
      for (let i=0;i<i1;i++){ const a=A.v[i], b=B.v[i+m]; s+=a*b; sa+=a*a; sb+=b*b; }
      let score = s / Math.sqrt(sa*sb || 1);

      // Biais doux vers prevLag, sans restreindre
      if (prevLag != null) { const d = Math.abs(L - prevLag); score += Math.exp(-d/250) * 0.02; }

      if (score > best.score) { second = best; best = { lag:L, score, count:cnt }; }
      else if (score > second.score) { second = { lag:L, score, count:cnt }; }
    }

    if (best.score === -Infinity) return null;

    const margin = best.score - Math.max(-1, second.score);
    const qty    = Math.min(1, best.count/120);
    let confidence = Math.max(0, Math.min(1, 0.6*margin + 0.4*qty));

    if (margin < minPeakMargin) confidence = Math.min(confidence, 0.2);
    return { lag: best.lag, score: best.score, confidence, count: best.count };
  }

  // Tracker: médian + EMA + clamp (0..max), pas de fenêtre adaptative
  function makeLagTracker() {
    let prevLag = SETTINGS.expectedLagMs;
    let ema  = null;
    const recent = [];
    const median = (arr) => { const a=arr.slice().sort((x,y)=>x-y), m=a.length>>1; return a.length%2?a[m]:(a[m-1]+a[m])/2; };

    return {
      estimate(getA, getB) {
        const res = xcorrLagMs(getA(), getB(), { lagMin: 0, lagMax: SETTINGS.maxLagMs, step: 5, prevLag });
        if (!res) return null;

        // clamp 0..max
        let rawLag = Math.max(SETTINGS.clamp[0], Math.min(SETTINGS.clamp[1], res.lag));

        // médian court (anti-outliers)
        recent.push(rawLag); if (recent.length > SETTINGS.medianWin) recent.shift();
        const med = median(recent);

        // EMA conditionnelle selon confiance
        const alpha = res.confidence >= SETTINGS.minConfidence ? SETTINGS.emaFast : SETTINGS.emaSlow;
        ema = (ema == null) ? med : (1-alpha)*ema + alpha*med;

        prevLag = ema; // sert uniquement au biais doux (pas de restriction)
        return { lag: ema, confidence: res.confidence, score: res.score };
      },
      reset(){ prevLag = SETTINGS.expectedLagMs; ema = null; recent.length = 0; }
    };
  }

  function waitPlaying(v) {
    return new Promise((resolve) => {
      if (v && v.readyState >= 2 && !v.paused) return resolve();
      const onPlay = () => { v.removeEventListener('playing', onPlay); resolve(); };
      v.addEventListener('playing', onPlay, { once: true });
    });
  }

  async function startLag() {
    const lagOut = ensureLagField();
    if (!vCam || !vAnnot || !lagOut) return;
    await Promise.all([waitPlaying(vCam), waitPlaying(vAnnot)]);

    const getCam   = makeMultiSampler(vCam, SETTINGS.rois);
    const getAnnot = makeMultiSampler(vAnnot, SETTINGS.rois);
    const tracker  = makeLagTracker();

    function tick() {
      const est = tracker.estimate(getCam, getAnnot);
      if (est) {
        const ms = Math.round(est.lag);
        const conf = Math.round(est.confidence * 100);
        lagOut.textContent = `${ms} ms (conf ${conf}%)`;
        lagOut.title = `lag≈${ms} ms • confidence=${conf}%`;
      }
      setTimeout(tick, SETTINGS.updateEveryMs);
    }
    tick();

    const reset = () => { lagOut.textContent = '—'; lagOut.title = ''; tracker.reset(); };
    vCam.addEventListener('emptied', reset);
    vAnnot.addEventListener('emptied', reset);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startLag);
  else startLag();
})();
