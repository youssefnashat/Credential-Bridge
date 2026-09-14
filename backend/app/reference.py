"""Grounding lookup for the reasoner. Primary source is the compliance KB (kb/store, one file per
profession x jurisdiction, schema-validated). Falls back to the compact regulators.json for any
pair not yet in the KB, so the demo never dead-ends. Both carry source URLs."""
import json, sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]           # repo root
sys.path.insert(0, str(ROOT))
COMPACT = Path(__file__).resolve().parents[1] / "reference" / "regulators.json"

def _region_key(country: str, region: str) -> str:
    c = "CA" if country.strip().lower().startswith("can") else "US"
    r = region.strip().lower()
    m = {"ontario":"ON","british columbia":"BC","alberta":"AB","new york":"NY","california":"CA","texas":"TX",
         "united kingdom":"GB","australia":"AU"}
    # allow direct GB/AU/EU targets too
    if r in ("united kingdom","uk","england"): return "GB"
    if r in ("australia",): return "AU"
    return f"{c}-{m.get(r, region.strip().upper()[:2])}"

@lru_cache
def _compact() -> dict:
    return json.loads(COMPACT.read_text())

def _from_kb(profession: str, jkey: str) -> dict | None:
    try:
        from kb.pipeline import kb_store
    except Exception:
        return None
    rs = kb_store.get(profession, jkey)
    if not rs:
        return None
    # shape KB ruleset into the compact grounding dict the agent prompt expects, keeping richness
    langs = [r["name"] for r in rs["requirements"] if r["kind"] == "language"]
    exams = [r["name"] for r in rs["requirements"] if r["kind"] == "exam"]
    return {
        "profession": profession, "region_key": jkey, "regulator": rs["regulator"],
        "gateway": rs.get("gateway"), "url": rs["source"], "regulated": rs.get("regulated", True),
        "language": langs, "exam": " + ".join(exams) if exams else None,
        "requirements": rs["requirements"],  # full ordered rules with valid_at + depends_on + validity
        "source": "kb", "confidence": rs.get("confidence"), "notes": rs.get("notes"),
    }

def lookup(profession: str, country: str, region: str) -> dict:
    jkey = _region_key(country, region)
    kb = _from_kb(profession, jkey)
    if kb:
        return kb
    # fallback: compact table
    data = _compact()
    prof = data.get(profession, {})
    if prof.get("_unregulated"):
        return {"unregulated": True, "note": prof["note"], "profession": profession, "source": "compact"}
    entry = prof.get(jkey)
    if not entry:
        return {"unknown_region": True, "profession": profession, "region_key": jkey,
                "available": list(prof.keys()), "source": "compact"}
    return {"profession": profession, "region_key": jkey, "source": "compact", **entry}
