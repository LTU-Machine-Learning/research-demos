// public/scripts/debug.js

import { connectWhep } from '/scripts/whep.js';

// --- small helpers -------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const absolutizeHttp = (endpoint) => {
  if (!endpoint) return '';
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith('//')) return `${location.protocol}${endpoint}`;
  if (endpoint.startsWith('/')) return `${location.protocol}//${location.hostname}${endpoint}`;
  if (endpoint.startsWith(':')) return `${location.protocol}//${location.hostname}${endpoint}`;
  return `${location.protocol}//${location.host}/${endpoint.replace(/^\/+/, '')}`;
};

function el(id) {
  return /** @type {HTMLElement|null} */ (document.getElementById(id));
}

// --- orchestrator control -----------------------------------------------

const orchRoot       = el('debug-orch');
const orchStatusEl   = el('orch-status');
const tableBody      = el('demo-table-body');
const btnRefresh     = el('btn-refresh-demos');
const btnStopAll     = el('btn-stop-all');
const btnRestartGpu  = el('btn-restart-yolo-pose');

const ORCH_BASE  = orchRoot ? absolutizeHttp(orchRoot.dataset.orch || ':8090') : '';
const ORCH_TOKEN = orchRoot?.dataset.token || 'dev-token';

// demoId -> { token, expiresAt }
const CONSENT_CACHE = new Map();

/**
 * Fetch JSON from the orchestrator, with x-token + ?token=
 */
async function fetchJson(path, opts = {}) {
  const u = new URL(path, ORCH_BASE);
  // keep token in query for convenience
  u.searchParams.set('token', ORCH_TOKEN);

  const res = await fetch(u.toString(), {
    ...opts,
    headers: {
      'x-token': ORCH_TOKEN,
      ...(opts.headers || {}),
    },
  });

  const raw = await res.text().catch(() => '');
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw || null;
  }

  if (!res.ok) {
    let msg = '';
    if (payload && typeof payload === 'object') {
      msg = payload.detail || JSON.stringify(payload);
    } else {
      msg = payload || `HTTP ${res.status}`;
    }
    const err = new Error(`HTTP ${res.status} – ${msg}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  if (res.status === 204) return null;
  return payload;
}

/**
 * Ensure that we have a valid consent token for demoId.
 * Cached in-memory (Map), not persisted.
 */
async function ensureConsent(demoId) {
  const cached = CONSENT_CACHE.get(demoId);
  const now = Date.now();
  if (cached && cached.expiresAt && now < cached.expiresAt && cached.token) {
    return cached;
  }

  const u = new URL('/consent', ORCH_BASE);
  u.searchParams.set('demo', demoId);
  // if your /consent also wants token, we send it here too
  u.searchParams.set('token', ORCH_TOKEN);

  const res = await fetch(u.toString(), {
    method: 'POST',
    headers: { 'x-token': ORCH_TOKEN },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`consent error: HTTP ${res.status} – ${text || 'request failed'}`);
  }

  const data = await res.json(); // expected: { token, expiresAt (ms) }
  if (!data || !data.token || !data.expiresAt) {
    throw new Error('consent error: invalid payload from /consent');
  }

  CONSENT_CACHE.set(demoId, data);
  return data;
}

function invalidateConsent(demoId) {
  CONSENT_CACHE.delete(demoId);
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
    const demos = await fetchJson('/demos');
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

      const tdName = document.createElement('td');
      tdName.textContent = demo.id;
      tr.appendChild(tdName);

      const tdStatus = document.createElement('td');
      tdStatus.appendChild(badgeFor(demo));
      tr.appendChild(tdStatus);

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

      const tdActions = document.createElement('td');
      const row = document.createElement('div');
      row.className = 'btn-row';

      const btnStart   = button('Start',   'primary', demo.running);
      const btnStop    = button('Stop',    'danger', !demo.running);
      const btnRestart = button('Restart', '', !demo.exists);

      btnStart.addEventListener('click', () => doStartDemo(demo.id, tdStatus, btnStart, btnStop));
      btnStop.addEventListener('click', () => doStopDemo(demo.id, tdStatus, btnStart, btnStop));
      btnRestart.addEventListener('click', () => doRestartDemo(demo.id, tdStatus, btnStart, btnStop));

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

// --- Start / Stop / Restart with 401 consent retry -----------------------

async function doStartDemo(id, statusCell, btnStart, btnStop) {
  const tryOnce = async () => {
    const consent = await ensureConsent(id);
    await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
      method: 'POST',
      headers: {
        'X-Consent-Token': consent.token,
      },
    });
  };

  try {
    btnStart.disabled = true;
    btnStop.disabled = true;

    try {
      await tryOnce();
    } catch (err) {
      if (err && err.status === 401) {
        console.warn('[debug] start demo got 401, refreshing consent token for', id);
        invalidateConsent(id);
        await tryOnce(); // retry once with fresh /consent
      } else {
        throw err;
      }
    }

    await sleep(500);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] start demo failed', id, err);
    orchStatusEl && (orchStatusEl.textContent = `Start ${id} failed: ${err.message || err}`);
    alert(`Start ${id} failed: ${err.message || err}`);
  } finally {
    btnStart.disabled = false;
    btnStop.disabled = false;
  }
}

async function doStopDemo(id, statusCell, btnStart, btnStop) {
  const tryOnce = async () => {
    const consent = await ensureConsent(id);
    await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      headers: {
        'X-Consent-Token': consent.token,
      },
    });
  };

  try {
    btnStart.disabled = true;
    btnStop.disabled = true;

    try {
      await tryOnce();
    } catch (err) {
      if (err && err.status === 401) {
        console.warn('[debug] stop demo got 401, refreshing consent token for', id);
        invalidateConsent(id);
        await tryOnce();
      } else {
        throw err;
      }
    }

    await sleep(300);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] stop demo failed', id, err);
    orchStatusEl && (orchStatusEl.textContent = `Stop ${id} failed: ${err.message || err}`);
    alert(`Stop ${id} failed: ${err.message || err}`);
  } finally {
    btnStart.disabled = false;
    btnStop.disabled = false;
  }
}

async function doRestartDemo(id, statusCell, btnStart, btnStop) {
  const tryOnce = async () => {
    const consent = await ensureConsent(id);

    // best-effort stop (ignore non-401 errors)
    try {
      await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
        method: 'POST',
        headers: { 'X-Consent-Token': consent.token },
      });
      await sleep(500);
    } catch (e) {
      if (e && e.status === 401) {
        // if stop says token expired, let outer logic handle it
        throw e;
      }
      console.warn('[debug] restart: stop failed (ignored)', id, e);
    }

    await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
      method: 'POST',
      headers: { 'X-Consent-Token': consent.token },
    });
  };

  try {
    btnStart.disabled = true;
    btnStop.disabled = true;

    try {
      await tryOnce();
    } catch (err) {
      if (err && err.status === 401) {
        console.warn('[debug] restart demo got 401, refreshing consent token for', id);
        invalidateConsent(id);
        await tryOnce();
      } else {
        throw err;
      }
    }

    await sleep(500);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] restart demo failed', id, err);
    orchStatusEl && (orchStatusEl.textContent = `Restart ${id} failed: ${err.message || err}`);
    alert(`Restart ${id} failed: ${err.message || err}`);
  } finally {
    btnStart.disabled = false;
    btnStop.disabled = false;
  }
}

// global buttons
btnRefresh?.addEventListener('click', () => loadDemosIntoTable());

btnStopAll?.addEventListener('click', async () => {
  if (!confirm('Stop ALL demos (yolo, pose, chang, price)?')) return;
  const ids = ['yolo', 'pose', 'chang', 'price'];

  for (const id of ids) {
    try {
      // for stop-all we don’t bother with 401 retry; this is “best effort”
      const consent = await ensureConsent(id);
      await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
        method: 'POST',
        headers: { 'X-Consent-Token': consent.token },
      });
    } catch (e) {
      console.warn('[debug] stop-all: failed for', id, e);
      invalidateConsent(id);
    }
  }
  await loadDemosIntoTable();
});

btnRestartGpu?.addEventListener('click', async () => {
  if (!confirm('Restart GPU demos (yolo + pose)?')) return;
  const ids = ['yolo', 'pose'];

  for (const id of ids) {
    try {
      const consent = await ensureConsent(id);
      try {
        await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
          method: 'POST',
          headers: { 'X-Consent-Token': consent.token },
        });
      } catch (e) {
        if (e && e.status === 401) {
          console.warn('[debug] gpu restart: stop 401 for', id);
          invalidateConsent(id);
          // try with a fresh token:
          const fresh = await ensureConsent(id);
          await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
            method: 'POST',
            headers: { 'X-Consent-Token': fresh.token },
          });
        } else {
          console.warn('[debug] gpu restart: stop failed (ignored)', id, e);
        }
      }
      await sleep(300);
      const fresh2 = await ensureConsent(id);
      await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
        method: 'POST',
        headers: { 'X-Consent-Token': fresh2.token },
      });
    } catch (e) {
      console.warn('[debug] gpu restart: failed for', id, e);
      invalidateConsent(id);
    }
  }
  await loadDemosIntoTable();
});

// --- WHEP PROBE ----------------------------------------------------------

const probeRoot      = el('debug-probe');
const probeKind      = /** @type {HTMLSelectElement|null} */ (el('probe-kind'));
const probeUrlInput  = /** @type {HTMLInputElement|null} */ (el('probe-url'));
const probeConnect   = el('probe-connect');
const probeDisconnect= el('probe-disconnect');
const probeState     = el('probe-state');
const probeFps       = el('probe-fps');
const probeVideo     = /** @type {HTMLVideoElement|null} */ (el('probe-video'));
const probeLabel     = el('probe-overlay-label');
const probeError     = el('probe-error');

const WHEP_BASE_PORT = 8889;

function buildWhepUrl(kind) {
  const base = `${location.protocol}//${location.hostname}:${WHEP_BASE_PORT}`;
  if (kind === 'annot') return `${base}/annot/whep`;
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

// simple FPS meter like viewer.js
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
  const url = probeUrlInput.value.trim() || buildWhepUrl(kind);
  probeUrlInput.value = url;

  probeConnecting = true;
  setProbeError('');
  probeState.textContent = 'connecting…';
  probeLabel && (probeLabel.textContent = kind === 'cam' ? 'cam' : 'annot');
  probeConnect && (probeConnect.disabled = true);
  probeDisconnect && (probeDisconnect.disabled = false);

  // clean any previous stream
  try {
    if (probeVideo.srcObject) {
      const ms = probeVideo.srcObject;
      ms.getTracks?.().forEach((t) => t.stop());
      probeVideo.srcObject = null;
      probeVideo.load();
    }
  } catch {}

  try {
    await connectWhep(url, probeVideo);
    probeState.textContent = 'playing';
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

// --- boot -----------------------------------------------------------------

if (orchRoot) {
  loadDemosIntoTable();
}
if (probeKind && probeUrlInput) {
  probeUrlInput.value = buildWhepUrl(probeKind.value || 'cam');
}
