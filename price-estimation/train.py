import os
import joblib
import numpy as np
import pandas as pd
import lightgbm as lgb
from datetime import datetime
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import mean_absolute_error

# === CONFIG ==================================================================
DATA = "data/SwedenHousingPrices.csv"   
OUTDIR = "model"
os.makedirs(OUTDIR, exist_ok=True)

# === LOAD DATA ===============================================================
df = pd.read_csv(DATA)

df = df.rename(columns={
    "asking_price_sek": "price",
    "living_area_sqm": "living_area",
    "land_area_sqm": "plot_area",
    "number_rooms": "rooms",
    "typology": "housing_type",
    "date_published": "date",
    "location": "municipality",
    "coordenates": "coords",   # dataset uses this misspelling
    "address": "address"
})

# Split "lat,lon" string into numeric columns
lat, lon = [], []
for c in df["coords"]:
    try:
        a, b = c.split(",")
        lat.append(float(a))
        lon.append(float(b))
    except Exception:
        lat.append(np.nan); lon.append(np.nan)
df["lat"], df["lon"] = lat, lon

# Parse date and keep usable rows
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df = df.dropna(subset=["price", "living_area", "rooms"]).copy()

# ****** IMPORTANT: NO REGIONAL FILTER — train on ALL SWEDEN ******
print(f"Training on ALL Sweden: {len(df)} rows")

# Basic feature engineering
df["month"] = df["date"].dt.month
df["year"]  = df["date"].dt.year
df["sqm_price"] = df["price"] / df["living_area"]

# Ensure text column has no NaN for TfidfVectorizer
if "address" in df.columns:
    df["address"] = df["address"].fillna("")  # <- critical

# === FEATURES ================================================================
num = ["living_area", "plot_area", "rooms", "month", "year", "lat", "lon"]
cat = ["housing_type", "municipality"]

# Use address as simple text feature if present; else disable text branch
txt = "address" if "address" in df.columns else None

transformers = []
if num:
    transformers.append(("num", "passthrough", num))
if cat:
    transformers.append(("cat", OneHotEncoder(handle_unknown="ignore"), cat))
if txt:
    transformers.append(("txt", TfidfVectorizer(max_features=3000, ngram_range=(1,2)), txt))

pre = ColumnTransformer(transformers, remainder="drop", sparse_threshold=0.3)

cols = [*num, *cat, *( [txt] if txt else [] )]
X = df[cols]
y = df["price"].astype(float)

# === MODEL ==================================================================
def train_lightgbm(X, y, alpha=None):
    model = lgb.LGBMRegressor(
        objective="quantile" if alpha is not None else "regression",
        alpha=alpha,
        n_estimators=800,
        learning_rate=0.03,
        subsample=0.9,
        colsample_bytree=0.9,
        num_leaves=63,
        random_state=42
    )
    pipe = Pipeline([("pre", pre), ("lgbm", model)])
    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    preds, trues = [], []
    for tr, te in cv.split(X):
        pipe.fit(X.iloc[tr], y.iloc[tr])
        p = pipe.predict(X.iloc[te])
        preds.extend(p); trues.extend(y.iloc[te])
    mae = mean_absolute_error(trues, preds)
    pipe.fit(X, y)
    return pipe, mae

print("Training median model...")
median_pipe, mae = train_lightgbm(X, y)
print(f"✅ Median model trained. MAE: {mae:,.0f} SEK")

print("Training quantile models for 10th and 90th percentiles...")
p10_pipe, _ = train_lightgbm(X, y, alpha=0.1)
p90_pipe, _ = train_lightgbm(X, y, alpha=0.9)

# Save
joblib.dump(median_pipe, os.path.join(OUTDIR, "model_median.pkl"))
joblib.dump(p10_pipe, os.path.join(OUTDIR, "model_p10.pkl"))
joblib.dump(p90_pipe, os.path.join(OUTDIR, "model_p90.pkl"))

schema = {
    "required": ["living_area", "rooms"],
    "optional": ["plot_area","housing_type","municipality","address","month","year"],
    "notes": "Model trained on SwedenHousingPrices.csv (subset Luleå if available)"
}
joblib.dump(schema, os.path.join(OUTDIR, "schema.pkl"))
print("✅ Models saved in ./model/")
