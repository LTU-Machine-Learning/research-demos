import os, asyncio
import pandas as pd
from booli_client import find_area_ids, iter_sold

OBJ_MAP = {
    "Lägenhet": "APARTMENT",
    "Villa": "HOUSE",
    "Fritidshus": "HOLIDAY_HOUSE",
    "Parhus": "SEMI_DETACHED",
    "Radhus": "ROW_HOUSE",
    "Kedjehus": "LINKED_HOUSE",
    "Gård": "FARM",
    "Tomt-mark": "PLOT",
}

def _safe_int(x):
    try:
        return int(x)
    except Exception:
        return None

def _safe_float(x):
    try:
        return float(x)
    except Exception:
        return None

def _join_nonempty(parts, sep=", "):
    return sep.join([p for p in parts if p and str(p).strip()])

async def main():
    # Discover Luleå areaIds broadly; filter by municipality later
    lulea_ids = []
    async for a in find_area_ids("Luleå"):
        lulea_ids.append(a["booliId"])
    lulea_ids = list(dict.fromkeys(lulea_ids))

    rows = []
    async for s in iter_sold(area_ids=lulea_ids, limit=500):
        loc = s.get("location", {}) or {}
        region = loc.get("region", {}) or {}
        position = loc.get("position", {}) or {}
        address = loc.get("address", {}) or {}
        named_areas = loc.get("namedAreas", []) or []

        muni = region.get("municipalityName")
        if not muni or "Luleå" not in str(muni):
            continue

        street = address.get("streetAddress")
        text_addr = _join_nonempty([street, *named_areas])

        d = {
            "price": _safe_int(s.get("soldPrice")),
            "living_area": _safe_float(s.get("livingArea")),
            "rooms": _safe_float(s.get("rooms")),
            "plot_area": _safe_float(s.get("plotArea")),
            "rent": _safe_float(s.get("rent")),
            "floor": _safe_float(s.get("floor")),
            "construction_year": _safe_int(s.get("constructionYear")),
            "list_price": _safe_int(s.get("listPrice")),
            "lat": _safe_float(position.get("latitude")),
            "lon": _safe_float(position.get("longitude")),
            "housing_type": OBJ_MAP.get(s.get("objectType"), str(s.get("objectType") or "")),
            "municipality": muni,
            "address": text_addr or "",
            "sold_date": s.get("soldDate"),
            "published": s.get("published"),
            "url": s.get("url"),
            "booli_id": s.get("booliId"),
        }
        rows.append(d)

    df = pd.DataFrame(rows)
    df = df.dropna(subset=["price", "living_area", "rooms"]).copy()

    # Dates → month/year
    for col in ["sold_date", "published"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
    if "sold_date" in df.columns:
        df["month"] = df["sold_date"].dt.month
        df["year"]  = df["sold_date"].dt.year

    os.makedirs("data", exist_ok=True)
    out = "data/booli_lulea_sold.parquet"
    df.to_parquet(out, index=False)
    print(f"Saved {len(df):,} Luleå rows to {out}")

if __name__ == "__main__":
    asyncio.run(main())
