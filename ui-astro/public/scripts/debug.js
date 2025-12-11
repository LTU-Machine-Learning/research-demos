// public/scripts/debug.js

import { connectWhep } from '/scripts/whep.js';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const absolutizeHttp = (endpoint) => {
  if (!endpoint) return '';
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith('//')) return `${location.protocol}${endpoint}`;
  if (endpoint.startsWith('/'))  return `${location.protocol}//${location.hostname}${endpoint}`;
  if (endpoint.startsWith(':'))  return `${location.protocol}//${location.hostname}${endpoint}`;
  return `${location.protocol}//${location.host}/${endpoint.replace(/^\/+/, '')}`;
};

function el(id) {
  return /** @type {HTMLElement|null} */ (document.getElementById(id));
}

// ---------------------------------------------------------------------------
// Orchestrator wiring
// ---------------------------------------------------------------------------

const orchRoot      = el('debug-orch');
const orchStatusEl  = el('orch-status');
const tableBody     = el('demo-table-body');
const btnRefresh    = el('btn-refresh-demos');
const btnStopAll    = el('btn-stop-all');
const btnRestartGpu = el('btn-restart-yolo-pose');

const ORCH_BASE  = orchRoot ? absolutizeHttp(orchRoot.dataset.orch || ':8090') : '';
const ORCH_TOKEN = orchRoot?.dataset.token || 'dev-token';

const CONSENT_KEY = (id) => `vh_consent_${id}`;

// ---------------------------------------------------------------------------
// Local consent helpers — aligned with ConsentModal / consent-widget
// ---------------------------------------------------------------------------

function readLocalConsent(id) {
  try {
    const raw = localStorage.getItem(CONSENT_KEY(id));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    // Accept old {grantedAt, expiresAt} or new {token, expiresAt, ...}
    if (!obj || typeof obj.expiresAt !== 'number') return null;
    return obj;
  } catch {
    return null;
  }
}

function isLocalConsentValid(rec) {
  if (!rec) return false;
  if (typeof rec.expiresAt !== 'number') return false;
  return Date.now() < rec.expiresAt;
}

/**
 * Get the consent token for demoId, or throw a descriptive Error.
 * This is the *only* place we decide whether consent exists.
 */
function requireConsentToken(demoId) {
  const rec = readLocalConsent(demoId);
  if (!rec) {
    throw new Error(
      `No consent stored locally for demo "${demoId}".\n` +
      `Open the ${demoId} demo page, accept consent, then retry.`
    );
  }
  if (!rec.token) {
    throw new Error(
      `Consent record for "${demoId}" has no token field.\n` +
      `You may be using an older consent format. Re-accept consent on the ${demoId} demo page.`
    );
  }
  if (!isLocalConsentValid(rec)) {
    throw new Error(
      `Local consent for "${demoId}" has expired.\n` +
      `Open the ${demoId} demo page, re-accept consent, or refresh the token on /privacy.`
    );
  }
  return rec.token;
}

// ---------------------------------------------------------------------------
// fetchJson with dev-token
// ---------------------------------------------------------------------------

async function fetchJson(path, opts = {}) {
  if (!ORCH_BASE) throw new Error('No orchestrator base URL configured');

  const u = new URL(path, ORCH_BASE);
  // Keep token in both query & header (as before)
  u.searchParams.set('token', ORCH_TOKEN);

  const res = await fetch(u.toString(), {
    ...opts,
    headers: {
      'x-token': ORCH_TOKEN,
      ...(opts.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} – ${text || 'request failed'}`);
    // @ts-ignore
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function button(label, css, disabled = false) {
  const b = document.createElement('button');
  b.textContent = label;
  b.className   = `btn small ${css || ''}`;
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

// ---------------------------------------------------------------------------
// Load demos table
// ---------------------------------------------------------------------------

async function loadDemosIntoTable() {
  if (!orchRoot || !tableBody || !orchStatusEl) return;
  orchStatusEl.textContent = 'Loading demos…';

  try {
    const demos = await fetchJson('/demos');
    tableBody.innerHTML = '';

    const order  = ['yolo', 'pose', 'chang', 'price'];
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
        a.href        = demo.url;
        a.target      = '_blank';
        a.rel         = 'noopener noreferrer';
        a.textContent = 'open';
        a.style.fontSize = '.8rem';
        tdUrl.appendChild(a);
      } else {
        tdUrl.textContent = '—';
      }
      tr.appendChild(tdUrl);

      const tdActions = document.createElement('td');
      const row       = document.createElement('div');
      row.className   = 'btn-row';

      const btnStart   = button('Start',   'primary', demo.running);
      const btnStop    = button('Stop',    'danger',  !demo.running);
      const btnRestart = button('Restart', '',        !demo.exists);

      btnStart.addEventListener('click', () => doStartDemo(demo.id, tdStatus, btnStart, btnStop));
      btnStop.addEventListener('click',  () => doStopDemo(demo.id, tdStatus, btnStart, btnStop));
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

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function doStartDemo(id, statusCell, btnStart, btnStop) {
  try {
    btnStart.disabled = true;
    btnStop.disabled  = true;

    const token = requireConsentToken(id);

    await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
      method: 'POST',
      headers: { 'X-Consent-Token': token },
    });

    await sleep(500);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] start demo failed', id, err);
    // @ts-ignore
    if (err.status === 401) {
      const msg =
        `Start ${id} failed: backend rejected the consent token.\n\n` +
        `Check the token on /privacy, or open the ${id} demo page and re-accept consent.`;
      orchStatusEl && (orchStatusEl.textContent = msg);
      alert(msg);
    } else {
      // local errors (no token / expired / bad format)
      alert(String(err.message || err));
    }
  } finally {
    btnStart.disabled = false;
    btnStop.disabled  = false;
  }
}

async function doStopDemo(id, statusCell, btnStart, btnStop) {
  try {
    btnStart.disabled = true;
    btnStop.disabled  = true;

    const token = requireConsentToken(id);

    await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
      headers: { 'X-Consent-Token': token },
    });

    await sleep(300);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] stop demo failed', id, err);
    // @ts-ignore
    if (err.status === 401) {
      const msg =
        `Stop ${id} failed: backend says "invalid or expired consent token".\n\n` +
        `This means the token in localStorage is not accepted anymore.\n` +
        `→ Inspect the token on /privacy, and/or re-accept consent on the ${id} page.`;
      orchStatusEl && (orchStatusEl.textContent = msg);
      alert(msg);
    } else {
      alert(String(err.message || err));
    }
  } finally {
    btnStart.disabled = false;
    btnStop.disabled  = false;
  }
}

async function doRestartDemo(id, statusCell, btnStart, btnStop) {
  try {
    btnStart.disabled = true;
    btnStop.disabled  = true;

    const token = requireConsentToken(id);

    // best-effort stop
    try {
      await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
        method: 'POST',
        headers: { 'X-Consent-Token': token },
      });
      await sleep(400);
    } catch (e) {
      console.warn('[debug] restart: stop failed (ignored for restart)', id, e);
    }

    await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
      method: 'POST',
      headers: { 'X-Consent-Token': token },
    });

    await sleep(500);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] restart demo failed', id, err);
    // @ts-ignore
    if (err.status === 401) {
      const msg =
        `Restart ${id} failed: backend rejected the consent token.\n\n` +
        `Refresh consent on the ${id} demo (and check /privacy) then retry.`;
      orchStatusEl && (orchStatusEl.textContent = msg);
      alert(msg);
    } else {
      alert(String(err.message || err));
    }
  } finally {
    btnStart.disabled = false;
    btnStop.disabled  = false;
  }
}

// ---------------------------------------------------------------------------
// Global buttons (stop-all / restart-gpu)
// ---------------------------------------------------------------------------

btnRefresh?.addEventListener('click', () => loadDemosIntoTable());

btnStopAll?.addEventListener('click', async () => {
  if (!confirm('Stop ALL demos (yolo, pose, chang, price)?')) return;
  const ids = ['yolo', 'pose', 'chang', 'price'];

  for (const id of ids) {
    try {
      const token = requireConsentToken(id);
      await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
        method: 'POST',
        headers: { 'X-Consent-Token': token },
      });
    } catch (e) {
      console.warn('[debug] stop-all: failed for', id, e);
    }
  }

  await loadDemosIntoTable();
});

btnRestartGpu?.addEventListener('click', async () => {
  if (!confirm('Restart GPU demos (yolo + pose)?')) return;
  const ids = ['yolo', 'pose'];

  for (const id of ids) {
    try {
      const token = requireConsentToken(id);

      try {
        await fetchJson(`/demos/${encodeURIComponent(id)}/stop`, {
          method: 'POST',
          headers: { 'X-Consent-Token': token },
        });
      } catch (e) {
        console.warn('[debug] gpu restart: stop failed (ignored)', id, e);
      }
      await sleep(300);

      await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
        method: 'POST',
        headers: { 'X-Consent-Token': token },
      });
    } catch (e) {
      console.warn('[debug] gpu restart: failed for', id, e);
    }
  }

  await loadDemosIntoTable();
});

// ---------------------------------------------------------------------------
// WHEP PROBE (cam + chang_annot)
// ---------------------------------------------------------------------------

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

function buildWhepUrl(kind) {
  const base = `${location.protocol}//${location.hostname}:${WHEP_BASE_PORT}`;
  if (kind === 'annot') return `${base}/chang_annot/whep`; // 👈 actual annot name
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

(function mountProbeFps(v, out) {
  if (!v || !out) return;
  let last = performance.now();
  let n    = 0;
  const tick = () => {
    n++;
    const now = performance.now();
    if (now - last >= 1000) {
      out.textContent = `${n}`;
      n   = 0;
      last = now;
    }
    (v.requestVideoFrameCallback
      ? v.requestVideoFrameCallback(tick)
      : setTimeout(tick, 33));
  };
  tick();
})(probeVideo, probeFps);

let probeConnecting = false;

async function connectProbe() {
  if (!probeVideo || !probeKind || !probeUrlInput || !probeState) return;
  if (probeConnecting) return;

  const kind = probeKind.value || 'cam';
  const url  = probeUrlInput.value.trim() || buildWhepUrl(kind);
  probeUrlInput.value = url;

  probeConnecting = true;
  setProbeError('');
  probeState.textContent = 'connecting…';
  probeLabel && (probeLabel.textContent = kind === 'cam' ? 'cam' : 'chang_annot');
  probeConnect    && (probeConnect.disabled = true);
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

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

if (orchRoot) {
  loadDemosIntoTable();
}
if (probeKind && probeUrlInput) {
  probeUrlInput.value = buildWhepUrl(probeKind.value || 'cam');
}
