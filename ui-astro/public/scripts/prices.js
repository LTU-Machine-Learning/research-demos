// public/scripts/prices.js

const form    = document.getElementById('price-form');
const box     = document.getElementById('price-result');
const pEl     = document.getElementById('p-price');
const loEl    = document.getElementById('p-low');
const hiEl    = document.getElementById('p-high');
const errBox  = document.getElementById('p-error');
const loading = document.getElementById('p-loading');

if (!form) {
  console.warn('[prices] form not found');
}

const api   = form?.dataset?.api   || '';
const orch  = form?.dataset?.orch  || 'http://192.168.10.2:8090';
const token = form?.dataset?.token || 'dev-token';
const demo  = form?.dataset?.demoid || 'price';

const STORAGE_KEY = 'vh_price_form';
const NUMERIC_FIELDS = [
  'living_area','rooms','plot_area','lat','lon',
  'month','year','construction_year','floor','rent','list_price'
];

const fmt = n => new Intl.NumberFormat('sv-SE', { style:'currency', currency:'SEK', maximumFractionDigits:0 }).format(n);

function showError(msg) {
  errBox.textContent = msg;
  errBox.hidden = !msg;
}
function clearError() { showError(''); }
function markInvalid(names) {
  for (const el of document.querySelectorAll('#price-form .invalid')) el.classList.remove('invalid');
  names.forEach(n => {
    const el = form?.elements?.namedItem(n);
    if (el) el.classList.add('invalid');
  });
}

function collectBody() {
  const fd = new FormData(form);
  const body = {};
  for (const [k, v] of fd.entries()) {
    if (v === '' || v == null) continue;
    body[k] = NUMERIC_FIELDS.includes(k) ? Number(v) : v;
  }
  return body;
}
function validate(body) {
  const missing = [];
  if (body.living_area == null || isNaN(body.living_area)) missing.push('living_area');
  if (body.rooms == null || isNaN(body.rooms))             missing.push('rooms');
  return missing;
}

// restore saved state
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  if (saved && typeof saved === 'object' && form) {
    for (const [k,v] of Object.entries(saved)) {
      const el = form.elements.namedItem(k);
      if (el && v !== undefined && v !== null && v !== '') el.value = v;
    }
  }
} catch {}

// persist on input
form?.addEventListener('input', () => {
  const fd = new FormData(form);
  const obj = {};
  for (const [k,v] of fd.entries()) obj[k] = v;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
});

// submit
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  box.hidden = true;
  loading.style.display = 'inline';

  const body = collectBody();
  const missing = validate(body);
  if (missing.length) {
    loading.style.display = 'none';
    markInvalid(missing);
    showError(`Please fill the required field(s): ${missing.join(', ')}.`);
    return;
  }
  markInvalid([]);

  try {
    const r = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      let detail = '';
      try { detail = (await r.json()).detail; } catch { detail = await r.text(); }
      showError(detail || `Request failed (HTTP ${r.status}).`);
      return;
    }
    const data = await r.json();
    pEl.textContent  = fmt(data.price_sek);
    loEl.textContent = fmt(data.pi_low);
    hiEl.textContent = fmt(data.pi_high);
    box.hidden = false;
  } catch (err) {
    showError(err?.message || 'Network error.');
  } finally {
    loading.style.display = 'none';
  }
});

// --- Heartbeat (keep demo “active” like yolo/pose) ---
function beat() {
  // on force un endpoint direct vers l'orchestrateur,
  // on n'utilise PLUS orch pour le heartbeat
  const base = 'http://192.168.10.2:8090';   // <-- IP/port de ton orch
  fetch(`${base}/demos/${demo}/heartbeat?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'x-token': token }
  }).catch(() => {});
}
beat();
setInterval(beat, 25000);


// --- Debug UI for price demo ---
const dbgToggle   = document.getElementById('price-debug-toggle');
const dbgPanel    = document.getElementById('price-debug-panel');
const dbgRestart  = document.getElementById('price-restart');
const dbgHealth   = document.getElementById('price-health');
const dbgStatus   = document.getElementById('price-debug-status');

// Same orchestrator base as heartbeat
const ORCH_BASE = 'http://192.168.10.2:8090';

// Helper for status line
function setDbgStatus(msg) {
  if (dbgStatus) dbgStatus.textContent = msg || '';
}

// Ensure demo container is running (uses /demos/{id}/start; idempotent)
dbgRestart?.addEventListener('click', async () => {
  setDbgStatus('Ensuring demo is running…');
  try {
    const url = `${ORCH_BASE}/demos/${demo}/start?wait=1&timeout=90&token=${encodeURIComponent(token)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'x-token': token }
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      setDbgStatus(`Restart failed (HTTP ${r.status}) ${txt}`);
      return;
    }
    setDbgStatus('Demo is running (start succeeded).');
  } catch (e) {
    setDbgStatus(`Restart error: ${e?.message || e}`);
  }
});

// Call public /healthz of the price API (derived from data-api /predict)
dbgHealth?.addEventListener('click', async () => {
  setDbgStatus('Checking /healthz…');
  try {
    let healthUrl = api;
    try {
      const u = new URL(api, window.location.href);
      u.pathname = u.pathname.replace(/\/predict$/, '/healthz');
      healthUrl = u.toString();
    } catch {
      // fallback: naive replace if URL constructor fails
      healthUrl = api.replace(/\/predict$/, '/healthz');
    }

    const r = await fetch(healthUrl, { method: 'GET' });
    const text = await r.text().catch(() => '');
    if (r.ok) {
      setDbgStatus(`/healthz OK (HTTP ${r.status}) ${text || ''}`);
    } else {
      setDbgStatus(`/healthz FAILED (HTTP ${r.status}) ${text || ''}`);
    }
  } catch (e) {
    setDbgStatus(`Health check error: ${e?.message || e}`);
  }
});
