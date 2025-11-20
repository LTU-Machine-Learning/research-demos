// public/scripts/config.js
(function(){
  const KEY = 'vh.debug.config.v1';

  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const defaults = {
    autostart: true,
    basePort: 8889,
    camPath: '/cam/whep',
    annotPath: '/annot/whep',
    wsUrl: `${wsProto}://${location.hostname}:6000/ws/dets`,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...defaults };
      const cfg = JSON.parse(raw);
      return { ...defaults, ...cfg };
    } catch { return { ...defaults }; }
  }

  let config = load();
  const listeners = new Set();

  function save() {
    localStorage.setItem(KEY, JSON.stringify(config));
    // prévenir les abonnés
    listeners.forEach(fn => { try { fn(config); } catch {} });
    // événement global
    try { window.dispatchEvent(new CustomEvent('vh-config-changed', { detail: config })); } catch {}
  }

  window.getConfig = () => ({ ...config });
  window.setConfig = (partial) => { config = { ...config, ...partial }; save(); };
  window.resetConfig = () => { config = { ...defaults }; save(); };
  window.onConfigChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // premier broadcast au chargement
  save();
})();
