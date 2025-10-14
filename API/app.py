# API/app.py
import os
import sys
import time
import threading
import jwt
from typing import Dict, Optional

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
    force=True,  # override defaults (incl. uvicorn's) so we always see logs
)
log = logging.getLogger("orch")

# ================== CONFIG (ENV) ==================
API_TOKEN = os.environ.get("ORCH_TOKEN", "dev-token")
CONSENT_SECRET = os.environ.get("CONSENT_SECRET", "dev-consent-secret")
CONSENT_TTL_SECONDS = int(os.environ.get("CONSENT_TTL_SECONDS", "600"))  # 10 min par défaut
CONSENT_AUDIENCE = os.environ.get("CONSENT_AUD", "vision-hub")

# Comma-separated allowed origins, e.g. "http://localhost:4321,http://127.0.0.1:4321"
ALLOW_ORIGINS = [o for o in os.getenv("ALLOW_ORIGINS", "http://localhost:4321").split(",") if o]
# Optional regex, e.g. ".*" to allow all (use with care)
ALLOW_ORIGIN_REGEX = os.getenv("ALLOW_ORIGIN_REGEX", "")

# Stop demos after X seconds without heartbeat
IDLE_SECONDS = int(os.getenv("IDLE_SECONDS", "600"))

# Adopt-on-startup behavior
ADOPT_ON_STARTUP = os.getenv("ADOPT_ON_STARTUP", "1") == "1"
ADOPT_DELAY_SEC  = float(os.getenv("ADOPT_DELAY_SEC", "5"))  # wait a bit for compose to settle
# ADOPT_MODE:
#   "now"         -> set _last_beat to now (will be stopped after IDLE_SECONDS from API boot)
#   "started_at"  -> set _last_beat to Docker container StartedAt (more precise)
ADOPT_MODE = os.getenv("ADOPT_MODE", "now").lower()  # "now" or "started_at"

# Demo registry
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
}
CORE = ["vision-hub-mediamtx", "vision-hub-capture"]

# ================== APP / CORS ==================
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

# ================== DOCKER CLIENT ==================
client = docker.from_env()

# ================== STATE / HELPERS ==================
_last_beat: Dict[str, float] = {}  # demo_id -> last heartbeat (epoch seconds)
_stop_thread_started = False
_stop_thread_lock = threading.Lock()


def _auth(x_token: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    tok = x_token or token
    if tok != API_TOKEN:
        raise HTTPException(401, "Unauthorized")

def _issue_consent_token(demo_id: str) -> Dict[str, int | str]:
    now = int(time.time())
    exp = now + CONSENT_TTL_SECONDS
    payload = {
        "sub": "demo-consent",
        "aud": CONSENT_AUDIENCE,
        "iat": now,
        "exp": exp,
        "demo": demo_id,  # lie le jeton à la démo (ou "*" si tu veux global)
    }
    token = jwt.encode(payload, CONSENT_SECRET, algorithm="HS256")
    return {"token": token, "expiresAt": exp * 1000}  # ms pour le front


def _require_consent_for(demo_id: str, x_consent_token: Optional[str]) -> Dict:
    """Vérifie le header X-Consent-Token (JWT), expiration & correspondance demo."""
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
    # Optionnel: autoriser "*" (consent global) sinon lier strictement à la démo
    allowed = claims.get("demo") in (demo_id, "*")
    if not allowed:
        raise HTTPException(401, "consent not granted for this demo")
    return claims

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
    """Wait until Docker Health='healthy' (same signal as `docker ps`)."""
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
    """Fallback if no Docker healthcheck: wait for HTTP < 400 on the given URL."""
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


def _ensure_idle_monitor():
    """Background thread: stop demo after IDLE_SECONDS without heartbeat."""
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
                        log.info("idle-monitor: stopping demo=%s container=%s (idle for %.1fs)",
                                 demo_id, spec["container"], now - last)
                        _stop_if_exists(spec["container"])
                        _last_beat.pop(demo_id, None)
                time.sleep(5)

        threading.Thread(target=loop, daemon=True).start()


def _parse_started_at(s: str) -> Optional[float]:
    """Parse Docker StartedAt into epoch seconds."""
    if not s:
        return None
    try:
        # Examples: "2025-10-08T12:34:56.123456789Z" or "2025-10-08T12:34:56.123456Z"
        # Trim to microseconds for fromisoformat
        if s.endswith("Z"):
            s = s[:-1]
        if "." in s:
            head, tail = s.split(".", 1)
            tail = tail[:6]  # microseconds
            s = f"{head}.{tail}"
        dt = datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return None


def _adopt_running_demos():
    """Scan all demos at API startup; if container is running and no beat, initialize last_beat."""
    if not ADOPT_ON_STARTUP:
        log.info("adopt: disabled (ADOPT_ON_STARTUP=0)")
        return

    log.info("adopt: scanning demos after %ss (mode=%s)", ADOPT_DELAY_SEC, ADOPT_MODE)
    time.sleep(ADOPT_DELAY_SEC)

    for demo_id, spec in DEMOS.items():
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
        st = _status(spec["container"])
        out.append(DemoStatus(id=demo_id, exists=st["exists"], running=st["running"], url=spec["url"]))
    return out


@app.get("/demos/{demo_id}/status")
def demo_status(demo_id: str, x_token: Optional[str] = Header(None), token: Optional[str] = Query(None)):
    _auth(x_token, token)
    spec = DEMOS.get(demo_id)
    if not spec:
        raise HTTPException(404, "Unknown demo id")
    st = _status(spec["container"])

    # Optional small "auto-adopt" if you want /status to pick up manually started demos:
    if st["running"] and demo_id not in _last_beat:
        _last_beat[demo_id] = time.time()
        log.info("adopt(status): demo=%s container=%s last_beat=%d",
                 demo_id, spec["container"], int(_last_beat[demo_id]))
        _ensure_idle_monitor()

    return DemoStatus(id=demo_id, exists=st["exists"], running=st["running"], url=spec["url"])


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

    # 1) core + deps
    for core in CORE:
        _start_if_exists(core)
    for dep in spec.get("needs", []):
        _start_if_exists(dep)

    # 2) start demo
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

    # 3) wait strategy
    if wait:
        has_health = bool(c.attrs.get("Config", {}).get("Health"))
        ok = _wait_healthy_by_docker(spec["container"], timeout_s=timeout) if has_health \
             else _wait_http_200(spec.get("health_url") or spec["url"], timeout_s=timeout)
        if not ok:
            raise HTTPException(504, f"Demo did not become healthy within {timeout}s")

    # 4) idle tracking
    _last_beat[demo_id] = time.time()
    log.info("start: demo=%s last_beat=%d", demo_id, int(_last_beat[demo_id]))
    _ensure_idle_monitor()

    return {"ok": True, "id": demo_id, "url": spec["url"]}


@app.post("/demos/{demo_id}/stop")
def stop_demo(demo_id: str, x_token: Optional[str] = Header(None), token: Optional[str] = Query(None), x_consent_token: Optional[str] = Header(None, alias="X-Consent-Token")):
    _auth(x_token, token)
    _require_consent_for(demo_id, x_consent_token)
    spec = DEMOS.get(demo_id)
    if not spec:
        raise HTTPException(404, "Unknown demo id")

    _stop_if_exists(spec["container"])
    _last_beat.pop(demo_id, None)
    log.info("stop: demo=%s", demo_id)
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
    """Retourne {token, expiresAt} pour le demoId donné (ou '*' pour global)."""
    # Si tu veux restreindre, remplace "*" par un demoId obligatoire
    out = _issue_consent_token(demo_id=demo)
    return out


# ================== STARTUP (adopt-on-startup) ==================
@app.on_event("startup")
def _on_startup():
    log.info("API startup: allowing origins=%s regex=%s idle_seconds=%s adopt=%s(%s,%ss)",
             ALLOW_ORIGINS, ALLOW_ORIGIN_REGEX or "-", IDLE_SECONDS, ADOPT_ON_STARTUP,
             ADOPT_MODE, ADOPT_DELAY_SEC)
    # Kick idle monitor and adopt logic
    _ensure_idle_monitor()
    threading.Thread(target=_adopt_running_demos, daemon=True).start()

