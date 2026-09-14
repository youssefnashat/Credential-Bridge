"""Knowledge-base access layer. Loads per-jurisdiction rulesets, validates them against the
schema, and answers lookups. Local JSON now; the same interface can front a Bedrock Knowledge
Base or DynamoDB later without touching the agents."""
from __future__ import annotations
import json
from functools import lru_cache
from pathlib import Path

KB_ROOT = Path(__file__).resolve().parents[1] / "store"
SCHEMA = Path(__file__).resolve().parents[1] / "schema" / "ruleset.schema.json"

def _slug(profession: str) -> str:
    return profession.lower().replace(" ", "-").replace("/", "-")

@lru_cache
def _schema() -> dict:
    return json.loads(SCHEMA.read_text())

def all_rulesets() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_"))]

def get(profession: str, jurisdiction: str) -> dict | None:
    p = KB_ROOT / jurisdiction / f"{_slug(profession)}.json"
    return json.loads(p.read_text()) if p.exists() else None

def jurisdictions() -> list[str]:
    return sorted({p.parent.name for p in sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_"))})

def validate_ruleset(d: dict) -> list[str]:
    """Errors for ONE ruleset ([] == valid). Uses jsonschema if available, else a minimal
    required-key check so the pipeline still gates without the dep."""
    try:
        import jsonschema
    except ImportError:
        miss = [k for k in _schema()["required"] if k not in d]
        return [f"missing {miss}"] if miss else []
    try:
        jsonschema.validate(d, _schema())
        return []
    except Exception as e:
        return [str(e).splitlines()[0]]

def validate_all() -> list[str]:
    """Return list of validation errors ([] == all good)."""
    errs = []
    for p in sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_")):
        try:
            d = json.loads(p.read_text())
        except Exception as e:
            errs.append(f"{p.relative_to(KB_ROOT)}: {e}"); continue
        errs += [f"{p.relative_to(KB_ROOT)}: {e}" for e in validate_ruleset(d)]
    return errs

def write_harvested(rs: dict, profession: str, jurisdiction: str) -> Path:
    """Agent-tier write. Pins the requested profession/jurisdiction (so the file lands where lookups
    expect it), forces the unverified flags, and validates BEFORE writing — an invalid or
    self-certified harvest never lands in the store where reference.py would serve it."""
    rs = {**rs, "profession": profession, "jurisdiction": jurisdiction,
          "harvest_method": "agent", "needs_review": True}
    errs = validate_ruleset(rs)
    if errs:
        raise ValueError(f"invalid ruleset for {jurisdiction}/{profession}: {errs[0]}")
    out = KB_ROOT / jurisdiction / f"{_slug(profession)}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rs, indent=2))
    return out

def stats() -> dict:
    rs = list(sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_")))
    return {"rulesets": len(rs), "jurisdictions": len({p.parent.name for p in rs}),
            "professions": len({p.stem for p in rs})}
