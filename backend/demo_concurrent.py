"""Fire N caseworker sessions at the live API concurrently to show simultaneous sessions.
Run the server first (./run_local.sh), then: python demo_concurrent.py
Uses only the stdlib so it runs anywhere."""
import json, time, urllib.request, concurrent.futures as cf, os

BASE = os.getenv("CREDBRIDGE_URL", "http://localhost:8000")

CASES = [
    ("case-aida",   {"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"}, "build_pathway"),
    ("case-mateus", {"name":"Mateus Silva","profession":"Registered Nurse","countryTrained":"Brazil","targetCountry":"United States","targetRegion":"New York"}, "build_pathway"),
    ("case-lena",   {"name":"Lena Novak","profession":"Registered Nurse","countryTrained":"Croatia","targetCountry":"Germany","targetRegion":"Germany"}, "build_pathway"),
    ("case-wei",    {"name":"Wei Chen","profession":"Software Engineer","countryTrained":"China","targetCountry":"Canada","targetRegion":"Ontario"}, "build_pathway"),
    ("case-omar",   {"name":"Omar Haddad","profession":"Civil Engineer","countryTrained":"Egypt","targetCountry":"Canada","targetRegion":"Ontario"}, "build_pathway"),
]

def call(session_id, profile, event):
    body = json.dumps({"profile": profile, "event": event, "currentSteps": []}).encode()
    req = urllib.request.Request(f"{BASE}/sessions/{session_id}/reason", data=body,
                                 headers={"content-type":"application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read())
    return session_id, len(d["steps"]), round((time.time()-t0)*1000), d["logEntry"]["text"][:90]

def main():
    print(f"Firing {len(CASES)} caseworker sessions concurrently at {BASE} ...\n")
    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=len(CASES)) as ex:
        futs = [ex.submit(call, *c) for c in CASES]
        for f in cf.as_completed(futs):
            sid, n, ms, log = f.result()
            print(f"  [{sid:12}] {n} steps  {ms:>6}ms  {log}...")
    print(f"\nAll {len(CASES)} sessions done in {round((time.time()-t0)*1000)}ms wall-clock.")
    print("Check GET /sessions to see them all persisted independently.")

if __name__ == "__main__":
    main()
