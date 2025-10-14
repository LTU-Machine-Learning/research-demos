// public/scripts/consent-widget.js
(() => {
  const TPL = document.createElement('template');
  TPL.innerHTML = `
    <style>
      :host{display:block}
      .wrap{max-width:800px;margin:24px auto;padding:0 8px;font:16px/1.5 system-ui, sans-serif;color:#e8eefc}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:12px}
      .card{background:#161b27f2;border:1px solid #1f2a44;border-radius:12px;padding:14px;box-shadow:0 6px 24px #0006}
      .card h4{margin:0 0 6px 0;font-size:1.05rem}
      .meta{color:#b0bedc;font-size:.95rem;margin:8px 0}
      .ok{color:#27d07d;font-weight:700}
      .exp{color:#ff9b5a;font-weight:700}
      .dead{color:#f66;font-weight:700}
      .actions{display:flex;gap:8px;margin-top:10px}
      .btn{padding:8px 12px;border-radius:9px;border:1px solid #244;cursor:pointer;background:#122035;color:#cfe7ff}
      .btn.alt{background:#2a0f10;border-color:#552}
      .muted{opacity:.8;font-size:.85rem;margin-top:6px}
    </style>
    <div class="wrap">
      <div class="intro"></div>
      <div class="grid"></div>
    </div>
  `;

  const CONSENT_KEY = (id) => `vh_consent_${id}`;
  const fmtLeft = (ms) => {
    if (ms <= 0) return "expired";
    const s = Math.floor(ms/1000);
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = s%60;
    return h>0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  };

  const absolutizeHttp = (endpoint) => {
    if (!endpoint) return "";
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    if (endpoint.startsWith("//")) return `${location.protocol}${endpoint}`;
    if (endpoint.startsWith("/"))  return `${location.protocol}//${location.hostname}${endpoint}`;
    if (endpoint.startsWith(":"))  return `${location.protocol}//${location.hostname}${endpoint}`;
    return `${location.protocol}//${location.hostname}/${endpoint.replace(/^\/+/, "")}`;
  };

  function loadConsent(id){
    try{
      const raw = localStorage.getItem(CONSENT_KEY(id));
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj?.token || !obj?.expiresAt) return null;
      return obj;
    }catch{ return null; }
  }
  function clearConsent(id){
    try{ localStorage.removeItem(CONSENT_KEY(id)); }catch{}
  }

  class ConsentStatus extends HTMLElement {
    static get observedAttributes(){ return ['demos','orch','token','intro','stop']; }

    constructor(){
      super();
      this.attachShadow({mode:'open'}).appendChild(TPL.content.cloneNode(true));
      this.$grid  = this.shadowRoot.querySelector('.grid');
      this.$intro = this.shadowRoot.querySelector('.intro');

      // state
      this.demos = [];
      this.orch  = '';
      this.token = '';
      this.callStop = false; // whether to call orchestrator /stop on withdraw
      this._tickId = null;
    }

    connectedCallback(){
      this._readAttributes();
      this.render();
      this._startTicker();
    }
    disconnectedCallback(){
      this._stopTicker();
    }
    attributeChangedCallback(){
      this._readAttributes();
      this.render();
    }

    _readAttributes(){
      const demosAttr = (this.getAttribute('demos') || '').trim();
      this.demos = demosAttr
        ? demosAttr.split(',').map(s=>s.trim()).filter(Boolean)
        : [];
      this.orch  = this.getAttribute('orch')  || '';
      this.token = this.getAttribute('token') || '';
      this.callStop = (this.getAttribute('stop') || 'true').toLowerCase() !== 'false';
      const intro = this.getAttribute('intro') ||
        'Below you can see the current consent status per demo on this station. Consent tokens are short-lived and local. You may withdraw at any time.';
      this.$intro.textContent = intro;
    }

    _startTicker(){
      if(this._tickId) return;
      this._tickId = setInterval(()=> this._tick(), 1000);
    }
    _stopTicker(){
      if(this._tickId){ clearInterval(this._tickId); this._tickId = null; }
    }
    _tick(){
      this.demos.forEach(id => {
        const card = this.$grid.querySelector(`.card[data-demo="${id}"]`);
        if(!card) return;
        const data = loadConsent(id);
        const now = Date.now();
        if(data && now >= data.expiresAt){
          clearConsent(id);
        }
        this._updateCard(card, id);
      });
    }

    render(){
      if(!this.demos.length){
        this.$grid.innerHTML = '<div class="muted">No demos configured.</div>';
        return;
      }
      this.$grid.innerHTML = this.demos.map(id => this._cardHtml(id)).join('');
      this._attachEvents();
    }

    _cardHtml(id){
      const data = loadConsent(id);
      const now = Date.now();
      const valid = !!data && now < data.expiresAt;
      const msLeft = data ? (data.expiresAt - now) : 0;

      const cls = !data ? 'dead' : (valid ? 'ok' : 'exp');
      const txt = !data ? 'No active consent' : (valid ? 'Consent active' : 'Consent expired');
      const until = data?.expiresAt ? new Date(data.expiresAt).toLocaleString() : '—';

      return `
        <div class="card" data-demo="${id}">
          <h4>Demo: ${id}</h4>
          <div class="meta">
            Status: <span class="${cls}" data-role="status">${txt}</span><br/>
            Expires at: <span data-role="until">${until}</span><br/>
            Remaining: <span data-role="left">${fmtLeft(msLeft)}</span>
          </div>
          <div class="actions">
            <button class="btn" data-action="refresh" data-demo="${id}">Refresh</button>
            <button class="btn alt" data-action="withdraw" data-demo="${id}" ${!data ? 'disabled' : ''}>Withdraw consent</button>
          </div>
          <div class="muted">Local to this demo station. Not stored or transmitted externally.</div>
        </div>
      `;
    }

    _updateCard(card, id){
      const data = loadConsent(id);
      const now = Date.now();
      const valid = !!data && now < data.expiresAt;
      const msLeft = data ? (data.expiresAt - now) : 0;

      const statusEl = card.querySelector('[data-role="status"]');
      statusEl.textContent = !data ? 'No active consent' : (valid ? 'Consent active' : 'Consent expired');
      statusEl.className = ( !data ? 'dead' : (valid ? 'ok' : 'exp') );

      const untilEl = card.querySelector('[data-role="until"]');
      untilEl.textContent = data?.expiresAt ? new Date(data.expiresAt).toLocaleString() : '—';

      const leftEl = card.querySelector('[data-role="left"]');
      leftEl.textContent = fmtLeft(msLeft);

      const withdrawBtn = card.querySelector('[data-action="withdraw"]');
      if (withdrawBtn) withdrawBtn.disabled = !data;
    }

    _attachEvents(){
      this.$grid.querySelectorAll('[data-action="refresh"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-demo');
          const card = this.$grid.querySelector(`.card[data-demo="${id}"]`);
          if (card) this._updateCard(card, id);
        });
      });

      this.$grid.querySelectorAll('[data-action="withdraw"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-demo');
          const data = loadConsent(id);
          clearConsent(id);

          // optional: notify orchestrator to stop
          if (this.callStop && this.orch && this.token) {
            try {
              await fetch(`${absolutizeHttp(this.orch)}/demos/${id}/stop`, {
                method: 'POST',
                headers: {
                  'x-token': this.token,
                  ...(data?.token ? { 'X-Consent-Token': data.token } : {})
                },
                keepalive: true
              });
            } catch {}
          }

          const card = this.$grid.querySelector(`.card[data-demo="${id}"]`);
          if (card) this._updateCard(card, id);
        });
      });
    }
  }

  customElements.define('consent-status', ConsentStatus);
})();
