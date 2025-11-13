from __future__ import annotations

import os
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
import json

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ------------------------------------------------------------------------------
# Config & logging
# ------------------------------------------------------------------------------
MODEL_DIR = os.environ.get("MODEL_DIR", "/app/model")
APP_TITLE = "SE House Price API"
APP_VERSION = "1.2.0"

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("se-house-price-api")

# ------------------------------------------------------------------------------
# FastAPI app
# ------------------------------------------------------------------------------
app = FastAPI(title=APP_TITLE, version=APP_VERSION)

# CORS
allowed = os.getenv(
    "ALLOW_ORIGINS",
    "http://localhost:4321,http://127.0.0.1:4321,http://192.168.10.2:4321",
).split(",")

allow_origin_regex = os.getenv("ALLOW_ORIGIN_REGEX")  # e.g. r"^https?://192\.168\.10\.\d+:4321$"
if allow_origin_regex:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=allow_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in allowed if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ------------------------------------------------------------------------------
# Load artifacts
# ------------------------------------------------------------------------------
def _load_artifact(path: str):
    p = os.path.join(MODEL_DIR, path)
    if not os.path.exists(p):
        raise FileNotFoundError(f"Missing artifact: {p}")
    return joblib.load(p)

def _load_json(path: str) -> dict:
    p = os.path.join(MODEL_DIR, path)
    return json.load(open(p, "r", encoding="utf-8")) if os.path.exists(p) else {}

try:
    median_model = _load_artifact("model_median.pkl")
    p10_model    = _load_artifact("model_p10.pkl")
    p90_model    = _load_artifact("model_p90.pkl")
    schema: Dict[str, Any] = _load_artifact("schema.pkl")
    model_meta = _load_json("model_meta.json")
    log.info("Models & schema loaded from %s", MODEL_DIR)
except Exception as e:
    log.exception("Failed loading artifacts: %s", e)
    median_model = p10_model = p90_model = None  # type: ignore
    schema = {"required": ["living_area", "rooms"], "optional": []}
    model_meta = {}

# Build canonical expected input column list
def _expected_input_columns() -> List[str]:
    # 1) meta.features_used from training
    feats = model_meta.get("features_used") if isinstance(model_meta, dict) else None
    if feats:
        return list(feats)
    # 2) fallback to schema
    req = list(schema.get("required", []))
    opt = list(schema.get("optional", []))
    if req or opt:
        return [*req, *opt]
    return ["living_area", "rooms"]

EXPECTED_INPUT_COLS: List[str] = _expected_input_columns()

# Text fields to coerce to strings only if present in this model
TEXT_FIELDS = tuple([f for f in ("housing_type", "municipality", "address") if f in EXPECTED_INPUT_COLS])

REQUIRED: List[str] = list(schema.get("required", ["living_area", "rooms"]))

# ------------------------------------------------------------------------------
# Pydantic models
# ------------------------------------------------------------------------------
class PredictIn(BaseModel):
    living_area: float = Field(..., ge=10)
    rooms: float = Field(..., ge=1)

    plot_area: Optional[float] = None
    housing_type: Optional[str] = None
    municipality: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    month: Optional[int] = None
    year: Optional[int] = None

    construction_year: Optional[int] = None
    floor: Optional[float] = None
    rent: Optional[float] = None
    list_price: Optional[int] = None

    class Config:
        extra = "ignore"

class PredictOut(BaseModel):
    price_sek: int
    pi_low: int
    pi_high: int

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------
def _ensure_ready():
    if median_model is None or p10_model is None or p90_model is None:
        raise HTTPException(status_code=503, detail="Model artifacts not loaded")

def _sanitize_payload(d: Dict[str, Any]) -> Dict[str, Any]:
    # Default time context
    now = datetime.now()
    d.setdefault("month", now.month)
    d.setdefault("year",  now.year)

    # Strings for text features
    for k in TEXT_FIELDS:
        v = d.get(k)
        d[k] = "" if v is None else str(v).strip()

    # Ensure EVERY expected column exists; keep numeric None -> NaN
    for col in EXPECTED_INPUT_COLS:
        d.setdefault(col, None)
    return d

def _predict_row(row: Dict[str, Any]) -> PredictOut:
    # Build dataframe with EXACT training-time columns
    X = pd.DataFrame([row])
    for c in EXPECTED_INPUT_COLS:
        if c not in X.columns:
            X[c] = pd.NA
    X = X.reindex(columns=EXPECTED_INPUT_COLS)

    y_med = float(median_model.predict(X)[0])  # type: ignore
    y_lo  = float(p10_model.predict(X)[0])     # type: ignore
    y_hi  = float(p90_model.predict(X)[0])     # type: ignore

    if y_lo > y_hi:
        y_lo, y_hi = y_hi, y_lo

    return PredictOut(
        price_sek=int(round(y_med)),
        pi_low=int(round(y_lo)),
        pi_high=int(round(y_hi)),
    )

# ------------------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------------------
@app.get("/")
def root():
    return {"name": APP_TITLE, "version": APP_VERSION}

@app.get("/healthz")
def healthz():
    return {"ok": True}

@app.get("/readyz")
def readyz():
    ready = all(m is not None for m in (median_model, p10_model, p90_model))
    return {"ready": ready, "model_dir": MODEL_DIR, "expected_input_cols": EXPECTED_INPUT_COLS}

@app.get("/schema")
def get_schema():
    return schema

@app.get("/meta")
def meta():
    return model_meta or {"info": "no meta available"}

@app.post("/predict", response_model=PredictOut)
def predict(payload: PredictIn):
    _ensure_ready()
    try:
        d = payload.dict()
        if d.get("living_area") is None:
            raise HTTPException(400, detail="Missing field: living_area")
        if d.get("rooms") is None:
            raise HTTPException(400, detail="Missing field: rooms")
        row = _sanitize_payload(d)
        return _predict_row(row)
    except HTTPException:
        raise
    except Exception as e:
        log.exception("Prediction failed: %s", e)
        raise HTTPException(status_code=400, detail=str(e))
