// public/scripts/debug.js

// ---------- Small helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function el(id) {
  return /** @type {HTMLElement|null} */ (document.getElementById(id));
}

function absolutizeHttp(endpoint) {
  if (!endpoint) return '';
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith('//')) return `${location.protocol}${endpoint}`;
  if (endpoint.startsWith('/'))  return `${location.protocol}//${location.hostname}${endpoint}`;
  if (endpoint.startsWith(':'))  return `${location.protocol}//${location.hostname}${endpoint}`;
  return `${location.protocol}//${location.host}/${endpoint.replace(/^\/+/, '')}`;
}

// ---------- Orchestrator / admin debug control ----------

const orchRoot      = el('debug-orch');
const orchStatusEl  = el('orch-status');
const tableBody     = el('demo-table-body');
const btnRefresh    = el('btn-refresh-demos');
const btnStopAll    = el('btn-stop-all');
const btnRestartGpu = el('btn-restart-yolo-pose');

const ORCH_BASE  = orchRoot ? absolutizeHttp(orchRoot.dataset.orch || ':8090') : '';
const ORCH_TOKEN = orchRoot?.dataset.token || 'dev-token';

/**
 * Fetch JSON from the orchestrator (debug API).
 * Adds ?token= and x-token header automatically.
 */
async function fetchJson(path, opts = {}) {
  if (!ORCH_BASE) {
    throw new Error('Orchestrator base URL not configured');
  }

  const url = new URL(path, ORCH_BASE);
  url.searchParams.set('token', ORCH_TOKEN);

  const res = await fetch(url.toString(), {
    ...opts,
    headers: {
      'x-token': ORCH_TOKEN,
      ...(opts.headers || {}),
    },
  });

  const text = await res.text().catch(() => '');

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = JSON.parse(text || '{}');
      if (data && typeof data.detail === 'string') {
        msg += ` – ${data.detail}`;
      } else if (text) {
        msg += ` – ${text}`;
      }
    } catch {
      if (text) msg += ` – ${text}`;
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function button(label, css, disabled = false) {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = `btn small ${css || ''}`;
  if (disabled) b.disabled = true;
  return b;
}

function badgeFor(status) {
  const span = document.createElement('span');
  span.className = 'badge';

  if (!status.exists) {
    span.classList.add('miss');
    span.textContent = 'missing';
  } else if (status.running) {
    span.classList.add('on');
    span.textContent = 'running';
  } else {
    span.classList.add('off');
    span.textContent = 'stopped';
  }
  return span;
}

async function loadDemosIntoTable() {
  if (!orchRoot || !tableBody || !orchStatusEl) return;
  orchStatusEl.textContent = 'Loading demos…';

  try {
    // Use the admin-style debug endpoint (no consent required)
    const demos = await fetchJson('/debug/demos');
    tableBody.innerHTML = '';

    const order = ['yolo', 'pose', 'chang', 'price'];
    const sorted = [...demos].sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return a.id.localeCompare(b.id);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    for (const demo of sorted) {
      const tr = document.createElement('tr');

      // Demo name
      const tdName = document.createElement('td');
      tdName.textContent = demo.id;
      tr.appendChild(tdName);

      // Status badge
      const tdStatus = document.createElement('td');
      tdStatus.appendChild(badgeFor(demo));
      tr.appendChild(tdStatus);

      // URL
      const tdUrl = document.createElement('td');
      if (demo.url) {
        const a = document.createElement('a');
        a.href = demo.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'open';
        a.style.fontSize = '.8rem';
        tdUrl.appendChild(a);
      } else {
        tdUrl.textContent = '—';
      }
      tr.appendChild(tdUrl);

      // Actions
      const tdActions = document.createElement('td');
      const row = document.createElement('div');
      row.className = 'btn-row';

      const btnStart   = button('Start',   'primary', demo.running);
      const btnStop    = button('Stop',    'danger', !demo.running);
      const btnRestart = button('Restart', '',       !demo.exists);

      btnStart.addEventListener('click', () => doStartDemo(demo.id, btnStart, btnStop));
      btnStop.addEventListener('click', ()  => doStopDemo(demo.id, btnStart, btnStop));
      btnRestart.addEventListener('click', () => doRestartDemo(demo.id, btnStart, btnStop));

      row.appendChild(btnStart);
      row.appendChild(btnStop);
      row.appendChild(btnRestart);
      tdActions.appendChild(row);
      tr.appendChild(tdActions);

      tableBody.appendChild(tr);
    }

    orchStatusEl.textContent = `Orchestrator: online (${sorted.length} demos)`;
  } catch (err) {
    console.error('[debug] loadDemos failed', err);
    orchStatusEl.textContent = `Orchestrator error: ${err.message || err}`;
  }
}

async function doStartDemo(id, btnStart, btnStop) {
  try {
    btnStart.disabled = true;
    btnStop.disabled = true;

    await fetchJson(`/debug/demos/${encodeURIComponent(id)}/start`, {
      method: 'POST',
    });

    await sleep(400);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] start demo failed', id, err);
    alert(`Start ${id} failed: ${err.message || err}`);
  } finally {
    btnStart.disabled = false;
    btnStop.disabled = false;
  }
}

async function doStopDemo(id, btnStart, btnStop) {
  try {
    btnStart.disabled = true;
    btnStop.disabled = true;

    await fetchJson(`/debug/demos/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
    });

    await sleep(300);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] stop demo failed', id, err);
    alert(`Stop ${id} failed: ${err.message || err}`);
  } finally {
    btnStart.disabled = false;
    btnStop.disabled = false;
  }
}

async function doRestartDemo(id, btnStart, btnStop) {
  try {
    btnStart.disabled = true;
    btnStop.disabled = true;

    await fetchJson(`/debug/demos/${encodeURIComponent(id)}/restart`, {
      method: 'POST',
    });

    await sleep(600);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] restart demo failed', id, err);
    alert(`Restart ${id} failed: ${err.message || err}`);
  } finally {
    btnStart.disabled = false;
    btnStop.disabled = false;
  }
}

// Global buttons: stop-all & restart GPU demos (yolo + pose)
btnRefresh?.addEventListener('click', () => loadDemosIntoTable());

btnStopAll?.addEventListener('click', async () => {
  if (!confirm('Force-stop ALL demo services (yolo, pose, chang, price)?')) return;
  const ids = ['yolo', 'pose', 'chang', 'price'];
  for (const id of ids) {
    try {
      await fetchJson(`/debug/demos/${encodeURIComponent(id)}/stop`, {
        method: 'POST',
      });
    } catch (e) {
      console.warn('[debug] stop-all: failed for', id, e);
    }
  }
  await loadDemosIntoTable();
});

btnRestartGpu?.addEventListener('click', async () => {
  if (!confirm('Hard restart GPU demos (yolo + pose)?')) return;
  const ids = ['yolo', 'pose'];
  for (const id of ids) {
    try {
      await fetchJson(`/debug/demos/${encodeURIComponent(id)}/restart`, {
        method: 'POST',
      });
    } catch (e) {
      console.warn('[debug] gpu restart: failed for', id, e);
    }
  }
  await loadDemosIntoTable();
});

// ---------- WHEP PROBE (unchanged except for default annot URL) ----------

const probeRoot       = el('debug-probe');
const probeKind       = /** @type {HTMLSelectElement|null} */ (el('probe-kind'));
const probeUrlInput   = /** @type {HTMLInputElement|null} */ (el('probe-url'));
const probeConnect    = el('probe-connect');
const probeDisconnect = el('probe-disconnect');
const probeState      = el('probe-state');
const probeFps        = el('probe-fps');
const probeVideo      = /** @type {HTMLVideoElement|null} */ (el('probe-video'));
const probeLabel      = el('probe-overlay-label');
const probeError      = el('probe-error');

const WHEP_BASE_PORT = 8889;

/**
 * Build a default WHEP URL for the selected kind.
 * Note: you mentioned there is no /annot stream, but a chang_annot when chang is up.
 * We default annot -> /chang_annot/whep; you can override in the input.
 */
function buildWhepUrl(kind) {
  const base = `${location.protocol}//${location.hostname}:${WHEP_BASE_PORT}`;
  if (kind === 'annot') return `${base}/chang_annot/whep`;
  return `${base}/cam/whep`;
}

function setProbeError(msg) {
  if (!probeError) return;
  if (!msg) {
    probeError.hidden = true;
    probeError.textContent = '';
  } else {
    probeError.hidden = false;
    probeError.textContent = msg;
  }
}

let probeConnecting = false;

// Simple FPS meter
(function mountProbeFps(v, out) {
  if (!v || !out) return;
  let last = performance.now();
  let n = 0;
  const tick = () => {
    n++;
    const now = performance.now();
    if (now - last >= 1000) {
      out.textContent = `${n}`;
      n = 0;
      last = now;
    }
    (v.requestVideoFrameCallback
      ? v.requestVideoFrameCallback(tick)
      : setTimeout(tick, 33));
  };
  tick();
})(probeVideo, probeFps);

async function connectProbe() {
  if (!probeVideo || !probeKind || !probeUrlInput || !probeState) return;
  if (probeConnecting) return;

  const kind = probeKind.value || 'cam';
  const url  = probeUrlInput.value.trim() || buildWhepUrl(kind);
  probeUrlInput.value = url;

  probeConnecting = true;
  setProbeError('');
  probeState.textContent = 'connecting…';
  probeLabel && (probeLabel.textContent = kind);
  probeConnect && (probeConnect.disabled = true);
  probeDisconnect && (probeDisconnect.disabled = false);

  // clean previous stream
  try {
    if (probeVideo.srcObject) {
      const ms = probeVideo.srcObject;
      ms.getTracks?.().forEach((t) => t.stop());
      probeVideo.srcObject = null;
      probeVideo.load();
    }
  } catch {}

  try {
    // Minimal inline WHEP client (simpler than importing full whep.js here)
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.addTransceiver('video', { direction: 'recvonly' });

    pc.ontrack = (ev) => {
      const stream = ev.streams?.[0];
      if (stream) {
        probeVideo.srcObject = stream;
        probeVideo.play?.().catch(() => {});
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    });
    if (!res.ok) {
      throw new Error(`WHEP error: ${res.status}`);
    }
    const answer = await res.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });

    probeState.textContent = 'playing';
    probeVideo._pc = pc;
  } catch (err) {
    console.error('[debug] connectProbe failed', err);
    setProbeError(err?.message || 'Failed to connect WHEP stream');
    probeState.textContent = 'error';
    probeDisconnect && (probeDisconnect.disabled = true);
  } finally {
    probeConnecting = false;
    probeConnect && (probeConnect.disabled = false);
  }
}

function disconnectProbe() {
  if (!probeVideo || !probeState) return;

  try {
    const ms = probeVideo.srcObject;
    ms && ms.getTracks?.().forEach((t) => t.stop());
  } catch {}

  try {
    const pc = probeVideo._pc;
    if (pc && typeof pc.close === 'function') pc.close();
  } catch {}

  probeVideo.srcObject = null;
  try {
    probeVideo.removeAttribute?.('src');
    probeVideo.load?.();
  } catch {}

  probeState.textContent = 'idle';
  probeDisconnect && (probeDisconnect.disabled = true);
  setProbeError('');
}

probeKind?.addEventListener('change', () => {
  if (!probeUrlInput || !probeKind) return;
  const kind = probeKind.value || 'cam';
  probeUrlInput.value = buildWhepUrl(kind);
});

probeConnect?.addEventListener('click', () => connectProbe());
probeDisconnect?.addEventListener('click', () => disconnectProbe());

// ---------- Boot ----------

if (orchRoot) {
  loadDemosIntoTable();
}
if (probeKind && probeUrlInput) {
  probeUrlInput.value = buildWhepUrl(probeKind.value || 'cam');
}
