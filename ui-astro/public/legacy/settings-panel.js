// public/scripts/settings-panel.js
(function(){
  const css = `
  .vh-gear{ position:fixed; right:14px; bottom:14px; z-index:9999; }
  .vh-gear button{ background:#5aa4ff; border:0; color:#081120; font-weight:700; border-radius:12px; padding:8px 12px; cursor:pointer; }
  .vh-dlg{ position:fixed; inset:0; background:rgba(0,0,0,.45); display:none; align-items:center; justify-content:center; z-index:9998; }
  .vh-card{ width:min(680px, calc(100% - 24px)); background:#11151c; color:#e8eefc; border:1px solid #1c2230; border-radius:16px; padding:16px; box-shadow:0 6px 24px rgba(0,0,0,.35); }
  .vh-grid{ display:grid; grid-template-columns:1fr 2fr; gap:8px 12px; }
  .vh-row{ display:flex; gap:8px; align-items:center; justify-content:flex-end; margin-top:12px; }
  .vh-card input, .vh-card textarea{ width:100%; background:#0b0f18; color:#e8eefc; border:1px solid #2a3550; border-radius:10px; padding:8px; font:14px system-ui; }
  .vh-help{ color:#91a0b6; font-size:12px; margin-top:6px; }
  .vh-chip{ font-size:12px; background:#132342; border:1px solid #25406e; color:#cbd7ef; padding:2px 6px; border-radius:999px; }
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const gear = document.createElement('div');
  gear.className = 'vh-gear';
  gear.innerHTML = `<button type="button">⚙️ Réglages</button>`;
  document.body.appendChild(gear);

  const dlg = document.createElement('div');
  dlg.className = 'vh-dlg';
  dlg.innerHTML = `
    <div class="vh-card">
      <h3 style="margin:4px 0 12px">Réglages Vision Hub <span class="vh-chip">runtime</span></h3>
      <div class="vh-grid">
        <label>Autostart</label>
        <div><input type="checkbox" id="vh_autostart"></div>

        <label>Port WHEP (base)</label>
        <div><input type="number" id="vh_port" min="1" max="65535" placeholder="8889"></div>

        <label>Chemin cam</label>
        <div><input type="text" id="vh_cam" placeholder="/cam/whep"></div>

        <label>Chemin annot</label>
        <div><input type="text" id="vh_annot" placeholder="/annot/whep"></div>

        <label>WS boxes (YOLO)</label>
        <div><input type="text" id="vh_ws" placeholder="ws(s)://host:6002/ws/dets">
          <div class="vh-help">Doit être <b>wss://</b> si la page est servie en https.</div>
        </div>

        <label>ICE servers (JSON)</label>
        <div><textarea id="vh_ice" rows="4" placeholder='[{"urls":"stun:stun.l.google.com:19302"}]'></textarea></div>
      </div>
      <div class="vh-row">
        <button type="button" id="vh_reset" style="background:#2a3550;color:#e8eefc;border-radius:10px;padding:8px 12px;border:1px solid #3c4b73;">Par défaut</button>
        <div style="flex:1"></div>
        <button type="button" id="vh_cancel" style="background:#2a3550;color:#e8eefc;border-radius:10px;padding:8px 12px;border:1px solid #3c4b73;">Annuler</button>
        <button type="button" id="vh_save" style="background:#5aa4ff;color:#081120;font-weight:700;border-radius:10px;padding:8px 12px;border:0;">Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  function openDlg() {
    const cfg = window.getConfig?.() || {};
    dlg.querySelector('#vh_autostart').checked = !!cfg.autostart;
    dlg.querySelector('#vh_port').value = cfg.basePort ?? 8889;
    dlg.querySelector('#vh_cam').value = cfg.camPath ?? '/cam/whep';
    dlg.querySelector('#vh_annot').value = cfg.annotPath ?? '/annot/whep';
    dlg.querySelector('#vh_ws').value = cfg.wsUrl ?? '';
    dlg.querySelector('#vh_ice').value = JSON.stringify(cfg.iceServers ?? [], null, 2);
    dlg.style.display = 'flex';
  }
  function closeDlg(){ dlg.style.display = 'none'; }

  gear.querySelector('button').addEventListener('click', openDlg);
  dlg.addEventListener('click', (e)=>{ if (e.target === dlg) closeDlg(); });
  dlg.querySelector('#vh_cancel').addEventListener('click', closeDlg);
  dlg.querySelector('#vh_reset').addEventListener('click', () => { window.resetConfig?.(); openDlg(); });

  dlg.querySelector('#vh_save').addEventListener('click', () => {
    try {
      const autostart = dlg.querySelector('#vh_autostart').checked;
      const basePort  = parseInt(dlg.querySelector('#vh_port').value, 10) || 8889;
      const camPath   = dlg.querySelector('#vh_cam').value || '/cam/whep';
      const annotPath = dlg.querySelector('#vh_annot').value || '/annot/whep';
      const wsUrl     = dlg.querySelector('#vh_ws').value || '';
      const iceServers = JSON.parse(dlg.querySelector('#vh_ice').value || '[]');

      window.setConfig?.({ autostart, basePort, camPath, annotPath, wsUrl, iceServers });
      closeDlg();
    } catch (e) {
      alert('ICE servers JSON invalide.');
    }
  });
})();
