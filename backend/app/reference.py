"""Grounding lookup for the reasoner. Primary source is the compliance KB (kb/store, one file per
profession x jurisdiction, schema-validated). Falls back to the compact regulators.json for any
pair not yet in the KB, so the demo never dead-ends. Both carry source URLs."""
import json, re, sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]           # repo root
sys.path.insert(0, str(ROOT))
COMPACT = Path(__file__).resolve().parents[1] / "reference" / "regulators.json"

# targetCountry name/alias -> ISO key. Only CA/US carry a subdivision; the rest are national in the KB.
_COUNTRY = {**dict.fromkeys(("canada","ca"), "CA"),
            **dict.fromkeys(("united states","united states of america","usa","us","america"), "US"),
            **dict.fromkeys(("united kingdom","uk","gb","great britain","britain","england","scotland","wales",
                             "northern ireland"), "GB"),
            **dict.fromkeys(("australia","au"), "AU"),
            **dict.fromkeys(("germany","deutschland","de"), "DE"),
            **dict.fromkeys(("ireland","republic of ireland","ie"), "IE")}
_SUB = {"ontario":"ON","british columbia":"BC","alberta":"AB","quebec":"QC","québec":"QC","manitoba":"MB",
        "saskatchewan":"SK","nova scotia":"NS","new brunswick":"NB","newfoundland and labrador":"NL",
        "prince edward island":"PE",
        "new york":"NY","california":"CA","texas":"TX","florida":"FL","illinois":"IL","washington":"WA",
        "massachusetts":"MA","new jersey":"NJ","pennsylvania":"PA"}

def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").replace(".", "")).strip().lower()

def _tok(s: str) -> str:   # filesystem-safe token for keys we can't map (never matches a KB dir by accident)
    return re.sub(r"[^A-Z0-9]+", "_", s.upper()).strip("_") or "NONE"

def _region_key(country: str, region: str) -> str:
    """Natural profile -> KB key: CA-ON / US-NY, or national GB / AU / DE / IE. An unknown country
    never defaults to US: it yields UNKNOWN:<X>, which misses KB + compact -> unknown_region."""
    c, r = _norm(country), _norm(region)
    iso = _COUNTRY.get(c) or (None if c else _COUNTRY.get(r))   # region stands in only if country is blank
    if not iso:
        return f"UNKNOWN:{_tok(c or r)}"
    if iso not in ("CA", "US"):
        return iso
    return f"{iso}-{_SUB.get(r) or _tok(r)}"

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
