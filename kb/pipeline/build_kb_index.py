"""Builds kb/store/_index.json — a flat catalogue of what the KB covers, for fast lookup and
for the demo to show coverage. Validates every ruleset first; refuses to write on schema errors."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from kb.pipeline import kb_store

def main():
    errs = kb_store.validate_all()
    if errs:
        print("KB VALIDATION FAILED:"); [print("  -", e) for e in errs]; sys.exit(1)
    idx = []
    for rs in kb_store.all_rulesets():
        idx.append({"profession": rs["profession"], "jurisdiction": rs["jurisdiction"],
                    "regulator": rs["regulator"], "regulated": rs.get("regulated", True),
                    "requirements": len(rs["requirements"]), "confidence": rs["confidence"],
                    "source": rs["source"], "method": rs.get("harvest_method","curated")})
    out = kb_store.KB_ROOT / "_index.json"
    out.write_text(json.dumps({"stats": kb_store.stats(), "entries": idx}, indent=2))
    print(json.dumps(kb_store.stats(), indent=2)); print(f"wrote {out}")

if __name__ == "__main__":
    main()
