# API/app.py
import os
import sys
import time
import threading
from typing import Dict, Optional, Set

import jwt
import docker
import requests
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Header, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging

# ================== LOGGING ==================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s:%(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
    force=True,
)
log = logging.getLogger("orch")

# ================== CONFIG (ENV) ==================
API_TOKEN = os.environ.get("ORCH_TOKEN", "dev-token")

# Consent (JWT)
CONSENT_SECRET       = os.environ.get("CONSENT_SECRET", "dev-consent-secret")
CONSENT_TTL_SECONDS  = int(os.environ.get("CONSENT_TTL_SECONDS", "600"))  # 10 min
CONSENT_AUDIENCE     = os.environ.get("CONSENT_AUD", "vision-hub")

# Capture management (shared webcam producer)
CAPTURE_NAME            = os.getenv("CAPTURE_NAME", "vision-hub-capture")
CAPTURE_IDLE_GRACE      = int(os.getenv("CAPTURE_IDLE_GRACE", "180"))   # stop after idle for X s
CAPTURE_MIN_DOWN        = int(os.getenv("CAPTURE_MIN_DOWN", "20"))      # min down to avoid flapping
CAPTURE_MIN_UP          = int(os.getenv("CAPTURE_MIN_UP", "60"))        # min up before allowed to stop
CAPTURE_STARTUP_SETTLE  = int(os.getenv("CAPTURE_STARTUP_SETTLE", "3")) # settle after start

# CORS
ALLOW_ORIGINS     = [o for o in os.getenv("ALLOW_ORIGINS", "http://localhost:4321").split(",") if o]
ALLOW_ORIGIN_REGEX= os.getenv("ALLOW_ORIGIN_REGEX", "")

# Idle watchdog for demos (seconds without heartbeat → stop)
IDLE_SECONDS = int(os.getenv("IDLE_SECONDS", "300"))

# Adopt-on-startup (pick up already-running containers)
ADOPT_ON_STARTUP = os.getenv("ADOPT_ON_STARTUP", "1") == "1"
ADOPT_DELAY_SEC  = float(os.getenv("ADOPT_DELAY_SEC", "5"))
ADOPT_MODE       = os.getenv("ADOPT_MODE", "now").lower()  # "now" | "started_at"

# ================== DEMO REGISTRY ==================
DEMOS: Dict[str, Dict] = {
    "yolo": {
        "container": "vision-hub-yolo",
        "url": "http://localhost:5000/",
        "health_url": "http://vision-hub-yolo:5000/",
        "needs": ["vision-hub-mediamtx", "vision-hub-capture"],
    },
    "pose": {
        "container": "vision-hub-pose",
        "url": "http://localhost:5000/",
        "health_url": "http://vision-hub-pose:5000/",
        "needs": ["vision-hub-mediamtx", "vision-hub-capture"],
    },
    "chang": {},
    "appartment-prices": { "needs": [] },
}

CORE = ["vision-hub-mediamtx"]

SHARED_DEPS: list[str] = []

# ================== FASTAPI / CORS ==================
app = FastAPI(title="Vision Hub Orchestrator")

cors_kwargs = dict(
    allow_origins=ALLOW_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "x-token", "x-consent-token"],
)
if ALLOW_ORIGIN_REGEX:
    cors_kwargs["allow_origin_regex"] = ALLOW_ORIGIN_REGEX

app.add_middleware(CORSMiddleware, **cors_kwargs)

# ================== DOCKER ==================
client = docker.from_env()

# ================== STATE ==================
_last_beat: Dict[str, float] = {}
_stop_thread_started = False
_stop_thread_lock = threading.Lock()

_active_demos: Set[str] = set()

_capture_last_start: float = 0.0
_capture_last_stop:  float = 0.0
_capture_stop_timer: Optional[threading.Timer] = None
_capture_lock = threading.Lock()

# ================== AUTH / CONSENT ==================
def _auth(x_token: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    tok = x_token or token
    if tok != API_TOKEN:
        raise HTTPException(401, "Unauthorized")

def _issue_consent_token(demo_id: str) -> Dict[str, int | str]:
    now = int(time.time())
    exp = now + CONSENT_TTL_SECONDS
    payload = {
        "sub":  "demo-consent",
        "aud":  CONSENT_AUDIENCE,
        "iat":  now,
        "exp":  exp,
        "demo": demo_id,  # or "*" for global
    }
    token = jwt.encode(payload, CONSENT_SECRET, algorithm="HS256")
    return {"token": token, "expiresAt": exp * 1000}  # ms for front-end

def _require_consent_for(demo_id: str, x_consent_token: Optional[str]) -> Dict:
    if not x_consent_token:
        raise HTTPException(401, "missing consent token")
    try:
        claims = jwt.decode(
            x_consent_token,
            CONSENT_SECRET,
            algorithms=["HS256"],
            audience=CONSENT_AUDIENCE,
        )
    except Exception:
        raise HTTPException(401, "invalid or expired consent token")
    if claims.get("demo") not in (demo_id, "*"):
        raise HTTPException(401, "consent not granted for this demo")
    return claims

# ================== DOCKER HELPERS (SAFE) ==================
def _get(name: str):
    try:
        return client.containers.get(name)
    except Exception:
        return None

def _start_if_exists(name: str) -> bool:
    c = _get(name)
    if not c:
        return False
    c.reload()
    if c.status != "running":
        log.info("starting container=%s", name)
        c.start()
        time.sleep(0.2)
    return True

def _stop_if_exists(name: str) -> bool:
    c = _get(name)
    if not c:
        return False
    c.reload()
    if c.status == "running":
        log.info("stopping container=%s", name)
        c.stop(timeout=5)
    return True

def _status(name: str):
    c = _get(name)
    if not c:
        return {"exists": False, "running": False}
    c.reload()
    return {"exists": True, "running": (c.status == "running")}

def _wait_healthy_by_docker(name: str, timeout_s: int = 90, step: float = 0.5) -> bool:
    t0 = time.time()
    while time.time() - t0 <= timeout_s:
        c = _get(name)
        if not c:
            return False
        c.reload()
        st = c.attrs.get("State", {}).get("Health", {}).get("Status")
        if st == "healthy":
            return True
        time.sleep(step)
    return False

def _wait_http_200(url: str, timeout_s: int = 20, step: float = 0.5) -> bool:
    t0 = time.time()
    while time.time() - t0 <= timeout_s:
        try:
            r = requests.get(url, timeout=2)
            if r.status_code < 400:
                return True
        except Exception:
            pass
        time.sleep(step)
    return False

# ================== CAPTURE (HYSTERESIS) ==================
def _capture_running() -> bool:
    st = _status(CAPTURE_NAME)
    return bool(st.get("exists") and st.get("running"))

def _ensure_capture_started(block: bool = True):
    with _capture_lock:
        if _capture_running():
            return
        since_stop = time.time() - _capture_last_stop
        wait_rem = CAPTURE_MIN_DOWN - since_stop
        if wait_rem > 0 and block:
            log.info("capture: honoring MIN_DOWN=%.1fs (wait %.1fs)", CAPTURE_MIN_DOWN, wait_rem)
            time.sleep(min(wait_rem, CAPTURE_MIN_DOWN))

        if not _start_if_exists(CAPTURE_NAME):
            log.warning("capture: container %s not found; skip", CAPTURE_NAME)
            return

        global _capture_last_start
        _capture_last_start = time.time()
        if CAPTURE_STARTUP_SETTLE > 0:
            log.info("capture: startup settle %ss", CAPTURE_STARTUP_SETTLE)
            time.sleep(CAPTURE_STARTUP_SETTLE)

def _maybe_stop_capture_now():
    with _capture_lock:
        if not _capture_running():
            return
        up_for = time.time() - _capture_last_start
        if up_for < CAPTURE_MIN_UP:
            log.info("capture: not stopping yet; MIN_UP=%.1fs (up_for=%.1fs)", CAPTURE_MIN_UP, up_for)
            return
        log.info("capture: stopping (idle / no demos)")
        _stop_if_exists(CAPTURE_NAME)
        global _capture_last_stop
        _capture_last_stop = time.time()

def _schedule_capture_stop_if_idle():
    with _capture_lock:
        global _capture_stop_timer
        if _active_demos:
            return
        if _capture_stop_timer:
            try:
                _capture_stop_timer.cancel()
            except Exception:
                pass
            _capture_stop_timer = None

        def _task():
            if _active_demos:
                return
            _maybe_stop_capture_now()

        log.info("capture: scheduling stop in %ss (no active demos)", CAPTURE_IDLE_GRACE)
        _capture_stop_timer = threading.Timer(CAPTURE_IDLE_GRACE, _task)
        _capture_stop_timer.daemon = True
        _capture_stop_timer.start()

# ================== ADOPT / IDLE MONITOR ==================
def _demo_has_container(demo_id: str) -> bool:
    spec = DEMOS.get(demo_id) or {}
    return "container" in spec and bool(spec["container"])

def _demo_running(demo_id: str) -> bool:
    if not _demo_has_container(demo_id):
        return False
    spec = DEMOS[demo_id]
    st = _status(spec["container"])
    return bool(st.get("exists") and st.get("running"))

def _any_demo_running() -> bool:
    return any(_demo_running(did) for did in DEMOS.keys())

def _reconcile_shared_deps():
    any_running = _any_demo_running()
    for dep in SHARED_DEPS:
        if any_running:
            _start_if_exists(dep)
        else:
            _stop_if_exists(dep)

def _ensure_idle_monitor():
    global _stop_thread_started
    with _stop_thread_lock:
        if _stop_thread_started:
            return
        _stop_thread_started = True

        def loop():
            log.info("idle-monitor: started (idle_seconds=%s)", IDLE_SECONDS)
            while True:
                now = time.time()
                for demo_id, spec in DEMOS.items():
                    last = _last_beat.get(demo_id)
                    if not last:
                        continue
                    if now - last > IDLE_SECONDS:
                        if _demo_has_container(demo_id):
                            log.info(
                                "idle-monitor: stopping demo=%s container=%s (idle for %.1fs)",
                                demo_id, spec["container"], now - last
                            )
                            _stop_if_exists(spec["container"])
                        _last_beat.pop(demo_id, None)
                        _active_demos.discard(demo_id)
                        _schedule_capture_stop_if_idle()
                _reconcile_shared_deps()
                time.sleep(5)

        threading.Thread(target=loop, daemon=True).start()

def _parse_started_at(s: str) -> Optional[float]:
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1]
        if "." in s:
            head, tail = s.split(".", 1)
            s = f"{head}.{tail[:6]}"
        dt = datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None

def _adopt_running_demos():
    if not ADOPT_ON_STARTUP:
        log.info("adopt: disabled (ADOPT_ON_STARTUP=0)")
        return

    log.info("adopt: scanning demos after %ss (mode=%s)", ADOPT_DELAY_SEC, ADOPT_MODE)
    time.sleep(ADOPT_DELAY_SEC)

    for demo_id, spec in DEMOS.items():
        if not _demo_has_container(demo_id):
            log.info("adopt: %s -> no container key (skipped)", demo_id)
            continue
        c = _get(spec["container"])
        if not c:
            log.info("adopt: %s -> container not found (%s)", demo_id, spec["container"])
            continue
        c.reload()
        if c.status != "running":
            log.info("adopt: %s -> container not running", demo_id)
            continue
        if demo_id in _last_beat:
            log.info("adopt: %s -> already has last_beat=%d", demo_id, int(_last_beat[demo_id]))
            continue

        if ADOPT_MODE == "started_at":
            started_at_raw = c.attrs.get("State", {}).get("StartedAt", "")
            t0 = _parse_started_at(started_at_raw) or time.time()
        else:
            t0 = time.time()

        _last_beat[demo_id] = t0
        log.info("adopt: demo=%s container=%s last_beat=%d", demo_id, spec["container"], int(t0))

    _ensure_idle_monitor()
    _reconcile_shared_deps()

# ================== MODELS ==================
class DemoStatus(BaseModel):
    id: str
    exists: bool
    running: bool
    url: Optional[str] = None

# ================== MIDDLEWARE ==================
@app.middleware("http")
async def log_origin(request: Request, call_next):
    if request.url.path.startswith("/demos/"):
        log.info("[HTTP] %s %s Origin=%s", request.method, request.url.path, request.headers.get("origin"))
    return await call_next(request)

# ================== ROUTES ==================
@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/demos")
def list_demos(x_token: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    _auth(x_token, token)
    out = []
    for demo_id, spec in DEMOS.items():
        url = spec.get("url")
        exists = running = False
        if _demo_has_container(demo_id):
            st = _status(spec["container"])
            exists = bool(st["exists"])
            running = bool(st["running"])
        out.append(DemoStatus(id=demo_id, exists=exists, running=running, url=url))
    return out

@app.get("/demos/{demo_id}/status")
def demo_status(demo_id: str, x_token: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    _auth(x_token, token)
    spec = DEMOS.get(demo_id)
    if not spec:
        raise HTTPException(404, "Unknown demo id")

    exists = running = False
    if _demo_has_container(demo_id):
        st = _status(spec["container"])
        exists = bool(st["exists"])
        running = bool(st["running"])
        if running and demo_id not in _last_beat:
            _last_beat[demo_id] = time.time()
            log.info("adopt(status): demo=%s container=%s last_beat=%d",
                     demo_id, spec["container"], int(_last_beat[demo_id]))
            _ensure_idle_monitor()

    return DemoStatus(id=demo_id, exists=exists, running=running, url=spec.get("url"))

@app.post("/demos/{demo_id}/start")
def start_demo(
    demo_id: str,
    x_token: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    wait: int = Query(1, ge=0, le=1),
    timeout: int = Query(90, ge=1, le=300),
):
    _auth(x_token, token)
    spec = DEMOS.get(demo_id)
    if not spec:
        raise HTTPException(404, "Unknown demo id")

    # Start core + declared deps
    for core in CORE:
        _start_if_exists(core)
    for dep in spec.get("needs", []):
        _start_if_exists(dep)

    # Mark demo active and ensure capture (if needed)
    _active_demos.add(demo_id)
    if CAPTURE_NAME in spec.get("needs", []):
        _ensure_capture_started(block=True)

    # If no container (non-container demo), just mark running logically
    if not _demo_has_container(demo_id):
        _last_beat[demo_id] = time.time()
        _ensure_idle_monitor()
        _reconcile_shared_deps()
        return {"ok": True, "id": demo_id, "url": spec.get("url")}

    # Start the demo container
    c = _get(spec["container"])
    if not c:
        raise HTTPException(
            404,
            f"Container '{spec['container']}' not found. Create it once with `docker compose --profile demo up -d`."
        )
    c.reload()
    if c.status != "running":
        log.info("start: starting demo=%s container=%s", demo_id, spec["container"])
        c.start()

    # Wait strategy
    if wait:
        has_health = bool(c.attrs.get("Config", {}).get("Health"))
        ok = _wait_healthy_by_docker(spec["container"], timeout_s=timeout) if has_health \
             else _wait_http_200(spec.get("health_url") or spec.get("url",""), timeout_s=timeout)
        if not ok:
            _active_demos.discard(demo_id)
            _schedule_capture_stop_if_idle()
            raise HTTPException(504, f"Demo did not become healthy within {timeout}s")

    # Idle tracking
    _last_beat[demo_id] = time.time()
    log.info("start: demo=%s last_beat=%d", demo_id, int(_last_beat[demo_id]))
    _ensure_idle_monitor()
    _reconcile_shared_deps()

    return {"ok": True, "id": demo_id, "url": spec.get("url")}

@app.post("/demos/{demo_id}/stop")
def stop_demo(
    demo_id: str,
    x_token: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    x_consent_token: Optional[str] = Header(None, alias="X-Consent-Token"),
):
    _auth(x_token, token)
    _require_consent_for(demo_id, x_consent_token)

    spec = DEMOS.get(demo_id)
    if not spec:
        raise HTTPException(404, "Unknown demo id")

    if _demo_has_container(demo_id):
        _stop_if_exists(spec["container"])

    _last_beat.pop(demo_id, None)
    _active_demos.discard(demo_id)
    log.info("stop: demo=%s", demo_id)

    _schedule_capture_stop_if_idle()
    _reconcile_shared_deps()
    return {"ok": True, "id": demo_id}

@app.post("/demos/{demo_id}/heartbeat")
def heartbeat(demo_id: str, x_token: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    _auth(x_token, token)
    if demo_id not in DEMOS:
        raise HTTPException(404, "Unknown demo id")
    _last_beat[demo_id] = time.time()
    log.info("heartbeat: demo=%s last_beat=%d", demo_id, int(_last_beat[demo_id]))
    _ensure_idle_monitor()
    return {"ok": True}

@app.post("/consent")
def create_consent_token(demo: str = Query("*")):
    """Returns {token, expiresAt} for the given demo (or '*' for global)."""
    return _issue_consent_token(demo_id=demo)

# ================== STARTUP ==================
@app.on_event("startup")
def _on_startup():
    log.info(
        "API startup: allowing origins=%s regex=%s idle_seconds=%s adopt=%s(%s,%ss)",
        ALLOW_ORIGINS, ALLOW_ORIGIN_REGEX or "-", IDLE_SECONDS, ADOPT_ON_STARTUP, ADOPT_MODE, ADOPT_DELAY_SEC
    )
    _ensure_idle_monitor()
    threading.Thread(target=_adopt_running_demos, daemon=True).start()
