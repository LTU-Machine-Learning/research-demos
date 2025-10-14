// viewer.js — YOLO (boxes) + YOLO-Pose (keypoints only) with smoothing (no blink)

// ---------- imports ----------
import { connectWhep } from "/scripts/whep.js";
import { createContainOverlay } from "/scripts/overlay-contain.js";

// ---------- URL helpers ----------
const absolutizeHttp = (endpoint) => {
  if (!endpoint) return "";
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith("//")) return `${location.protocol}${endpoint}`;
  if (endpoint.startsWith("/"))  return `${location.protocol}//${location.hostname}${endpoint}`;
  if (endpoint.startsWith(":"))  return `${location.protocol}//${location.hostname}${endpoint}`;
  return `${location.protocol}//${location.hostname}/${endpoint.replace(/^\/+/, "")}`;
};
const absolutizeWs = (endpoint) => {
  if (!endpoint) return "";
  if (/^wss?:\/\//i.test(endpoint)) return endpoint;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  if (endpoint.startsWith("//")) return `${proto}${endpoint.slice(1)}`;
  if (endpoint.startsWith("/"))  return `${proto}//${location.hostname}${endpoint}`;
  if (endpoint.startsWith(":"))  return `${proto}//${location.hostname}${endpoint}`;
  return `${proto}//${location.hostname}/${endpoint.replace(/^\/+/, "")}`;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const nowMs = () => performance.now();

// ---------- logger ----------
const T0 = performance.now();
const ts = () => (performance.now() - T0).toFixed(1).padStart(6, ' ');
const log  = (...a) => console.log(`[demo/viewer +${ts()}ms]`, ...a);
const warn = (...a) => console.warn(`[demo/viewer +${ts()}ms]`, ...a);

// ---------- elements & cfg ----------
const root    = document.getElementById('yolo-root');
const video   = document.getElementById('yolo-video');
const canvas  = document.getElementById('yolo-canvas');
const stateEl = document.getElementById('state');
const fpsEl   = document.getElementById('fps');

const btnStart  = document.getElementById('btn-start');
const btnStop   = document.getElementById('btn-stop');
const btnReconn = document.getElementById('btn-reconn');
const btnRestart= document.getElementById('btn-restart');
const btnResetOverlay = document.getElementById('btn-reset-overlay');

const DEMO_ID = root?.dataset?.demoid || 'yolo';
const WS_KIND = (root?.dataset?.wsKind || 'boxes').toLowerCase(); // "boxes" | "pose"
const TOKEN   = root?.dataset?.token  || 'dev-token';
const ORCH    = absolutizeHttp(root?.dataset?.orch || ':8090');
const camUrl  = absolutizeHttp(root?.dataset?.cam  || '');
const WS_URL  = absolutizeWs(root?.dataset?.ws || (WS_KIND === 'pose' ? ':5000/ws/pose' : ':5000/ws/dets'));
// ---- Consent (uniquement pour START) ----
const CONSENT_KEY = (id) => `vh_consent_${id}`;

function getConsent(id) {
  try {
    const raw = localStorage.getItem(CONSENT_KEY(id));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.token || !obj?.expiresAt) return null;
    if (Date.now() >= obj.expiresAt) return null;
    return obj;
  } catch { return null; }
}
function setConsent(id, rec) {
  try { localStorage.setItem(CONSENT_KEY(id), JSON.stringify(rec)); } catch {}
}
function clearConsent(id) {
  try { localStorage.removeItem(CONSENT_KEY(id)); } catch {}
}

/** Ouvre la modal si besoin, puis appelle l’API /consent pour obtenir un JWT */
async function ensureConsentForStart(id) {
  const have = getConsent(id);
  if (have) return have;

  const ask = window[`askConsent_${id}`];
  const ok  = typeof ask === 'function' ? await ask() : true;
  if (!ok) throw new Error('consent denied');

  const resp = await fetch(`${ORCH}/consent?demo=${encodeURIComponent(id)}`, { method: 'POST' });
  if (!resp.ok) throw new Error(`consent error: ${resp.status}`);
  const data = await resp.json(); // { token, expiresAt }
  setConsent(id, data);
  return data;
}

/** Headers pour /start (inclut le token d’orchestrateur + le JWT de consent) */
function startHeaders(consent) {
  return { 'x-token': TOKEN, ...(consent?.token ? { 'X-Consent-Token': consent.token } : {}) };
}

// ---------- UI states ----------
function setLoading(on) {
  if (!root) return;
  if (on) { root.classList.add('loading'); root.classList.remove('ready'); }
  else    { root.classList.remove('loading'); root.classList.add('ready'); }
}
function setStopped(on) {
  if (!root) return;
  if (on) { root.classList.add('stopped'); }
  else    { root.classList.remove('stopped'); }
}
setLoading(true);
setStopped(false);

// ---------- overlay (boxes renderer) ----------
const overlay = createContainOverlay({ video, canvas });
function clearOverlay(){
  try {
    overlay.setBoxes([]);
    const ctx = canvas.getContext('2d');
    ctx && ctx.clearRect(0,0,canvas.width,canvas.height);
  } catch {}
}

// ---------- FPS ----------
(function mountFps(v, out){
  if (!v || !out) return;
  let last = performance.now(), n = 0;
  const tick = () => {
    n++;
    const now = performance.now();
    if (now - last >= 1000) { out.textContent = `${n}`; n = 0; last = now; }
    (v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : setTimeout(tick, 33));
  };
  tick();
})(video, fpsEl);

// ---------- orchestrator ----------
async function ensureUp() {
  try {
    // /status ne demande PAS de consent → header minimal (x-token)
    const r = await fetch(`${ORCH}/demos/${DEMO_ID}/status`, {
      headers: { 'x-token': TOKEN },
      credentials: 'omit'
    });
    const st = await r.json().catch(() => ({}));

    if (!st?.running) {
      // Consent uniquement au moment du START
      let consent = getConsent(DEMO_ID) || await ensureConsentForStart(DEMO_ID);

      let r2 = await fetch(`${ORCH}/demos/${DEMO_ID}/start?wait=1&timeout=90`, {
        method: 'POST',
        headers: startHeaders(consent),
        credentials: 'omit'
      });

      // Si token expiré entre-temps → on regénère et on retente 1 fois
      if (r2.status === 401) {
        clearConsent(DEMO_ID);
        consent = await ensureConsentForStart(DEMO_ID);
        r2 = await fetch(`${ORCH}/demos/${DEMO_ID}/start?wait=1&timeout=90`, {
          method: 'POST',
          headers: startHeaders(consent),
          credentials: 'omit'
        });
      }

      if (!r2.ok) {
        throw new Error((await r2.text().catch(() => '')) || `HTTP ${r2.status}`);
      }
    }
  } catch (e) {
    warn('ensureUp failed', e?.message || e);
  }
}

async function ensureRunning(timeoutMs = 8000) {
  const t0 = nowMs();
  while (nowMs() - t0 < timeoutMs) {
    try {
      // /status sans consent
      const r = await fetch(`${ORCH}/demos/${DEMO_ID}/status`, {
        headers: { 'x-token': TOKEN },
        cache: 'no-store'
      });
      const st = await r.json();
      if (st?.running) return true;
    } catch {}
    await sleep(350);
  }
  return false;
}
async function waitStopped(timeoutMs = 5000) {
  const t0 = nowMs();
  while (nowMs() - t0 < timeoutMs) {
    try {
      // /status sans consent
      const r = await fetch(`${ORCH}/demos/${DEMO_ID}/status`, {
        headers: { 'x-token': TOKEN },
        cache: 'no-store'
      });
      const st = await r.json();
      if (!st?.running) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

// ---------- media helpers ----------
function whenVideoReady(v) {
  if (v.readyState >= 1 && v.videoWidth && v.videoHeight) return Promise.resolve();
  return new Promise(res => v.addEventListener('loadedmetadata', res, { once: true }));
}
async function whenCanvasReady(cnv) {
  while (!(cnv.width > 0 && cnv.height > 0)) { await new Promise(r => requestAnimationFrame(r)); }
  await new Promise(r => requestAnimationFrame(r));
}
function waitVideoPlayable(v, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; ok ? resolve() : reject(new Error('video timeout')); } };
    const onMeta = () => {
      if (v.videoWidth && v.videoHeight) {
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => finish(true));
        else setTimeout(() => finish(true), 150);
      }
    };
    if (v.readyState >= 1 && v.videoWidth && v.videoHeight) onMeta();
    else v.addEventListener('loadedmetadata', onMeta, { once: true });
    const tid = setInterval(() => {
      if (performance.now() - t0 > timeoutMs) { clearInterval(tid); finish(false); }
    }, 200);
  });
}

let whepConnecting = false;
async function ensureWhep(v, url) {
  const hasLive = !!v.srcObject && v.srcObject.getTracks?.().some(t => t.readyState === 'live');
  if (hasLive || whepConnecting) return;
  whepConnecting = true;
  try { await connectWhep(url, v); } finally { whepConnecting = false; }
}

// ---------- Pose drawing & smoothing ----------
const DEFAULT_EDGES = [
  [5,6],[5,7],[7,9],[6,8],[8,10],[11,12],[5,11],[6,12],
  [11,13],[13,15],[12,14],[14,16],[0,5],[0,6],[0,1],[0,2],[1,3],[2,4]
];

// contain mapping
function mapPointContain(x, y, W, H, cw, ch) {
  const s = Math.min(cw / W, ch / H);
  const dx = (cw - W * s) / 2;
  const dy = (ch - H * s) / 2;
  return [x * s + dx, y * s + dy];
}

// pose state (RAF loop + linger)
const POSE_LINGER_MS = 200;
let poseLastMsg = null;   // {ts,w,h,people:[{kpts:[[x,y]|null]x17}], skeleton?:[]}
let poseLastGoodTs = 0;

// RAF render loop (avoids blink)
function drawPoseFrame() {
  if (WS_KIND !== 'pose') return;      // Only active in pose mode
  const ctx = canvas.getContext('2d'); if (!ctx) { requestAnimationFrame(drawPoseFrame); return; }
  const cw = canvas.width, ch = canvas.height;
  ctx.clearRect(0,0,cw,ch);

  const now = performance.now();
  const canLinger = now - poseLastGoodTs <= POSE_LINGER_MS;
  const msg = poseLastMsg;

  if (msg && (Array.isArray(msg.people) && (msg.people.length > 0 || canLinger))) {
    const W = msg.w|0, H = msg.h|0;
    const EDGES = Array.isArray(msg.skeleton) ? msg.skeleton : DEFAULT_EDGES;

    ctx.lineWidth = Math.max(2, Math.round(Math.min(cw, ch) / 360));
    ctx.strokeStyle = 'rgba(255,255,0,0.95)';
    ctx.fillStyle = 'rgba(0,255,0,0.95)';
    const r = Math.max(2, Math.round(Math.min(cw, ch) / 320));

    for (const person of msg.people) {
      const kpts = person.kpts;
      if (!kpts || kpts.length < 17) continue;

      // segments
      ctx.beginPath();
      for (const [a,b] of EDGES) {
        const ka = kpts[a], kb = kpts[b];
        if (!ka || !kb) continue;
        const [x1,y1] = mapPointContain(ka[0], ka[1], W, H, cw, ch);
        const [x2,y2] = mapPointContain(kb[0], kb[1], W, H, cw, ch);
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      }
      ctx.stroke();

      // points
      for (let j = 0; j < 17; j++) {
        const p = kpts[j];
        if (!p) continue;
        const [x,y] = mapPointContain(p[0], p[1], W, H, cw, ch);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
      }
    }
  }

  requestAnimationFrame(drawPoseFrame);
}

// ---------- boot ----------
(async () => {
  try { log('ensureUp…'); await ensureUp(); log('ensureUp ok'); } catch(e){ warn('ensureUp failed', e?.message || e); }

  if (!camUrl) { warn('No camUrl found in data-cam'); }

  // WebRTC
  stateEl && (stateEl.textContent = 'connecting…');
  log('connectWhep →', camUrl);
  try { await connectWhep(camUrl, video); log('connectWhep ok'); }
  catch (e) { warn('connectWhep failed', e?.message || e); }

  await whenVideoReady(video);
  log('video dims', video.videoWidth, 'x', video.videoHeight);

  // stacking & initial size
  root.style.position = root.style.position || 'relative';
  Object.assign(video.style,  { position:'absolute', inset:'0', zIndex:'1' });
  Object.assign(canvas.style, { position:'absolute', inset:'0', zIndex:'2', pointerEvents:'none' });
  canvas.width  = video.clientWidth  || video.videoWidth  || 1280;
  canvas.height = video.clientHeight || video.videoHeight || 720;

  // overlay for boxes
  overlay.setSourceSize(video.videoWidth || 1280, video.videoHeight || 720);
  overlay.start();
  stateEl && (stateEl.textContent = 'playing');
  log('overlay started');

  // sync sizes on resize
  let pendingResize=false, lastW=canvas.width, lastH=canvas.height;
  const ro = new ResizeObserver(() => {
    if (pendingResize) return;
    pendingResize = true;
    requestAnimationFrame(() => {
      pendingResize = false;
      const w = video.clientWidth  || video.videoWidth  || 1280;
      const h = video.clientHeight || video.videoHeight || 720;
      if (w !== lastW || h !== lastH) {
        lastW = w; lastH = h;
        canvas.width  = w;
        canvas.height = h;
        overlay.setSourceSize(w, h);
        // keep pose mapping in sync too
        if (poseLastMsg) {
          // nothing extra to do; render loop uses poseLastMsg.w/h + mapPointContain
        }
      }
    });
  });
  ro.observe(root);

  // ---------- WS ----------
  const STORAGE_KEY = 'yolo:last-dets';
  let ws;
  let intent   = 'running';
  let stopSent = false;
  let lastStopAt = 0;

  let wsOpenedResolve;
  let wsOpened = new Promise(res => (wsOpenedResolve = res));
  const resetWsOpened = () => { wsOpened = new Promise(res => (wsOpenedResolve = res)); };

  // start RAF for pose (no-blink)
  requestAnimationFrame(drawPoseFrame);

  let reconnectDelay = 500;
  function openWS(force = false) {
    if (!WS_URL) { warn('No WS_URL; skipping WS'); return; }
    if (intent !== 'running' && !force) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) && !force) return;
    try { ws?.close(1000, 'reopen'); } catch {}
    resetWsOpened();
    log('ws connect →', WS_URL);
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => { log('[ws] open'); wsOpenedResolve?.(); reconnectDelay = 500; };
    ws.onerror = (e) => warn('[ws] error', e);
    ws.onclose = async (ev) => {
      warn('[ws] close', ev.code, ev.reason);
      if (intent === 'running' && !document.hidden) {
        await ensureRunning(5000);
        setTimeout(() => openWS(), reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.6, 5000);
      }
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const base = video;

        // ----- POSE MODE -----
        if (WS_KIND === 'pose') {
          // Expect { ts, w, h, skeleton?, people:[{kpts:[[x,y]|null]x17}] }
          // (Also accept legacy { poses: [...] })
          const people = Array.isArray(data.people) ? data.people
                       : Array.isArray(data.poses)  ? data.poses
                       : null;
          if (!people) return;

          const W = (data.w|0) || (base.videoWidth|0) || 1280;
          const H = (data.h|0) || (base.videoHeight|0) || 720;

          overlay.setSourceSize(W, H); // keep mapping aligned (even if boxes unused)

          // Cache last message; RAF loop will draw (prevents blink)
          poseLastMsg = { ts: data.ts|0, w: W, h: H, people, skeleton: data.skeleton };
          if (people.length > 0) poseLastGoodTs = performance.now();

          // Do NOT clear overlay.setBoxes() repeatedly here; leave RAF to draw
          return;
        }

        // ----- BOXES MODE (YOLO classic) -----
        if (!data || !Array.isArray(data.boxes)) return;
        const W = (data.w|0) || (base.videoWidth|0) || 1280;
        const H = (data.h|0) || (base.videoHeight|0) || 720;
        overlay.setSourceSize(W, H);

        // cache for refresh hydration
        try { sessionStorage.setItem(STORAGE_KEY, ev.data); } catch {}

        const boxes = data.boxes.map(b => {
          const x1=b.x1|0, y1=b.y1|0, x2=b.x2|0, y2=b.y2|0;
          const hasCls = b.cls !== undefined && b.cls !== null;
          const nameFromMap = (hasCls && globalThis.overlayClassMap)
            ? globalThis.overlayClassMap[b.cls] : undefined;
          const confPct = (b.conf !== undefined && b.conf !== null)
            ? `${Math.round(b.conf*100)}%` : undefined;
          const label = b.label ?? (nameFromMap
            ? (confPct ? `${nameFromMap}:${confPct}` : nameFromMap)
            : (hasCls ? (confPct ? `#${b.cls}:${confPct}` : `#${b.cls}`) : undefined));
          return { x:x1, y:y1, w:Math.max(0,x2-x1), h:Math.max(0,y2-y1), label };
        });
        overlay.setBoxes(boxes);
      } catch(e) {
        warn('[ws] bad message', e?.message || e);
      }
    };
  }

  // hydrate cache (boxes only)
  try {
    if (WS_KIND !== 'pose') {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        const data = JSON.parse(cached);
        const W = (data.w|0) || (video.videoWidth|0) || 1280;
        const H = (data.h|0) || (video.videoHeight|0) || 720;
        overlay.setSourceSize(W, H);
        const boxes = (data.boxes||[]).map(b => {
          const x1=b.x1|0, y1=b.y1|0, x2=b.x2|0, y2=b.y2|0;
          const hasCls = b.cls !== undefined && b.cls !== null;
          const nameFromMap = (hasCls && globalThis.overlayClassMap) ? globalThis.overlayClassMap[b.cls] : undefined;
          const confPct = (b.conf !== undefined && b.conf !== null) ? `${Math.round(b.conf*100)}%` : undefined;
          const label = b.label ?? (nameFromMap ? (confPct ? `${nameFromMap}:${confPct}` : nameFromMap)
                                                : (hasCls ? (confPct ? `#${b.cls}:${confPct}` : `#${b.cls}`) : undefined));
          return { x:x1, y1, w:Math.max(0,x2-x1), h:Math.max(0,y2-y1), label };
        });
        overlay.setBoxes(boxes);
      }
    }
  } catch {}
  openWS();

  // READY GATE
  const after = (ms) => new Promise(r => setTimeout(r, ms));
  async function readyGate({ useCacheOk = true } = {}) {
    const cached = useCacheOk ? (() => { try { return sessionStorage.getItem('yolo:last-dets'); } catch { return null; } })() : null;
    await whenVideoReady(video);
    await whenCanvasReady(canvas);
    await Promise.race([ (async () => { if (!cached) await wsOpened; })(), after(1200) ]);
    await waitVideoPlayable(video).catch(()=>{});
    setLoading(false);
    setStopped(false);
  }
  await readyGate();

  // heartbeat
  function beat() {
    fetch(`${ORCH}/demos/${DEMO_ID}/heartbeat?token=${encodeURIComponent(TOKEN)}`, {
      method: 'POST',
      keepalive: true
    }).catch(() => {});
  }

  beat();
  let hb = setInterval(beat, 25_000);

  // stop / resume
  function stopDemoFireAndForget(reason = '') {
    if (stopSent) return;
    stopSent = true;
    intent = 'stopped';
    if (hb) { clearInterval(hb); hb = null; }

    try {
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => { try { t.stop(); } catch {} });
        video.srcObject = null;
        video.load(); video.pause(); video.currentTime = 0;
      }
    } catch {}

    clearOverlay();
    setStopped(true);
    setLoading(false);
    stateEl && (stateEl.textContent = 'stopped');

    try { ws?.close(1000, 'intent-stop'); } catch {}

    // /stop sans consent (simple)
    fetch(`${ORCH}/demos/${DEMO_ID}/stop?token=${encodeURIComponent(TOKEN)}`, {
      method: 'POST',
      keepalive: true
    }).catch(() => {});

    log('stop →', reason);
    lastStopAt = nowMs();
  }


  async function resumeDemo(reason = '') {
    setStopped(false);
    setLoading(true);
    intent = 'running';

    const sinceStop = nowMs() - lastStopAt;
    if (sinceStop < 1200) await sleep(1200 - sinceStop);

    try {
      // Consent uniquement pour START
      let consent = getConsent(DEMO_ID) || await ensureConsentForStart(DEMO_ID);

      let rStart = await fetch(`${ORCH}/demos/${DEMO_ID}/start?wait=1&timeout=90`, {
        method: 'POST',
        headers: startHeaders(consent)
      }).catch(() => {});

      if (rStart && rStart.status === 401) {
        // expiré → on regénère et on retente 1 fois
        clearConsent(DEMO_ID);
        consent = await ensureConsentForStart(DEMO_ID);
        rStart = await fetch(`${ORCH}/demos/${DEMO_ID}/start?wait=1&timeout=90`, {
          method: 'POST',
          headers: startHeaders(consent)
        }).catch(() => {});
      }

      const ok = await ensureRunning(8000);
      if (ok) {
        await ensureWhep(video, camUrl);
        openWS(true);
        await readyGate({ useCacheOk: true });
      } else {
        warn('resume: container did not reach running state in time');
        setLoading(false);
      }
    } catch (e) {
      warn('resume failed', e?.message || e);
      setLoading(false);
    }

    if (!hb) { beat(); hb = setInterval(beat, 25_000); }
    stopSent = false;
    stateEl && (stateEl.textContent = 'running');
    log('resume ←', reason);
  }

  // buttons (lock)
  const actionButtons = [btnStart, btnStop, btnReconn, btnRestart, btnResetOverlay].filter(Boolean);
  let actionLocked = false;
  const setButtonsEnabled = (enabled) => actionButtons.forEach(b => b.disabled = !enabled);
  async function withActionLock(fn, minCooldownMs = 5000) {
    if (actionLocked) return;
    actionLocked = true; setButtonsEnabled(false);
    try { await fn(); }
    catch(e){ warn('action failed', e?.message || e); }
    finally { setTimeout(() => { actionLocked = false; setButtonsEnabled(true); }, minCooldownMs); }
  }

  btnStart?.addEventListener('click', () => withActionLock(async () => { await resumeDemo('manual-start'); }));
  btnStop?.addEventListener('click',  () => withActionLock(async () => { stopDemoFireAndForget('manual-stop'); }));
  btnReconn?.addEventListener('click',() => withActionLock(async () => {
    setLoading(true);
    try { ws?.close(1000, 'manual-reconnect'); } catch {}
    await ensureRunning(4000);
    openWS(true);
    await waitVideoPlayable(video).catch(()=>{});
    setLoading(false);
  }));
  btnRestart?.addEventListener('click',() => withActionLock(async () => {
    setLoading(true);
    stopDemoFireAndForget('manual-restart');
    const stopped = await waitStopped(6000);
    if (!stopped) await sleep(2000);
    await resumeDemo('manual-restart');
  }));
  btnResetOverlay?.addEventListener('click', () => withActionLock(async () => {
    clearOverlay();
    try { sessionStorage.removeItem('yolo:last-dets'); } catch {}
    // also clear pose state
    poseLastMsg = null; poseLastGoodTs = 0;
  }, 1000));

  // lifecycle (do not stop orchestrator on refresh)
  window.addEventListener('beforeunload', () => { try { sessionStorage.setItem('yolo:reloading', '1'); } catch {} });
  try { if (sessionStorage.getItem('yolo:reloading') === '1') { sessionStorage.removeItem('yolo:reloading'); } } catch {}
  window.addEventListener('pagehide', () => {
    const reloadingNow = sessionStorage.getItem('yolo:reloading') === '1';
    if (!reloadingNow) { try { ws?.close(1000, 'pagehide'); } catch {} }
  });

})();
