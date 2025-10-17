from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import pandas as pd, joblib, os
from fastapi.middleware.cors import CORSMiddleware
import os
from datetime import datetime

MODEL_DIR = os.environ.get("MODEL_DIR", "/app/model")

app = FastAPI(title="SE House Price API", version="0.1.0")

# Allow your UI origins
ALLOWED = os.getenv("ALLOW_ORIGINS", "http://localhost:4321,http://127.0.0.1:4321").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

median = joblib.load(os.path.join(MODEL_DIR, "model_median.pkl"))
p10    = joblib.load(os.path.join(MODEL_DIR, "model_p10.pkl"))
p90    = joblib.load(os.path.join(MODEL_DIR, "model_p90.pkl"))
schema = joblib.load(os.path.join(MODEL_DIR, "schema.pkl"))

class PredictIn(BaseModel):
    living_area: float = Field(..., ge=10)
    rooms: float = Field(..., ge=1)
    plot_area: float | None = None
    housing_type: str | None = None   # e.g., "APARTMENT", "HOUSE"
    municipality: str | None = None    # e.g., "Göteborgs kommun"
    address: str | None = None         # free text OK
    lat: float | None = None
    lon: float | None = None
    month: int | None = None
    year: int | None = None

class PredictOut(BaseModel):
    price_sek: int
    pi_low: int
    pi_high: int

@app.get("/healthz")
def healthz(): return {"ok": True}

@app.get("/schema")
def get_schema(): return schema

@app.post("/predict", response_model=PredictOut)
def predict(payload: PredictIn):
    try:
        d = payload.dict()

        # --- required numeric checks (friendlier errors than a stacktrace) ---
        if d.get("living_area") is None:
            raise HTTPException(400, detail="Missing field: living_area")
        if d.get("rooms") is None:
            raise HTTPException(400, detail="Missing field: rooms")

        # --- defaults for month/year ---
        now = datetime.now()
        if not d.get("month"): d["month"] = now.month
        if not d.get("year"):  d["year"]  = now.year

        # --- TEXT SANITIZATION: tf-idf expects strings, not None ---
        for k in ("housing_type", "municipality", "address"):
            v = d.get(k)
            d[k] = "" if v is None else str(v).strip()

        # Optional: drop Nones for other optional numeric fields
        for k in ("plot_area", "lat", "lon"):
            if d.get(k) is None:
                d.pop(k, None)

        X = pd.DataFrame([d])
        y_med = float(median.predict(X)[0])
        y_lo  = float(p10.predict(X)[0])
        y_hi  = float(p90.predict(X)[0])
        if y_lo > y_hi: y_lo, y_hi = y_hi, y_lo
        return PredictOut(price_sek=round(y_med), pi_low=round(y_lo), pi_high=round(y_hi))

    except HTTPException:
        raise
    except Exception as e:
        # Last-resort error path with readable info
        raise HTTPException(status_code=400, detail=str(e))
