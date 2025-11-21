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
ALLOW_ORIGINS = [o for o in os.getenv(
    "ALLOW_ORIGINS",
    "http://localhost:4321,http://127.0.0.1:4321,http://192.168.10.2:4321,http://192.168.10.1:4321"
).split(",") if o]
ALLOW_ORIGIN_REGEX = os.getenv("ALLOW_ORIGIN_REGEX", "")

# Idle watchdog for demos (seconds without heartbeat → stop)
IDLE_SECONDS = int(os.getenv("IDLE_SECONDS", "300"))

# Adopt-on-startup (pick up already-running containers)
ADOPT_ON_STARTUP = os.getenv("ADOPT_ON_STARTUP", "1") == "1"
ADOPT_DELAY_SEC  = float(os.getenv("ADOPT_DELAY_SEC", "5"))
ADOPT_MODE       = os.getenv("ADOPT_MODE", "now").lower()  # "now" | "started_at"

# ================== DEMO REGISTRY ==================

# Docker Swarm task states that indicate a service is active/running
# (i.e., not in a terminal/failed state)
ACTIVE_TASK_STATES = frozenset(["new", "pending", "assigned", "preparing", "starting", "running"])

DEMOS: Dict[str, Dict] = {
    "yolo": {
        "service": "yolo",                        # <-- short service name
        "url": None,                              # browser URL built later
        "health_url": "http://yolo:6000/",  # internal (overlay)
        "needs": ["mediamtx", "capture"],       # mediamtx service + local capture
    },
    "pose": {
        "service": "pose",
        "url": None,
        "health_url": "http://pose:6000/",
        "needs": ["mediamtx", "capture"],
    },
    "chang": {},
    "price": {
        "service": "price-api",
        "url": None,
        "health_url": "http://price-api:8080/healthz",
        "needs": [],
},

}

CORE = ["mediamtx"]

SHARED_DEPS: list[str] = []

LOCAL_ONLY= {"capture"}


def _start_need(name: str):
    if name in LOCAL_ONLY:
        _ensure_capture_started(block=True)
    else:
        # name is a service short name (e.g., "mediamtx")
        _service_scale(name, 1)

def _stop_need(name: str):
    if name in LOCAL_ONLY:
        _maybe_stop_capture_now()
    else:
        _service_scale(name, 0)

PUBLIC_BASE = os.getenv("PUBLIC_BASE", "http://192.168.10.2")  # your frontend host
def _browser_url_for(demo_id: str) -> Optional[str]:
    if demo_id == "yolo": return f"{PUBLIC_BASE}:6000/"
    if demo_id == "pose": return f"{PUBLIC_BASE}:6001/"
    if demo_id == "price": return f"{PUBLIC_BASE}:8080/healthz"
    return None

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

# ================== SERVICE HELPERS ==================

STACK = os.getenv("STACK_NAME", "vision-hub")  # your stack name

def _svc_name(short: str) -> str:
    # Swarm’s actual service name in `docker stack deploy` is "<stack>_<service>"
    return f"{STACK}_{short}"

def _service_get(short: str):
    name = _svc_name(short)
    try:
        return client.services.get(name)
    except Exception:
        return None

def _service_scale(short: str, replicas: int) -> bool:
    svc = _service_get(short)
    if not svc:
        return False
    svc.scale(replicas)      # <- simpler & reliable
    return True

def _service_replicas(short: str) -> int:
    svc = _service_get(short)
    if not svc:
        return 0
    mode = svc.attrs["Spec"].get("Mode", {})
    reps = mode.get("Replicated", {}).get("Replicas")
    return int(reps or 0)

def _service_running(short: str) -> bool:
    """
    Check if a Docker Swarm service is running or starting.
    
    Returns True if:
    - Service has desired replicas > 0, AND
    - At least one task exists in an active state (not terminal/failed)
    
    Active states include: new, pending, assigned, preparing, starting, running
    Terminal states (return False): shutdown, complete, failed, rejected, orphaned, remove
    
    This approach is lenient during container transitions (startup, restart)
    to avoid false negatives that could cause the heartbeat system to fail.
    """
    svc = _service_get(short)
    if not svc:
        return False
    
    # Check desired replicas first
    replicas = _service_replicas(short)
    if replicas == 0:
        return False
    
    # Get all tasks (not just desired-state=running) to handle rapid transitions
    # During restart, tasks might momentarily not have desired-state=running
    tasks = svc.tasks()
    if not tasks:
        # If replicas > 0 but no tasks exist yet, consider it "starting"
        # This handles the brief moment when a service is first scaled up
        return True
    
    # Consider running if any task is in an active (non-terminal) state
    for task in tasks:
        state = task.get("Status", {}).get("State", "")
        if state in ACTIVE_TASK_STATES:
            return True
    
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
def _demo_has_service(demo_id: str) -> bool:
    spec = DEMOS.get(demo_id) or {}
    return bool(spec.get("service"))

def _demo_running(demo_id: str) -> bool:
    spec = DEMOS.get(demo_id) or {}
    svc = spec.get("service")
    return _service_running(svc) if svc else False

def _any_demo_running() -> bool:
    return any(_demo_running(did) for did in DEMOS.keys())

def _reconcile_shared_deps():
    any_running = _any_demo_running()
    for dep in SHARED_DEPS:
        if dep in LOCAL_ONLY:
            (_ensure_capture_started if any_running else _maybe_stop_capture_now)()
        else:
            _service_scale(dep, 1 if any_running else 0)

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
                        if _demo_has_service(demo_id):
                            _service_scale(DEMOS[demo_id]["service"], 0)
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
        log.info("adopt: disabled")
        return
    time.sleep(ADOPT_DELAY_SEC)
    for demo_id, spec in DEMOS.items():
        svc = spec.get("service")
        if svc and _service_running(svc):
            _last_beat[demo_id] = time.time() if ADOPT_MODE == "now" else time.time()
            log.info("adopt: demo=%s running", demo_id)
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
        exists = running = False
        if _demo_has_service(demo_id):
            exists = _service_get(spec["service"]) is not None
            running = _service_running(spec["service"])
        out.append(DemoStatus(id=demo_id, exists=exists, running=running,
                              url=_browser_url_for(demo_id)))
    return out

@app.get("/demos/{demo_id}/status")
def demo_status(demo_id: str, x_token: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    _auth(x_token, token)
    spec = DEMOS.get(demo_id) or {}
    if not spec:
        raise HTTPException(404, "Unknown demo id")
    exists = running = False
    if _demo_has_service(demo_id):
        exists = _service_get(spec["service"]) is not None
        running = _service_running(spec["service"])
        if running and demo_id not in _last_beat:
            _last_beat[demo_id] = time.time()
            log.info("adopt(status): demo=%s last_beat=%d", demo_id, int(_last_beat[demo_id]))
            _ensure_idle_monitor()
    return DemoStatus(id=demo_id, exists=exists, running=running, url=_browser_url_for(demo_id))

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

    # Start core + deps
    for core in CORE:
        _start_need(core)
    for dep in spec.get("needs", []):
        _start_need(dep)

    _active_demos.add(demo_id)

    # Start the service (or mark active if non-service)
    if _demo_has_service(demo_id):
        if not _service_scale(spec["service"], 1):
            raise HTTPException(404, f"Service '{_svc_name(spec['service'])}' not found.")
        # wait for health by HTTP via internal DNS (VIP)
        ok = _wait_http_200(spec.get("health_url") or "", timeout_s=timeout) if wait else True
        if not ok:
            _active_demos.discard(demo_id)
            _schedule_capture_stop_if_idle()
            raise HTTPException(504, f"Demo did not become healthy within {timeout}s")
    else:
        # non-service demo, just mark active
        pass

    _last_beat[demo_id] = time.time()
    _ensure_idle_monitor()
    _reconcile_shared_deps()
    return {"ok": True, "id": demo_id, "url": _browser_url_for(demo_id)}

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
    if _demo_has_service(demo_id):
        _service_scale(spec["service"], 0)
    _last_beat.pop(demo_id, None)
    _active_demos.discard(demo_id)
    _schedule_capture_stop_if_idle()
    _reconcile_shared_deps()
    return {"ok": True, "id": demo_id}

@app.post("/consent")
def create_consent_token(demo: str = Query("*")):
    """Returns {token, expiresAt} for the given demo (or '*' for global)."""
    return _issue_consent_token(demo_id=demo)

@app.post("/demos/{demo_id}/heartbeat")
def heartbeat_demo(
    demo_id: str,
    x_token: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
):
    _auth(x_token, token)
    if demo_id not in DEMOS:
        raise HTTPException(404, "Unknown demo id")

    _last_beat[demo_id] = time.time()
    _active_demos.add(demo_id)
    _ensure_idle_monitor()
    _reconcile_shared_deps()
    return {"ok": True, "id": demo_id, "lastBeat": int(_last_beat[demo_id])}

# ================== STARTUP ==================
@app.on_event("startup")
def _on_startup():
    log.info(
        "API startup: allowing origins=%s regex=%s idle_seconds=%s adopt=%s(%s,%ss)",
        ALLOW_ORIGINS, ALLOW_ORIGIN_REGEX or "-", IDLE_SECONDS, ADOPT_ON_STARTUP, ADOPT_MODE, ADOPT_DELAY_SEC
    )
    _ensure_idle_monitor()
    threading.Thread(target=_adopt_running_demos, daemon=True).start()
