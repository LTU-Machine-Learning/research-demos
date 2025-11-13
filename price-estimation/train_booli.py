import os, json
import joblib, numpy as np, pandas as pd, lightgbm as lgb
from datetime import datetime
from sklearn.model_selection import KFold
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import mean_absolute_error

DATA = "data/booli_lulea_sold.parquet"
OUTDIR = "model"
os.makedirs(OUTDIR, exist_ok=True)

RECENT_YEARS = 7
N_SPLITS = 5
SEED = 42

df = pd.read_parquet(DATA)
df = df.dropna(subset=["price", "living_area", "rooms"]).copy()

# Ensure address exists & is string
df["address"] = df.get("address", "").fillna("").astype(str)

# Month/year from sold_date if available
if "sold_date" in df.columns:
    df["sold_date"] = pd.to_datetime(df["sold_date"], errors="coerce")
    df["year"]  = df["sold_date"].dt.year
    df["month"] = df["sold_date"].dt.month
else:
    now = datetime.now()
    df["year"]  = df.get("year", now.year)
    df["month"] = df.get("month", now.month)

# Keep recent window
max_year = int(df["year"].dropna().max())
min_keep = max_year - (RECENT_YEARS - 1)
df = df[df["year"] >= min_keep].copy()
print(f"Training on Luleå SOLD data, years >= {min_keep} (max={max_year}). Rows: {len(df):,}")

# -------------------- FEATURES --------------------
num = [
    "living_area", "plot_area", "rooms", "month", "year",
    "lat", "lon",
    "construction_year", "floor", "rent", "list_price"
]
cat = ["housing_type", "municipality"]

addr_nonempty = (df["address"].str.len() > 0).sum()
use_txt = "address" if addr_nonempty >= 100 else None

def drop_allnan(columns: list[str]) -> list[str]:
    # Keep only columns that exist and are not entirely NaN in TRAINING data
    return [c for c in columns if c in df.columns and not df[c].isna().all()]

num = drop_allnan(num)
cat = drop_allnan(cat)

transformers = []
if num: transformers.append(("num", "passthrough", num))
if cat: transformers.append(("cat", OneHotEncoder(handle_unknown="ignore"), cat))
if use_txt: transformers.append(("txt", TfidfVectorizer(max_features=6000, ngram_range=(1,2)), use_txt))

pre = ColumnTransformer(transformers, remainder="drop", sparse_threshold=0.3)
# Canonical input columns for this trained pipeline:
cols = [*num, *cat, *( [use_txt] if use_txt else [] )]

X = df[cols].copy()
y = df["price"].astype(float)

def train_lgbm(X, y, alpha=None, objective=None):
    if objective is None:
        objective = "quantile" if alpha is not None else "regression_l1"

    model = lgb.LGBMRegressor(
        objective=objective, alpha=alpha,
        n_estimators=1400, learning_rate=0.04,
        subsample=0.85, colsample_bytree=0.9,
        num_leaves=63, min_child_samples=25,
        max_depth=-1, random_state=SEED, n_jobs=-1,
        verbosity=-1, min_gain_to_split=0.0, min_sum_hessian_in_leaf=1e-3
    )
    pipe = Pipeline([("pre", pre), ("lgbm", model)])

    cv = KFold(n_splits=N_SPLITS, shuffle=True, random_state=SEED)
    preds, trues = [], []
    for tr, te in cv.split(X):
        pipe.fit(X.iloc[tr], y.iloc[tr])
        p = pipe.predict(X.iloc[te])
        preds.extend(p); trues.extend(y.iloc[te])

    mae = mean_absolute_error(trues, preds)
    pipe.fit(X, y)
    return pipe, mae

print("Training median model…")
median_pipe, mae_med = train_lgbm(X, y)
print(f"✅ Median model trained. CV MAE (last {RECENT_YEARS}y): {mae_med:,.0f} SEK")

print("Training quantile models (p10 / p90)…")
p10_pipe, _ = train_lgbm(X, y, alpha=0.10)
p90_pipe, _ = train_lgbm(X, y, alpha=0.90)

# -------------------- SAVE --------------------
joblib.dump(median_pipe, os.path.join(OUTDIR, "model_median.pkl"))
joblib.dump(p10_pipe,    os.path.join(OUTDIR, "model_p10.pkl"))
joblib.dump(p90_pipe,    os.path.join(OUTDIR, "model_p90.pkl"))

schema = {
    "required": ["living_area", "rooms"],  # keep API simple
    "optional": [c for c in [
        "plot_area","housing_type","municipality","address","month","year",
        "lat","lon","construction_year","floor","rent","list_price"
    ] if c in cols],
    "notes": f"Booli /sold Luleå; years >= {min_keep}; addr_txt={'on' if use_txt else 'off'}"
}
joblib.dump(schema, os.path.join(OUTDIR, "schema.pkl"))

# Best-effort feature importances
try:
    lgbm = median_pipe.named_steps["lgbm"]
    feat_names = median_pipe.named_steps["pre"].get_feature_names_out()
    importances = lgbm.feature_importances_
    order = np.argsort(importances)[::-1]
    print("\nTop feature importances (median):")
    for idx in order[:30]:
        print(f"{feat_names[idx]:50s} {int(importances[idx])}")
except Exception as e:
    print(f"(could not print importances: {e})")

meta = {
    "timestamp": datetime.utcnow().isoformat() + "Z",
    "rows": int(len(df)),
    "year_min": int(df["year"].min()),
    "year_max": int(df["year"].max()),
    "mae_cv_median_sek": float(mae_med),
    "features_used": cols,               # <-- canonical input list
    "addr_txt_enabled": bool(use_txt),
}
with open(os.path.join(OUTDIR, "model_meta.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=2)

print("\n✅ Models + schema + meta saved in ./model/")
