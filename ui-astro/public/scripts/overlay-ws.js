// public/scripts/overlay-ws.js
// Récupère les boxes YOLO via WebSocket et les pousse à overlay.js (setOverlayBoxes).
(function () {
  const setBoxes = (window.setOverlayBoxes || (() => {}));

  // ---- URL WS actuelle (config > défaut)
  function currentWsUrl() {
    const cfg = (typeof window.getConfig === 'function') ? window.getConfig() : null;
    if (cfg && cfg.wsUrl) return cfg.wsUrl;
    const proto = (location.protocol === 'https:') ? 'wss' : 'ws';
    return `${proto}://192.168.10.1:5000/ws/dets`;
  }

  // ---- Helpers label / classe
  function formatConf(conf) {
    if (conf == null) return '';
    const c = (conf > 1 ? conf : conf * 100);
    return ` ${Math.round(Math.max(0, Math.min(100, c)))}%`;
  }
  function resolveClassName(b, msg) {
    // texte direct si dispo
    let cls = b.label ?? b.name ?? b.class ?? b.cls;
    if (typeof cls === 'string' && cls) return cls;

    // id numérique → tables possibles dans le message
    if (typeof cls === 'number') {
      const arr = Array.isArray(msg?.names) ? msg.names
                : Array.isArray(msg?.labels) ? msg.labels
                : null;
      if (arr && arr[cls]) return String(arr[cls]);

      const dict = (msg && typeof msg.classes === 'object') ? msg.classes : null;
      if (dict && (cls in dict)) return String(dict[cls]);

      // mapping global (ex: COCO via overlay-classmap.js)
      const glob = (window.overlayClassMap && typeof window.overlayClassMap === 'object') ? window.overlayClassMap : null;
      if (glob && (cls in glob)) return String(glob[cls]);

      return `id:${cls}`;
    }

    // parfois, certains modèles mettent la classe dans b.category ou b.cls_id
    if (typeof b.category === 'string') return b.category;
    if (typeof b.cls_id === 'number') return `id:${b.cls_id}`;

    return '';
  }

  // ---- Connexion WS + (re)connexion
  let sock = null;
  let reconnectTimer = null;
  let lastUrl = null;

  function connect() {
    const WS_URL = currentWsUrl();
    lastUrl = WS_URL;

    // coupe l’ancienne si existante
    try { sock?.close(); } catch {}
    sock = null;

    try {
      sock = new WebSocket(WS_URL);
    } catch (e) {
      console.warn('[overlay-ws] cannot init socket:', e?.message || e);
      scheduleReconnect();
      return;
    }

    sock.onopen = () => {
      console.log('[overlay-ws] connected', WS_URL);
      clearReconnect();
    };

    sock.onclose = (ev) => {
      console.warn('[overlay-ws] closed', ev.code, ev.reason || '');
      scheduleReconnect();
    };

    sock.onerror = (e) => {
      console.warn('[overlay-ws] error', e);
      try { sock.close(); } catch {}
    };

    sock.onmessage = (e) => {
        try {
        const msg = JSON.parse(e.data);

        const W = Number(msg.w) || 0;
        const H = Number(msg.h) || 0;

        // ✅ informer overlay.js de l’espace source des boxes
        if (W > 0 && H > 0 && typeof window.setOverlaySourceSize === 'function') {
            window.setOverlaySourceSize(W, H);
        }

        const boxes = Array.isArray(msg.boxes) ? msg.boxes : [];

        const pxBoxes = boxes.map(b => {
            // … tes conversions x1,y1,x2,y2 (inchangées) …
            let { x1, y1, x2, y2 } = b;

            if (x1 == null && b.x != null && b.w != null) {
            x1 = b.x; y1 = b.y; x2 = b.x + b.w; y2 = b.y + b.h;
            } else if (x1 == null && b.cx != null && b.cy != null && b.w != null && b.h != null) {
            x1 = b.cx - b.w/2; y1 = b.cy - b.h/2; x2 = b.cx + b.w/2; y2 = b.cy + b.h/2;
            }

            // normalisé → pixels source
            const looksNormalized = (W > 1 && H > 1) && x1 <= 1 && y1 <= 1 && x2 <= 1 && y2 <= 1;
            if (looksNormalized) {
            x1 *= W; y1 *= H; x2 *= W; y2 *= H;
            }

            const name = resolveClassName(b, msg);
            const conf = formatConf(b.conf ?? b.score ?? b.prob);

            return {
            x: Math.round(x1),
            y: Math.round(y1),
            w: Math.max(0, Math.round(x2 - x1)),
            h: Math.max(0, Math.round(y2 - y1)),
            label: `${name}${conf}`.trim()
            };
        });

        setBoxes(pxBoxes);
        } catch (err) {
        console.warn('[overlay-ws] bad message', err);
        }
    };
  }

  function scheduleReconnect() {
    clearReconnect();
    reconnectTimer = setTimeout(() => {
      // si l’URL a changé depuis (ex: config modifiée), on reconnectera sur la nouvelle
      connect();
    }, 1500);
  }
  function clearReconnect() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  }

  // ---- Reconnect si la config change
  window.addEventListener('vh-config-changed', () => {
    const url = currentWsUrl();
    if (url !== lastUrl) {
      try { sock?.close(); } catch {}
      // onclose déclenchera scheduleReconnect → sinon connect();
    }
  });

  // ---- Démarrage
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }
})();
