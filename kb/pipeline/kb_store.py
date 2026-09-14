"""Knowledge-base access layer. Loads per-jurisdiction rulesets, validates them against the
schema, and answers lookups. Local JSON now; the same interface can front a Bedrock Knowledge
Base or DynamoDB later without touching the agents."""
from __future__ import annotations
import json, re, sys
from functools import lru_cache
from pathlib import Path

KB_ROOT = Path(__file__).resolve().parents[1] / "store"
SCHEMA = Path(__file__).resolve().parents[1] / "schema" / "ruleset.schema.json"
_JURISDICTION = re.compile(r"^[A-Z]{2}(-[A-Z0-9]{1,3})?$")   # CA-ON, US-NY, GB, AU-NSW

def _slug(profession: str) -> str:
    return profession.lower().replace(" ", "-").replace("/", "-")

@lru_cache
def _schema() -> dict:
    return json.loads(SCHEMA.read_text())

def all_rulesets() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_"))]

def ruleset_path(profession: str, jurisdiction: str) -> Path:
    """Path for one ruleset. Refuses anything that isn't a jurisdiction key ('../../x', '/abs', ...)
    and any path that would resolve outside KB_ROOT (e.g. via a symlink)."""
    if not isinstance(jurisdiction, str) or not _JURISDICTION.fullmatch(jurisdiction):
        raise ValueError(f"invalid jurisdiction key {jurisdiction!r} (expected e.g. CA-ON, GB)")
    p = KB_ROOT / jurisdiction / f"{_slug(profession)}.json"
    if not p.resolve().is_relative_to(KB_ROOT.resolve()):
        raise ValueError(f"ruleset path escapes the KB: {p}")
    return p

def get(profession: str, jurisdiction: str) -> dict | None:
    try:
        p = ruleset_path(profession, jurisdiction)
    except ValueError:
        return None   # reference.py passes UNKNOWN:<X> / US-<TOKEN> keys for unmapped places -> fallback
    return json.loads(p.read_text()) if p.exists() else None

def jurisdictions() -> list[str]:
    return sorted({p.parent.name for p in sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_"))})

@lru_cache
def _warn_no_jsonschema() -> None:
    print("\n" + "!" * 78 + "\nWARNING: jsonschema is NOT installed -- KB validation is DEGRADED to a required-keys\n"
          "check only (types, enums, requirement fields are NOT checked). pip install jsonschema\n" + "!" * 78,
          file=sys.stderr)

def validate_ruleset(d: dict) -> list[str]:
    """Errors for ONE ruleset ([] == valid). Uses jsonschema if available, else a minimal
    required-key check so the pipeline still gates without the dep."""
    try:
        import jsonschema
    except ImportError:
        _warn_no_jsonschema()
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
    out = ruleset_path(profession, jurisdiction)   # refuses hostile keys before anything is written
    rs = {**rs, "profession": profession, "jurisdiction": jurisdiction,
          "harvest_method": "agent", "needs_review": True,
          "last_verified": None}                    # only a human verifier sets last_verified
    errs = validate_ruleset(rs)
    if errs:
        raise ValueError(f"invalid ruleset for {jurisdiction}/{profession}: {errs[0]}")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rs, indent=2))
    return out

def stats() -> dict:
    rs = list(sorted(x for x in KB_ROOT.rglob("*.json") if not x.name.startswith("_")))
    return {"rulesets": len(rs), "jurisdictions": len({p.parent.name for p in rs}),
            "professions": len({p.stem for p in rs})}
