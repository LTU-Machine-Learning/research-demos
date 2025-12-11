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

const orchRoot     = el('debug-orch');
const orchStatusEl = el('orch-status');
const tableBody    = el('demo-table-body');
const btnRefresh   = el('btn-refresh-demos');
const btnStopAll   = el('btn-stop-all');
const btnRestartGpu = el('btn-restart-yolo-pose');

const ORCH_BASE  = orchRoot ? absolutizeHttp(orchRoot.dataset.orch || ':8090') : '';
const ORCH_TOKEN = orchRoot?.dataset.token || 'dev-token';

// Same key format as ConsentModal / consent-widget
const CONSENT_KEY = (id) => `vh_consent_${id}`;

// --- local consent helpers (shared with /privacy) -------------------------

function readLocalConsent(id) {
  try {
    const raw = localStorage.getItem(CONSENT_KEY(id));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    // accept both {grantedAt, expiresAt} and {token, expiresAt, ...}
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

// --- fetch wrapper with dev-token ----------------------------------------

async function fetchJson(path, opts = {}) {
  if (!ORCH_BASE) throw new Error('No orchestrator base URL configured');

  const u = new URL(path, ORCH_BASE);
  // keep token in both query & header
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
// Ensuring consent (for START only)
// ---------------------------------------------------------------------------

/**
 * For starting a demo we want a valid consent token.
 * Strategy:
 *   1) Look in localStorage (used by /privacy + ConsentModal).
 *   2) If there is a token & it's not expired, use it.
 *   3) If not, call backend /consent to mint one and store it locally.
 *
 * This keeps /privacy and debug in sync.
 */
async function ensureConsentForStart(demoId) {
  const current = readLocalConsent(demoId);
  if (current && isLocalConsentValid(current) && current.token) {
    return current; // { token, expiresAt, ... }
  }

  // Ask backend to mint a new consent token for this demo
  const u = new URL('/consent', ORCH_BASE);
  u.searchParams.set('demo', demoId);

  const res = await fetch(u.toString(), { method: 'POST' });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`consent error: HTTP ${res.status} – ${txt || 'failed'}`);
  }
  const data = await res.json(); // expected { token, expiresAt }

  // persist so /privacy + widget can see it
  try {
    const rec = {
      token: data.token,
      expiresAt: data.expiresAt,
      grantedAt: Date.now(),
    };
    localStorage.setItem(CONSENT_KEY(demoId), JSON.stringify(rec));
    return rec;
  } catch {
    return data;
  }
}

/**
 * For stopping a demo we *do not* strictly require consent.
 * We try with consent (if present) first, and if the backend
 * rejects it with 401, we retry once *without* X-Consent-Token
 * as an operator override using only dev-token.
 */
async function stopDemoWithOptionalConsent(demoId) {
  const local = readLocalConsent(demoId);
  const hasToken = !!(local && local.token);

  const path = `/demos/${encodeURIComponent(demoId)}/stop`;

  // 1) Try with consent token if we have one
  if (hasToken) {
    try {
      await fetchJson(path, {
        method: 'POST',
        headers: { 'X-Consent-Token': local.token },
      });
      return { usedConsent: true, fallback: false };
    } catch (err) {
      // @ts-ignore
      if (err.status === 401) {
        console.warn(
          `[debug] stop ${demoId} with consent token was rejected (401), ` +
          `retrying once without consent token (operator override)…`
        );
        // fall through to no-consent path
      } else {
        throw err;
      }
    }
  }

  // 2) Retry without consent token (admin override)
  await fetchJson(path, { method: 'POST' });
  return { usedConsent: hasToken, fallback: true };
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Table load
// ---------------------------------------------------------------------------

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
      btnStop.addEventListener('click',  () => doStopDemo(demo.id, tdStatus, btnStart, btnStop));
      btnRestart.addEventListener('click',() => doRestartDemo(demo.id, tdStatus, btnStart, btnStop));

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

    const consent = await ensureConsentForStart(id);

    await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
      method: 'POST',
      headers: consent?.token ? { 'X-Consent-Token': consent.token } : {},
    });

    await sleep(500);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] start demo failed', id, err);
    // @ts-ignore
    if (err.status === 401) {
      const msg =
        `Start ${id} failed: consent token rejected by orchestrator.\n\n` +
        `Either the token actually expired, or the backend disagrees with the local state.\n` +
        `Check /privacy for the token status and/or re-accept consent on the ${id} demo page.`;
      orchStatusEl && (orchStatusEl.textContent = msg);
      alert(msg);
    } else {
      alert(`Start ${id} failed: ${err.message || err}`);
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

    const result = await stopDemoWithOptionalConsent(id);
    console.log(
      `[debug] stop ${id} done (usedConsent=${result.usedConsent}, fallback=${result.fallback})`
    );

    await sleep(300);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] stop demo failed', id, err);
    // @ts-ignore
    if (err.status === 401) {
      const msg =
        `Stop ${id} failed: backend refused both consent and operator-only stop.\n\n` +
        `This means the orchestrator currently *requires* a valid consent token even to stop.\n` +
        `You may want to relax this rule server-side so operators can always stop demos.`;
      orchStatusEl && (orchStatusEl.textContent = msg);
      alert(msg);
    } else {
      alert(`Stop ${id} failed: ${err.message || err}`);
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

    // 1) Best-effort stop (with optional consent, then operator override)
    try {
      await stopDemoWithOptionalConsent(id);
      await sleep(500);
    } catch (e) {
      console.warn('[debug] restart: stop failed (ignored for restart)', id, e);
    }

    // 2) Start again (requires consent)
    const consent = await ensureConsentForStart(id);
    await fetchJson(`/demos/${encodeURIComponent(id)}/start?wait=1&timeout=90`, {
      method: 'POST',
      headers: consent?.token ? { 'X-Consent-Token': consent.token } : {},
    });

    await sleep(500);
    await loadDemosIntoTable();
  } catch (err) {
    console.error('[debug] restart demo failed', id, err);
    // @ts-ignore
    if (err.status === 401) {
      const msg =
        `Restart ${id} failed: consent token rejected.\n\n` +
        `Use /privacy + the normal demo UI to refresh consent, then retry.`;
      orchStatusEl && (orchStatusEl.textContent = msg);
      alert(msg);
    } else {
      alert(`Restart ${id} failed: ${err.message || err}`);
    }
  } finally {
    btnStart.disabled = false;
    btnStop.disabled  = false;
  }
}

// ---------------------------------------------------------------------------
// Global buttons
// ---------------------------------------------------------------------------

btnRefresh?.addEventListener('click', () => loadDemosIntoTable());

btnStopAll?.addEventListener('click', async () => {
  if (!confirm('Stop ALL demos (yolo, pose, chang, price)?')) return;
  const ids = ['yolo', 'pose', 'chang', 'price'];
  for (const id of ids) {
    try {
      await stopDemoWithOptionalConsent(id);
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
      // same restart logic as individual
      await doRestartDemo(id, null, { disabled: true }, { disabled: true });
    } catch (e) {
      console.warn('[debug] gpu restart: failed for', id, e);
    }
  }
  await loadDemosIntoTable();
});

// ---------------------------------------------------------------------------
// WHEP PROBE  (cam + chang_annot)
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
  if (kind === 'annot') return `${base}/chang_annot/whep`;  // 👈 your actual annot stream
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
  probeLabel && (probeLabel.textContent = kind === 'cam' ? 'cam' : 'chang_annot');
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

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

if (orchRoot) {
  loadDemosIntoTable();
}
if (probeKind && probeUrlInput) {
  probeUrlInput.value = buildWhepUrl(probeKind.value || 'cam');
}
