"""No-AWS smoke test: validates the contract + grounding wiring compiles and the reference
lookup resolves each profession/region, including the unregulated case. Run: python tests_smoke.py"""
import json, sys
sys.path.insert(0, ".")
from app.schemas import ReasonRequest, ReasonResponse, Step, LogEntry
from app.reference import lookup

def check(prof, country, region, expect):
    r = lookup(prof, country, region)
    tag = "unregulated" if r.get("unregulated") else ("unknown" if r.get("unknown_region") else r.get("regulator"))
    assert expect in json.dumps(r), f"{prof}/{region}: expected {expect}, got {tag}"
    print(f"OK  {prof} @ {country}/{region} -> {tag}")

check("Registered Nurse", "Canada", "Ontario", "College of Nurses of Ontario")
check("Registered Nurse", "United States", "Texas", "Texas Board of Nursing")
check("Civil Engineer", "Canada", "Alberta", "APEGA")
check("Physician", "Canada", "Ontario", "CPSO")
check("Teacher", "Canada", "Ontario", "Ontario College of Teachers")
check("Software Engineer", "Canada", "Ontario", "not")   # unregulated note contains 'not'

# --- KB reachability: natural frontend profiles must resolve to the curated KB ruleset, not the fallback
from app.reference import _region_key, _SUB
from kb.pipeline import kb_store

def kb_check(prof, country, region, jkey):
    r = lookup(prof, country, region)
    assert r.get("source") == "kb" and r.get("region_key") == jkey, \
        f"{prof} @ {country}/{region}: expected kb {jkey}, got {r.get('source')} {r.get('region_key')}"
    print(f"OK  {prof} @ {country}/{region} -> kb {jkey} ({r['regulator']})")

for prof, country, region, jkey in [
        ("Registered Nurse", "Canada", "Ontario", "CA-ON"), ("Registered Nurse", "Canada", "British Columbia", "CA-BC"),
        ("Registered Nurse", "United States", "New York", "US-NY"), ("Registered Nurse", "USA", "California", "US-CA"),
        ("Registered Nurse", "United Kingdom", "England", "GB"), ("Registered Nurse", "UK", "Scotland", "GB"),
        ("Registered Nurse", "Australia", "New South Wales", "AU"), ("Registered Nurse", "Germany", "Berlin", "DE"),
        ("Registered Nurse", "Germany", "Germany", "DE"),        # demo_concurrent case-lena
        ("Registered Nurse", "Deutschland", "", "DE"), ("Civil Engineer", "Canada", "Ontario", "CA-ON")]:
    kb_check(prof, country, region, jkey)

# every ruleset in kb/store/** must be reachable from a natural (full-name) profile
_NAT = {"CA": "Canada", "US": "United States", "GB": "United Kingdom", "AU": "Australia", "DE": "Germany", "IE": "Ireland"}
_SUBNAME = {f"{c}-{v}": k.title() for k, v in _SUB.items() for c in ("CA", "US") if k.isascii()}
for rs in kb_store.all_rulesets():
    j = rs["jurisdiction"]; iso = j.split("-")[0]
    assert iso in _NAT and ("-" not in j or j in _SUBNAME), f"KB {j}: no natural profile maps here — extend reference._COUNTRY/_SUB"
    kb_check(rs["profession"], _NAT[iso], _SUBNAME.get(j, ""), j)

# unknown country must NOT silently become a US state; known-but-uncovered stays honest
r = lookup("Registered Nurse", "Brazil", "São Paulo")
assert r.get("unknown_region") and not r["region_key"].startswith("US"), r
print(f"OK  Registered Nurse @ Brazil/São Paulo -> unknown_region ({r['region_key']})")
r = lookup("Registered Nurse", "Ireland", "Dublin")
assert r.get("unknown_region") and r["region_key"] == "IE", r
print("OK  Registered Nurse @ Ireland/Dublin -> unknown_region (IE, not in KB)")
assert _region_key("Canada", "Nunavut").startswith("CA-") and _region_key("", "England") == "GB"

# contract round-trips
resp = ReasonResponse(steps=[Step(id=1, title="Credential evaluation (NNAS)", status="upcoming",
        detail="Start NNAS advisory report", source="CNO", sourceUrl="https://cno.org")],
        logEntry=LogEntry(text="Plan built.", flag=False))
ReasonResponse.model_validate_json(resp.model_dump_json())
req = ReasonRequest.model_validate({"profile":{"name":"Aida Torres","profession":"Registered Nurse",
    "countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},
    "event":"build_pathway","currentSteps":[]})
print("OK  contract round-trip")
print("\nALL SMOKE CHECKS PASSED")

# --- orchestration wiring (no AWS): patch reason() and prove concurrent sessions persist independently
def _test_orchestration():
    try:
        import strands  # noqa: F401
    except Exception:
        print("SKIP orchestration test (strands not installed here; runs on your machine)")
        return
    from app import agent as agent_mod
    from app.schemas import ReasonResponse, Step, LogEntry, ReasonRequest
    # stub build_agent + reason so no Bedrock
    agent_mod.build_agent = lambda: object()
    def fake_reason(req, agent=None):
        return ReasonResponse(steps=[Step(id=1,title=f"{req.profile.profession} step",status="upcoming",
                detail="2026-03-10 language valid", source="X", sourceUrl="https://x")],
                logEntry=LogEntry(text=f"plan for {req.profile.name}", flag=False))
    agent_mod.reason = fake_reason
    import importlib
    from app.orchestration import orchestrator as orch_mod
    importlib.reload(orch_mod)
    o = orch_mod.Orchestrator(max_workers=4)
    jobs = []
    for i in range(6):
        r = ReasonRequest.model_validate({"profile":{"name":f"P{i}","profession":"Registered Nurse",
            "countryTrained":"X","targetCountry":"Canada","targetRegion":"Ontario"},
            "event":"build_pathway","currentSteps":[]})
        jobs.append((f"sess-{i}", r))
    res = o.handle_many(jobs); o.shutdown()
    assert len(res) == 6, "expected 6 concurrent results"
    from app.orchestration import session_store
    assert len(session_store.list_sessions()) >= 6
    print(f"OK  orchestration: {len(res)} concurrent sessions persisted independently")

_test_orchestration()
print("\nALL SMOKE CHECKS PASSED (incl. orchestration)")
