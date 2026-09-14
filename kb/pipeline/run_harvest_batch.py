"""Unattended KB expansion: harvest every entry in kb/sources/harvest_queue.jsonl into the KB,
skipping pairs already present, then rebuild+validate the index. Needs AWS (Bedrock).
Usage: python kb/pipeline/run_harvest_batch.py [--limit N] [--force]"""
import argparse, json, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "backend"))
from kb.pipeline import kb_store

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=100); ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    from app.agents.harvester import build_harvester, harvest
    q = [json.loads(l) for l in (ROOT/"kb"/"sources"/"harvest_queue.jsonl").read_text().splitlines() if l.strip()]
    agent = build_harvester(); done = tried = 0
    for item in q:
        if tried >= a.limit: break              # --limit counts harvest attempts, not queue rows
        prof, jur = item["profession"], item["jurisdiction"]
        if kb_store.get(prof, jur) and not a.force:
            print(f"skip {jur}/{prof} (already in KB)"); continue
        tried += 1
        try:
            rs = harvest(prof, jur, item["regulator"], item["url"], agent=agent)
            kb_store.write_harvested(rs, prof, jur)   # validates before writing; forces needs_review
            print(f"harvested {jur}/{prof} conf={rs.get('confidence')} review=True")
            done += 1; time.sleep(1)
        except Exception as e:
            print(f"FAILED {jur}/{prof}: {e}")
    errs = kb_store.validate_all()
    print(f"\n{done} harvested. " + ("KB valid." if not errs else f"errors: {errs}"))
    if not errs:
        import kb.pipeline.build_kb_index as b; b.main()

if __name__ == "__main__":
    main()
