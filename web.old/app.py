from flask import Flask, Response, abort, request, stream_with_context
import requests, time, html

app = Flask(__name__)

UPSTREAMS = {
    "yolo": "http://yolo:5000/video",
    "pose": "http://pose:5000/video",
}

HTML = """<!doctype html>
<html><body style="font-family:sans-serif">
  <h2>Vision Hub - Démos</h2>

  <form style="margin:12px 0" onsubmit="ev();return false;">
    <label for="demo">Choisir la démo (annotation) :</label>
    <select name="demo" id="demo">
      <option value="yolo">YOLO (objets)</option>
      <option value="pose">Pose Estimation</option>
    </select>
    <button type="submit">Lancer</button>
    <span style="margin-left:8px;color:#666">Aperçu faible latence ci-dessous (WebRTC, flux brut)</span>
  </form>

  <div style="display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap">
    <!-- Low-latency preview (WebRTC via MediaMTX) -->
    <div>
      <h4 style="margin:6px 0">Preview (WebRTC)</h4>
      <iframe id="webrtc" src="" width="640" height="360" style="border:1px solid #ddd" allow="autoplay; fullscreen"></iframe>
    </div>

    <!-- Optional annotated stream (proxied MJPEG) -->
    <div>
      <h4 style="margin:6px 0">Annotation</h4>
      <img id="annot" src="" width="640" style="border:1px solid #ddd"/>
    </div>
  </div>

  <script>
    function ev(){
      const demo = document.getElementById('demo').value;
      document.getElementById('annot').src = '/stream?demo=' + encodeURIComponent(demo) + '&t=' + Date.now();
    }
    // init
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo') || 'yolo';
    document.getElementById('demo').value = demo;
    ev();
    // WebRTC player (MediaMTX UI)
    // If you're browsing on the host, expose port 8889 and 8554 and use localhost:
    document.getElementById('webrtc').src = '/cam';
    // If you open the page from inside Docker or a different host, change to the right host/IP.
  </script>
</body></html>"""


@app.route("/")
def index():
    return HTML

def passthrough(url: str):
    for _ in range(3):
        try:
            r = requests.get(url, stream=True, timeout=(3, 30))
            r.raise_for_status()
            ctype = r.headers.get("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            def gen():
                for chunk in r.iter_content(chunk_size=16384):
                    if chunk:
                        yield chunk
            return ctype, gen()
        except Exception as e:
            last = e
            time.sleep(1)
    raise RuntimeError(last)

@app.route("/stream")
def stream():
    demo = request.args.get("demo", "yolo")
    url = UPSTREAMS.get(demo)
    if not url:
        abort(400, f"Unknown demo: {html.escape(demo)}")
    try:
        ctype, gen = passthrough(url)
        return Response(stream_with_context(gen), mimetype=ctype)
    except Exception as e:
        print("Proxy error:", e, flush=True)
        abort(502, description=f"Upstream stream unavailable: {e}")



@app.route("/cam")
def cam():
  return """
<!doctype html>
<html>
  <head><meta charset='utf-8'><title>WebRTC – cam</title></head>
  <body style='margin:0;background:#000;color:#eee;font:14px system-ui'>
    <div style='padding:8px'>
      <b>WebRTC FPS:</b> <span id='rtcFps'>—</span>
      <span id='status' style='color:#9cf;margin-left:8px'>connecting…</span>
    </div>
    <video id='v' playsinline autoplay muted style='width:100%;max-width:960px;background:#000'></video>
  <script>
  console.log('[iframe /cam] JS chargé');
    (async ()=>{
      const v = document.getElementById('v');
      const fpsEl = document.getElementById('rtcFps');
      const st = document.getElementById('status');
      const WHEP = `http://${location.hostname}:8889/cam/whep`;
      try{
        const pc = new RTCPeerConnection();
        pc.addTransceiver('video', {direction:'recvonly'});
        pc.ontrack = (ev)=>{ v.srcObject = ev.streams[0]; };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const r = await fetch(WHEP, {
          method: 'POST',
          headers: {'Content-Type':'application/sdp'},
          body: offer.sdp
        });
        if(!r.ok){ throw new Error('WHEP POST failed: ' + r.status); }
        const answerSdp = await r.text();
        await pc.setRemoteDescription({type:'answer', sdp: answerSdp});
        st.textContent = 'actif';
        // FPS counter (requestVideoFrameCallback → fallback) + postMessage
        const hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
        if(hasRVFC){
          let last=0, acc=[];
          const onFrame = (now)=>{
            if(last){
              const dt = now - last;
              acc.push(dt); if(acc.length>90) acc.shift();
              const avg = acc.reduce((a,b)=>a+b,0)/acc.length;
              const fps = (1000/avg).toFixed(1);
              fpsEl.textContent = fps + ' fps';
              window.parent.postMessage({type:'webrtc-fps', fps: fps}, '*');
            }
            last = now;
            if(!v.paused && !v.ended) v.requestVideoFrameCallback(onFrame);
            else setTimeout(()=>v.requestVideoFrameCallback(onFrame), 300);
          };
          v.requestVideoFrameCallback(onFrame);
        }else{
          let lastFrames=0, lastTs=performance.now();
          const tick=()=>{
            const now=performance.now();
            const q=v.getVideoPlaybackQuality?.();
            const total=q ? q.totalVideoFrames : (v.webkitDecodedFrameCount||0);
            const df=total-lastFrames, dt=now-lastTs;
            if(dt>=250 && df>=0){
              const fps = (df*1000/dt).toFixed(1);
              fpsEl.textContent = fps + ' fps';
              window.parent.postMessage({type:'webrtc-fps', fps: fps}, '*');
              lastFrames=total; lastTs=now;
            }
            if(!v.paused && !v.ended) requestAnimationFrame(tick); else setTimeout(tick,300);
          };
          tick();
        }
      }catch(e){
        st.textContent = 'erreur: '+e;
      }
    })();
    </script>
  </body>
</html>
"""


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, threaded=True)
