import os, asyncio, math
import pandas as pd
from dateutil import parser
from booli_client import find_area_ids, iter_sold

# DISCLAIMER (ToS):
# Booli ToS limits caching/saving >12h unless you have written permission.
# If you don’t have an exception, treat the saved file as ephemeral (rotate/TTL).

# Light, robust mapping from Swedish object types to your older categories
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
    # Find the Luleå areaId(s) dynamically so we don’t hardcode
    lulea_ids = []
    async for a in find_area_ids("Luleå"):
        # Prefer Kommun (municipality) or areas under Luleå municipality
        types = [t.lower() for t in a.get("types", [])]
        if "kommun" in types or "undefined" in types or "street" in types:
            # keep—but we’ll filter again by municipality name post-hoc
            lulea_ids.append(a["booliId"])
    lulea_ids = list(dict.fromkeys(lulea_ids))  # de-dup

    # Pull last ~13 years by default (Booli data generally goes back to 2012+)
    rows = []
    async for s in iter_sold(area_ids=lulea_ids, limit=500):
        loc = s.get("location", {}) or {}
        region = loc.get("region", {}) or {}
        position = loc.get("position", {}) or {}
        address = loc.get("address", {}) or {}
        named_areas = loc.get("namedAreas", []) or []

        muni = region.get("municipalityName")
        if muni is None or "Luleå" not in str(muni):
            # If /areas gave broader hits, keep only Luleå municipality here
            continue

        street = address.get("streetAddress")
        text_addr = _join_nonempty([street, *named_areas])

        # Map/normalize
        d = {
            # target
            "price": _safe_int(s.get("soldPrice")),
            # core numerics
            "living_area": _safe_float(s.get("livingArea")),
            "rooms": _safe_float(s.get("rooms")),
            "plot_area": _safe_float(s.get("plotArea")),
            "rent": _safe_float(s.get("rent")),
            "floor": _safe_float(s.get("floor")),
            "construction_year": _safe_int(s.get("constructionYear")),
            "list_price": _safe_int(s.get("listPrice")),
            # geospatial
            "lat": _safe_float(position.get("latitude")),
            "lon": _safe_float(position.get("longitude")),
            # categories / text
            "housing_type": OBJ_MAP.get(s.get("objectType"), str(s.get("objectType") or "")),
            "municipality": muni,
            "address": text_addr,
            # dates
            "sold_date": s.get("soldDate"),
            "published": s.get("published"),
            # url (useful for QC/debug)
            "url": s.get("url"),
            "booli_id": s.get("booliId"),
        }
        rows.append(d)

    df = pd.DataFrame(rows)
    # basic cleaning
    df = df.dropna(subset=["price", "living_area", "rooms"]).copy()

    # parse dates → month/year like your old pipeline
    for col in ["sold_date", "published"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
    if "sold_date" in df.columns:
        df["month"] = df["sold_date"].dt.month
        df["year"] = df["sold_date"].dt.year
    else:
        df["month"] = pd.NaT
        df["year"]  = pd.NaT

    # parquet output (treat as ephemeral unless you have Booli’s written OK)
    os.makedirs("data", exist_ok=True)
    out = "data/booli_lulea_sold.parquet"
    df.to_parquet(out, index=False)
    print(f"Saved {len(df):,} Luleå rows to {out}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
