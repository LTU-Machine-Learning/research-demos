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

// === Consent handling: reuse SAME tokens as /privacy widget =============

const CONSENT_KEY = (id) => `vh_consent_${id}`;

function readLocalConsent(demoId) {
  try {
    const raw = localStorage.getItem(CONSENT_KEY(demoId));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.token || !obj?.expiresAt) return null;
    return obj;
  } catch {
    return null;
  }
}

function clearLocalConsent(demoId) {
  try {
    localStorage.removeItem(CONSENT_KEY(demoId));
  } catch {}
}

/**
 * Get a valid consent token for a demo from localStorage.
 * Throws a nice error if none is present / valid.
 */
function getConsentTokenOrThrow(demoId) {
  const rec = readLocalConsent(demoId);
  const now = Date.now();

  if (!rec || !rec.token || !rec.expiresAt || now >= rec.expiresAt) {
    // clean up if stale
    if (rec) clearLocalConsent(demoId);
    const err = new Error(
      `No active consent for demo "${demoId}". ` +
      `Open the demo UI (e.g. /demo/${demoId}) on the main screen, accept the camera consent, ` +
      `then retry this action.`
    );
    err.code = 'NO_CONSENT';
    throw err;
  }
  return rec.token;
}

// === HTTP helper =========================================================

async function fetchJson(path, opts = {}) {
  const u = new URL(path, ORCH_BASE);
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

      btnStart.addEventListener('click', () => doStartDemo(demo.id, btnStart, btnStop));
      btnStop.addEventListener('click', () => doStopDemo(demo.id, btnStart, btnStop));
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

// --- Start / Stop / Restart (with consent from localStorage) -------------

async function doStartDemo(id, btnStart, btnStop) {
  try {
    btnStart.disabled = true;
    btnStop.disabled = true;

    const consentToken = getConsentTokenOrThrow(id);

    await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
      method: 'POST',
      headers: {
        'X-Consent-Token': consentToken,
      },
    });

    await sleep(500);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] start demo failed', id, err);

    if (err.code === 'NO_CONSENT') {
      orchStatusEl && (orchStatusEl.textContent = err.message);
      alert(err.message);
    } else if (err.status === 401) {
      // backend says token invalid/expired -> wipe local and tell user to re-consent
      clearLocalConsent(id);
      const msg =
        `Start ${id} failed: consent token rejected by orchestrator.\n\n` +
        `Open the ${id} demo on the main screen, accept the camera consent again, ` +
        `then retry from this debug page.`;
      orchStatusEl && (orchStatusEl.textContent = msg);
      alert(msg);
    } else {
      orchStatusEl && (orchStatusEl.textContent = `Start ${id} failed: ${err.message || err}`);
      alert(`Start ${id} failed: ${err.message || err}`);
    }
  } finally {
    btnStart.disabled = false;
    btnStop.disabled = false;
  }
}

async function doStopDemo(id, btnStart, btnStop) {
  try {
    btnStart.disabled = true;
    btnStop.disabled = true;

    const consentToken = getConsentTokenOrThrow(id);

    await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      headers: {
        'X-Consent-Token': consentToken,
      },
    });

    await sleep(300);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] stop demo failed', id, err);

    if (err.code === 'NO_CONSENT') {
      orchStatusEl && (orchStatusEl.textContent = err.message);
      alert(err.message);
    } else if (err.status === 401) {
      clearLocalConsent(id);
      const msg =
        `Stop ${id} failed: consent token rejected by orchestrator.\n\n` +
        `The previous consent probably expired. Open the ${id} demo, re-accept consent, ` +
        `then retry from this debug page.`;
      orchStatusEl && (orchStatusEl.textContent = msg);
      alert(msg);
    } else {
      orchStatusEl && (orchStatusEl.textContent = `Stop ${id} failed: ${err.message || err}`);
      alert(`Stop ${id} failed: ${err.message || err}`);
    }
  } finally {
    btnStart.disabled = false;
    btnStop.disabled = false;
  }
}

async function doRestartDemo(id, btnStart, btnStop) {
  try {
    btnStart.disabled = true;
    btnStop.disabled = true;

    const consentToken = getConsentTokenOrThrow(id);

    // best-effort stop (ignore non-consent errors)
    try {
      await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
        method: 'POST',
        headers: { 'X-Consent-Token': consentToken },
      });
      await sleep(400);
    } catch (e) {
      if (e.status === 401) {
        clearLocalConsent(id);
        throw e;
      }
      console.warn('[debug] restart: stop failed (ignored)', id, e);
    }

    const freshToken = getConsentTokenOrThrow(id);
    await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
      method: 'POST',
      headers: { 'X-Consent-Token': freshToken },
    });

    await sleep(500);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] restart demo failed', id, err);

    if (err.code === 'NO_CONSENT') {
      orchStatusEl && (orchStatusEl.textContent = err.message);
      alert(err.message);
    } else if (err.status === 401) {
      clearLocalConsent(id);
      const msg =
        `Restart ${id} failed: consent token rejected.\n\n` +
        `Open the ${id} demo, re-accept consent, then retry.`;
      orchStatusEl && (orchStatusEl.textContent = msg);
      alert(msg);
    } else {
      orchStatusEl && (orchStatusEl.textContent = `Restart ${id} failed: ${err.message || err}`);
      alert(`Restart ${id} failed: ${err.message || err}`);
    }
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
      const consentToken = getConsentTokenOrThrow(id);
      await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
        method: 'POST',
        headers: { 'X-Consent-Token': consentToken },
      });
    } catch (e) {
      console.warn('[debug] stop-all: failed for', id, e);
      if (e.status === 401) clearLocalConsent(id);
    }
  }
  await loadDemosIntoTable();
});

btnRestartGpu?.addEventListener('click', async () => {
  if (!confirm('Restart GPU demos (yolo + pose)?')) return;
  const ids = ['yolo', 'pose'];

  for (const id of ids) {
    try {
      const consentToken = getConsentTokenOrThrow(id);

      try {
        await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
          method: 'POST',
          headers: { 'X-Consent-Token': consentToken },
        });
      } catch (e) {
        if (e.status === 401) {
          clearLocalConsent(id);
          throw e;
        }
        console.warn('[debug] gpu restart: stop failed (ignored)', id, e);
      }

      await sleep(300);
      const freshToken = getConsentTokenOrThrow(id);
      await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
        method: 'POST',
        headers: { 'X-Consent-Token': freshToken },
      });
    } catch (e) {
      console.warn('[debug] gpu restart: failed for', id, e);
      if (e.status === 401) clearLocalConsent(id);
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
  if (kind === 'annot') return `${base}/chang_annot/whep`;   // ⬅️ uses chang_annot now
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
