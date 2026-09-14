"""Harvest rules for a profession+jurisdiction into the KB, then rebuild the index.
Usage: python kb/pipeline/run_harvest.py --profession "Registered Nurse" --jurisdiction CA-ON \
         --regulator "College of Nurses of Ontario (CNO)" --url https://www.cno.org/...
Writes kb/store/<jurisdiction>/<profession-slug>.json (agent tier)."""
import argparse, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "backend"))
from kb.pipeline import kb_store

def main():
    ap = argparse.ArgumentParser()
    for a in ("profession","jurisdiction","regulator","url"): ap.add_argument(f"--{a}", required=True)
    args = ap.parse_args()
    from app.agents.harvester import harvest   # imported lazily so no AWS import at module load
    rs = harvest(args.profession, args.jurisdiction, args.regulator, args.url)
    out = kb_store.KB_ROOT / args.jurisdiction / (args.profession.lower().replace(" ","-").replace("/","-") + ".json")
    out.parent.mkdir(parents=True, exist_ok=True); out.write_text(json.dumps(rs, indent=2))
    print(f"wrote {out} (confidence={rs.get('confidence')}, needs_review={rs.get('needs_review')})")
    errs = kb_store.validate_all()
    print("KB valid" if not errs else f"KB errors: {errs}")

if __name__ == "__main__":
    main()
