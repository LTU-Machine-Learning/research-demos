import os, time, hashlib, json, random, string, asyncio
from typing import Dict, Any, Iterable, Optional
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

BOOLI_BASE = "https://api.booli.se"

def _sha1_hex(x: str) -> str:
    return hashlib.sha1(x.encode("utf-8")).hexdigest()

def _nonce(n: int = 16) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))

def _auth_params() -> Dict[str, str]:
    caller_id = os.environ["BOOLI_CALLER_ID"]
    key       = os.environ["BOOLI_KEY"]
    t         = str(int(time.time()))
    u         = _nonce(16)
    h         = _sha1_hex(caller_id + t + key + u)
    return {"callerId": caller_id, "time": t, "unique": u, "hash": h}

HEADERS = {
    "Accept": "application/vnd.booli-v2+json",
    "User-Agent": "vision-hub-houseprice/1.0 (+research; Tom B.)",
    "Referrer":   "https://vision-hub.local"
}

@retry(stop=stop_after_attempt(5), wait=wait_exponential_jitter(initial=1, max=20))
async def _get(client: httpx.AsyncClient, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
    r = await client.get(f"{BOOLI_BASE}{path}", params={**params, **_auth_params()}, headers=HEADERS, timeout=30.0)
    r.raise_for_status()
    return r.json()

async def find_area_ids(query: str) -> Iterable[Dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        data = await _get(client, "/areas", {"q": query, "limit": 25, "transactions": 1})
        for a in data.get("areas", []):
            yield a

async def iter_sold(
    area_ids: list[int] | None = None,
    bbox: Optional[str] = None,
    min_sold_date: Optional[str] = None,
    max_sold_date: Optional[str] = None,
    limit: int = 500
):
    params: Dict[str, Any] = {"limit": min(limit, 500), "offset": 0}
    if area_ids: params["areaId"] = ",".join(map(str, area_ids))
    if bbox: params["bbox"] = bbox
    if min_sold_date: params["minSoldDate"] = min_sold_date
    if max_sold_date: params["maxSoldDate"] = max_sold_date

    async with httpx.AsyncClient() as client:
        while True:
            data = await _get(client, "/sold", params)
            items = data.get("sold", [])
            for s in items:
                yield s
            got = int(data.get("count", len(items)))
            total = int(data.get("totalCount", got))
            params["offset"] += got
            if params["offset"] >= total or got == 0:
                break
            await asyncio.sleep(0.5)
