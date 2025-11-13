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
const orch  = form?.dataset?.orch  || '';
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
  if (!orch) return;
  fetch(`${orch}/demos/${demo}/heartbeat?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'x-token': token }
  }).catch(() => {});
}
beat();
setInterval(beat, 25000);
