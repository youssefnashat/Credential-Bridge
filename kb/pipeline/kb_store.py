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

def validate_all() -> list[str]:
    """Return list of validation errors ([] == all good). Uses jsonschema if available,
    else a minimal required-key check so the pipeline still gates without the dep."""
    errs = []
    try:
        import jsonschema
        sch = _schema()
        for p in sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_")):
            try:
                jsonschema.validate(json.loads(p.read_text()), sch)
            except Exception as e:
                errs.append(f"{p.relative_to(KB_ROOT)}: {str(e).splitlines()[0]}")
    except ImportError:
        req = _schema()["required"]
        for p in sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_")):
            d = json.loads(p.read_text())
            miss = [k for k in req if k not in d]
            if miss: errs.append(f"{p.relative_to(KB_ROOT)}: missing {miss}")
    return errs

def stats() -> dict:
    rs = list(sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_")))
    return {"rulesets": len(rs), "jurisdictions": len({p.parent.name for p in rs}),
            "professions": len({p.stem for p in rs})}
