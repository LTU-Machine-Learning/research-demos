# Luleå House Price Estimator (Powered by Booli)

This repository trains and serves a house‑price estimation model for **Luleå, Sweden**.
It ingests historical *sold* transactions from the **Booli API**, trains three LightGBM models (median, p10, p90), and exposes a **FastAPI** endpoint consumed by your Astro UI.

> **Heads‑up (Booli ToS):** You must show “Powered by Booli” + logo near any Booli‑derived output, link to the corresponding Booli page when you surface listing‑level data, and **avoid caching raw Booli data >12h** unless you have written permission. Model artifacts (pickles) are fine.

---

## 1) System overview

```
Booli /sold  ──► fetch_booli_lulea.py ──► data/booli_lulea_sold.parquet
                                        │
                                        └─► train_booli.py ──► model/
                                                              ├─ model_median.pkl   (LightGBM, median)
                                                              ├─ model_p10.pkl      (LightGBM, 10th percentile)
                                                              ├─ model_p90.pkl      (LightGBM, 90th percentile)
                                                              ├─ schema.pkl         (API input schema)
                                                              └─ model_meta.json    (training window, rows, CV MAE)

model/ ──► FastAPI (api/main.py) ──► /predict, /schema, /meta
```

**High level:**

* **Ingestion** pulls Luleå *sold* transactions with auth, pagination, and light normalization.
* **Training** filters to recent years, builds a feature pipeline, and trains 3 models.
* **Serving** loads artifacts and exposes `/predict` that returns median price and a prediction interval.

---

## 2) Data ingestion (Booli)

**Script:** `venv/fetch_booli_lulea.py` (async httpx client in `venv/booli_client.py`).

* **Endpoints used:** `GET /areas` (to find Luleå areaIds) and `GET /sold`.
* **Auth:** Add four query parameters as described by Booli: `callerId`, `time`, `unique`, `hash = sha1(callerId + time + key + unique)`.
* **Headers:** `Accept: application/vnd.booli-v2+json`, plus a helpful `User-Agent` and `Referrer`.
* **Pagination:** `limit ≤ 500`, iterate with `offset += count`, sleep a bit between pages.
* **Geography filter:** keep rows where `region.municipalityName` contains **“Luleå”**. (We also keep `namedAreas` for text signals.)
* **Output:** Parquet file `data/booli_lulea_sold.parquet` (ephemeral unless ToS exception).

### Normalized columns produced

| Column              | Type      | From Booli                                                   |
| ------------------- | --------- | ------------------------------------------------------------ |
| `price`             | int       | `soldPrice`                                                  |
| `living_area`       | float     | `livingArea`                                                 |
| `rooms`             | float     | `rooms`                                                      |
| `plot_area`         | float     | `plotArea`                                                   |
| `rent`              | float     | `rent`                                                       |
| `floor`             | float     | `floor`                                                      |
| `construction_year` | int       | `constructionYear`                                           |
| `list_price`        | int       | `listPrice`                                                  |
| `lat`               | float     | `position.latitude`                                          |
| `lon`               | float     | `position.longitude`                                         |
| `housing_type`      | str       | mapped from Swedish `objectType` → `APARTMENT`, `HOUSE`, ... |
| `municipality`      | str       | `region.municipalityName`                                    |
| `address`           | str       | `streetAddress` + `namedAreas` joined                        |
| `sold_date`         | date      | `soldDate`                                                   |
| `published`         | datetime  | `published`                                                  |
| `booli_id`, `url`   | ids/links | for QA/debug                                                 |
| `month`, `year`     | ints      | derived from `sold_date`                                     |

**Mapping (object type):** `Lägenhet→APARTMENT`, `Villa→HOUSE`, `Fritidshus→HOLIDAY_HOUSE`, `Parhus→SEMI_DETACHED`, `Radhus→ROW_HOUSE`, `Kedjehus→LINKED_HOUSE`, `Gård→FARM`, `Tomt-mark→PLOT`.

---

## 3) Training pipeline

**Script:** `venv/train_booli.py` (latest version).

### Data window

* Uses **last N years** (default **7**): keeps rows with `year ≥ (max_year - 6)`.
  Rationale: recency improves accuracy for “today‑like” predictions.

### Features

* **Numeric (`num`)**: `living_area`, `plot_area`, `rooms`, `month`, `year`, `lat`, `lon`, `construction_year`, `floor`, `rent`, `list_price`
* **Categorical (`cat`)**: `housing_type`, `municipality` (One‑Hot Encoded; unknowns ignored)
* **Text (`txt`, optional)**: `address` via **TF‑IDF** (1–2 grams). If too many empty addresses, we disable text to avoid noise.

> Missing values are **kept as NaN**; the pipeline and LightGBM handle them. We do **not** drop columns at predict time.

### Preprocessing

* `ColumnTransformer` combines: passthrough numeric, OHE categorical, TF‑IDF text.
* Sparse thresholding enabled (`sparse_threshold=0.3`) to balance density.

### Models & objectives

* **Median model:** LightGBM `LGBMRegressor(objective="regression_l1")` → MAE objective that approximates the median; typically yields robust central estimates.
* **Quantile models:** two LightGBM regressors with `objective="quantile"`, `alpha=0.10` and `alpha=0.90` to form a **prediction interval**.

**Shared hyper‑parameters (typical defaults we use):**

* `n_estimators≈1400–1500`, `learning_rate≈0.035–0.04`
* `num_leaves≈63–95`, `min_child_samples≈25–40`
* `subsample≈0.85–0.9`, `colsample_bytree≈0.9`
* `random_state=42`, `n_jobs=-1`, `verbosity=-1`

> You may see LightGBM warnings (“no further splits with positive gain”). With this dataset size and sparsity, that’s common and benign—training still converges.

### Validation

* **5‑fold K‑Fold CV** (shuffle, seed=42) on the **training set**.
* We report **CV MAE** for the median model. Example from last run:

  * Rows: **4,491** (2019–2025)
  * CV MAE: **~147 kSEK**

### Artifacts saved to `model/`

* `model_median.pkl` — scikit‑learn `Pipeline(preprocess → LightGBM)`
* `model_p10.pkl`, `model_p90.pkl` — quantile pipelines for interval bounds
* `schema.pkl` — defines **required** and **optional** inputs for the API
* `model_meta.json` — `{ timestamp, rows, year_min, year_max, mae_cv_median_sek, features_used, addr_txt_enabled }`

---

## 4) Serving (FastAPI)

**File:** `api/main.py`.

### Endpoints

* `GET /healthz` — liveness
* `GET /readyz` — readiness (checks that artifacts loaded)
* `GET /schema` — JSON schema (from `schema.pkl`) listing required/optional fields
* `GET /meta` — training metadata (from `model_meta.json`)
* `POST /predict` — returns `{ price_sek, pi_low, pi_high }`

### Request schema (Pydantic `PredictIn`)

* **Required:** `living_area: float ≥10`, `rooms: float ≥1`
* **Optional:** `plot_area`, `housing_type`, `municipality`, `address`, `month`, `year`, `lat`, `lon`, `construction_year`, `floor`, `rent`, `list_price`
* If `month`/`year` are omitted, they default to **now** (server clock).
* Text fields are sanitized to empty strings; numeric optionals stay `NaN`.

### Example requests

```bash
# apartment
curl -s -X POST $API/predict -H 'Content-Type: application/json' -d '{
  "living_area": 72, "rooms": 3, "housing_type": "APARTMENT",
  "municipality": "Luleå", "address": "Stationsgatan 25",
  "lat": 65.584, "lon": 22.157,
  "construction_year": 1972, "floor": 3, "rent": 4200, "list_price": 2395000
}'

# house
curl -s -X POST $API/predict -H 'Content-Type: application/json' -d '{
  "living_area": 135, "rooms": 5, "plot_area": 850,
  "housing_type": "HOUSE", "municipality": "Luleå",
  "address": "Hertsövägen 120", "lat": 65.605, "lon": 22.227,
  "construction_year": 1985
}'
```

### CORS & env vars

* `MODEL_DIR` — directory with artifacts (default `/app/model`)
* `ALLOW_ORIGINS` — comma‑separated list; e.g. `http://192.168.10.2:4321,http://127.0.0.1:4321`.

---

## 5) How the prediction is constructed

1. **Input row** is sanitized; all expected columns are present (missing numerics kept as NaN).
2. The **preprocessing pipeline** applies: passthrough numerics, OHE on categories, TF‑IDF on address text (if enabled).
3. The **median pipeline** predicts `price_sek`.
4. The **quantile pipelines** predict `pi_low` and `pi_high`. If low > high due to noise, we swap.

**Interpretation:**

* `price_sek` is the point estimate (robust median).
* `[pi_low, pi_high]` aims to cover ~80% of outcomes conditional on features; it is not a formal conformal interval but works well in practice.

**Feature importance:** printed after training (median model). Typical top factors: `living_area`, `lat/lon` (centrality), `year/month` (market phase/seasonality), `construction_year`, and address n‑grams (areas like *Centrum*, *Mjölkudden*).

---

## 6) Re‑training workflow

1. **Fetch:** `python venv/fetch_booli_lulea.py`
   (Obey ToS; treat parquet as ephemeral unless you have explicit permission.)
2. **Train:** `python venv/train_booli.py`
   – prints CV MAE + top features, writes artifacts + meta.
3. **Serve:** restart your API container or uvicorn process.
4. **Smoke test:** `/healthz`, `/readyz`, `/schema`, `/meta`, two `curl` predictions.

### Tunables (simple levers)

* `RECENT_YEARS` — set to 5–8 for recency vs. data size trade‑off.
* Disable text by forcing `use_txt = None` in trainer if your address coverage dips.
* Remove `list_price` from `num` if you want a pure “what‑if” model without listing info.

---

## 7) Limitations & caveats

* **Data coverage:** Booli’s final sale prices may reflect last bid in rare cases. Expect a bit of label noise.
* **Intervals:** Quantile models give practical bands but are not calibrated coverage guarantees. Consider conformal calibration later if you need guarantees.
* **Extrapolation:** Extreme inputs outside training support widen error/intervals.
* **Geography:** Lat/Lon + address n‑grams capture locality; for more precision, add engineered distances (e.g., to Storgatan or LTU).

---

## 8) Deployment notes (Swarm quick view)

* Build once on a node with the Dockerfile: `docker build -t se-house-price-api -f api/Dockerfile api/`.
* Bind‑mount `model/` read‑only into the container.
* Expose port 8080→8090 and set `ALLOW_ORIGINS` for your front host(s).
* Healthcheck an instance via `/readyz`.

Example `stack-price.yml` service:

```yaml
services:
  price-api:
    image: se-house-price-api
    ports:
      - target: 8080
        published: 8090
        protocol: tcp
        mode: host
    environment:
      MODEL_DIR: /app/model
      ALLOW_ORIGINS: "http://192.168.10.2:4321,http://127.0.0.1:4321,http://localhost:4321"
    volumes:
      - type: bind
        source: /srv/vision-hub/price-estimation/model
        target: /app/model
        read_only: true
```

---

## 9) FAQ

**Q: Do we use every optional field sent to the API?**
A: The model uses only the features it was trained with (see `/schema` → `optional`). If you send additional fields, they are ignored. If you omit an optional field, it’s treated as missing/NaN (safe).

**Q: Why include `list_price` if we’re predicting price?**
A: For active listings, `list_price` is a strong prior about the eventual sale. If you prefer a pure “what‑if” model, retrain without `list_price`.

**Q: What does the interval mean?**
A: It’s an empirical 10–90% band from quantile models given the features. It is **not** a guaranteed coverage; think of it as a practical uncertainty range.

**Q: Where do the numbers come from?**
A: 5‑fold cross‑validated **LightGBM** models on **Booli /sold** transactions for Luleå, last N years (default 7), with numeric/categorical/text features.

---

## 10) Credits & compliance

* **Data:** Booli ([https://www.booli.se](https://www.booli.se)) — show “Powered by Booli” + logo and link to their site when appropriate.
* **Models:** LightGBM via scikit‑learn pipelines.
* **Serving:** FastAPI + Uvicorn.

If you want to extend this README with diagrams or add a section on engineered geofeatures (distance to center, coastline, LTU), ping me and I’ll add code + plots.
