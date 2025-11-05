# main.py
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
APP_VERSION = "1.1.0"

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
ALLOWED = os.getenv(
    "ALLOW_ORIGINS",
    "http://localhost:4321,http://127.0.0.1:4321,http://192.168.10.2:4321",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# Models & schema (loaded at import so uvicorn workers share the state)
# ------------------------------------------------------------------------------
def _load_artifact(path: str):
    p = os.path.join(MODEL_DIR, path)
    if not os.path.exists(p):
        raise FileNotFoundError(f"Missing artifact: {p}")
    return joblib.load(p)

try:
    median_model = _load_artifact("model_median.pkl")
    p10_model = _load_artifact("model_p10.pkl")
    p90_model = _load_artifact("model_p90.pkl")
    schema: Dict[str, Any] = _load_artifact("schema.pkl")
    log.info("Models & schema loaded from %s", MODEL_DIR)
except Exception as e:
    # Defer failing hard until /readyz or /predict is called
    log.exception("Failed loading artifacts: %s", e)
    median_model = p10_model = p90_model = None  # type: ignore
    schema = {"required": ["living_area", "rooms"], "optional": []}

REQUIRED: List[str] = list(schema.get("required", ["living_area", "rooms"]))
OPTIONAL: List[str] = list(schema.get("optional", []))
ALL_FEATURES: List[str] = [*REQUIRED, *OPTIONAL]

# Text fields we sanitize to non-None strings
TEXT_FIELDS = ("housing_type", "municipality", "address")

# ------------------------------------------------------------------------------
# Pydantic models
# ------------------------------------------------------------------------------
class PredictIn(BaseModel):
    # required
    living_area: float = Field(..., ge=10)
    rooms: float = Field(..., ge=1)

    # optional (kept as None -> NaN; we do NOT drop missing cols)
    plot_area: Optional[float] = None
    housing_type: Optional[str] = None    # APARTMENT, HOUSE, ...
    municipality: Optional[str] = None    # e.g. "Luleå"
    address: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    month: Optional[int] = None
    year: Optional[int] = None

    # Booli-enriched fields
    construction_year: Optional[int] = None
    floor: Optional[float] = None
    rent: Optional[float] = None
    list_price: Optional[int] = None

    class Config:
        extra = "ignore"   # ignore unexpected keys instead of 422


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
    # Defaults for month/year
    now = datetime.now()
    if not d.get("month"):
        d["month"] = now.month
    if not d.get("year"):
        d["year"] = now.year

    # Text sanitization: tf-idf expects strings, not None
    for k in TEXT_FIELDS:
        v = d.get(k)
        d[k] = "" if v is None else str(v).strip()

    # Ensure all expected columns exist; DO NOT drop numeric Nones
    for col in ALL_FEATURES:
        d.setdefault(col, None)

    return d

def _predict_row(row: Dict[str, Any]) -> PredictOut:
    # Columns aligned and order fixed for pandas DataFrame
    X = pd.DataFrame([row], columns=ALL_FEATURES)

    # Inference
    y_med = float(median_model.predict(X)[0])  # type: ignore[attr-defined]
    y_lo = float(p10_model.predict(X)[0])      # type: ignore[attr-defined]
    y_hi = float(p90_model.predict(X)[0])      # type: ignore[attr-defined]

    # Guardrail: ensure pi_low <= pi_high
    if y_lo > y_hi:
        y_lo, y_hi = y_hi, y_lo

    return PredictOut(
        price_sek=int(round(y_med)),
        pi_low=int(round(y_lo)),
        pi_high=int(round(y_hi)),
    )

def _load_json(path: str) -> dict:
    p = os.path.join(MODEL_DIR, path)
    return json.load(open(p, "r", encoding="utf-8")) if os.path.exists(p) else {}

model_meta = _load_json("model_meta.json")


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
    return {"ready": ready, "model_dir": MODEL_DIR}

@app.get("/schema")
def get_schema():
    # Return the training-time schema (as saved by train_booli.py)
    return schema

@app.post("/predict", response_model=PredictOut)
def predict(payload: PredictIn):
    _ensure_ready()
    try:
        d = payload.dict()
        # Friendlier checks for required numerics
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
    
@app.get("/meta")
def meta():
    return model_meta or {"info": "no meta available"}