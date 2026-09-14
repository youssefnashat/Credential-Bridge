"""T16 eval harness: fire the scenario set at POST /reason and score contract validity, KB grounding,
and event semantics. No AWS itself — it only talks HTTP to whatever --base-url serves.

  backend/.venv/bin/python backend/eval_run.py                       # live: http://localhost:8000
  backend/.venv/bin/python backend/eval_run.py --base-url http://host:8000 --out-dir docs/evidence
  backend/.venv/bin/python backend/eval_run.py --self-test           # offline: canned good + bad stubs

Writes <out-dir>/eval-<UTC>.json (full requests, responses, scores) and prints one README-ready line last.
Exit 0 only if every scenario passes every check."""
from __future__ import annotations
import argparse, datetime as dt, json, re, sys, tempfile, time
from pathlib import Path
from typing import Callable, get_args
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "backend"), str(ROOT)]
from app.schemas import ReasonResponse, StepStatus  # noqa: E402
from app.reference import lookup  # noqa: E402  (the same resolver the agent grounds on)

ALLOWED_STATUS = set(get_args(StepStatus))
KB_GLOBS = [(ROOT / "kb" / "store", "**/*.json"), (ROOT / "backend" / "reference", "regulators.json")]

# profiles reused from backend/demo_concurrent.py so eval, demo and README tell the same story
AIDA = {"name": "Aida Torres", "profession": "Registered Nurse", "countryTrained": "Philippines",
        "targetCountry": "Canada", "targetRegion": "Ontario"}
WEI = {"name": "Wei Chen", "profession": "Software Engineer", "countryTrained": "China",
       "targetCountry": "Canada", "targetRegion": "Ontario"}
LENA = {"name": "Lena Novak", "profession": "Registered Nurse", "countryTrained": "Croatia",
        "targetCountry": "Germany", "targetRegion": "Germany"}
MATEUS = {"name": "Mateus Silva", "profession": "Registered Nurse", "countryTrained": "Brazil",
          "targetCountry": "United States", "targetRegion": "New York"}

# (id, profile, event, take currentSteps from scenario id, semantic check)
SCENARIOS = [
    ("rn-on-build", AIDA, "build_pathway", None, "build"),
    ("rn-on-delay", AIDA, "simulate_delay", "rn-on-build", "delay"),
    ("rn-on-rejection", AIDA, "simulate_rejection", "rn-on-build", "rejection"),
    ("rn-on-reset", AIDA, "reset", "rn-on-rejection", "reset"),
    ("swe-on-build", WEI, "build_pathway", None, "unregulated"),
    ("rn-de-build", LENA, "build_pathway", None, "build"),
    ("rn-ny-build", MATEUS, "build_pathway", None, "build"),
]

URL_RE = re.compile(r"https?://[^\s\"'<>]+")
ISO_DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
LICENSING_STEP_RE = re.compile(r"\b(exam|examination|licen[cs](e|ed|ing|ure))\b", re.I)
NEGATION_RE = re.compile(r"\b(no|not|without)\b", re.I)
UNREGULATED_RE = re.compile(r"\b(unregulated|non-?regulated|unlicen[cs]ed|not\s+(a\s+)?(licen[cs]ed|regulated)"
                            r"|no\s+licen[cs]e|not\s+require\s+(a\s+)?licen[cs]e|does\s+not\s+need\s+(a\s+)?licen[cs]e)",
                            re.I)


def norm_url(u: str) -> str:
    """Compare URLs modulo scheme/host case, trailing slash, fragment and trailing punctuation."""
    s = urlsplit(u.strip().rstrip(".,;:)"))
    q = f"?{s.query}" if s.query else ""
    return f"{s.scheme.lower()}://{s.netloc.lower()}{s.path.rstrip('/')}{q}"


def _urls_in(v) -> set[str]:
    if isinstance(v, str):
        return {norm_url(m) for m in URL_RE.findall(v)}
    items = v.values() if isinstance(v, dict) else v if isinstance(v, list) else []
    return set().union(*(_urls_in(x) for x in items))


def kb_url_set() -> set[str]:
    """Every URL anywhere in the curated KB + regulators.json. A citation outside this set is fabricated."""
    return set().union(*(_urls_in(json.loads(p.read_text()))
                         for base, pattern in KB_GLOBS for p in sorted(base.glob(pattern))))


def target_ruleset(profile: dict) -> tuple[set[str], str]:
    """URLs in the target's own ruleset (reference.lookup) + its regulators.json entry, and the label for a KB URL
    outside it. A citation in the set proves the URL belongs to the target's curated ruleset — not that the step's
    content is correct. When there is no regulated ruleset for this profession here (e.g. the unregulated SWE entry
    has no URLs), a cited KB URL is labelled "off-ruleset" rather than "off-jurisdiction"; the check is the same."""
    r = lookup(profile["profession"], profile["targetCountry"], profile["targetRegion"])
    compact = json.loads((ROOT / "backend" / "reference" / "regulators.json").read_text())
    urls = _urls_in(r) | _urls_in(compact.get(profile["profession"], {}).get(r.get("region_key") or "", {}))
    own = bool(urls) and r.get("profession") == profile["profession"] \
        and not (r.get("unregulated") or r.get("unknown_region"))
    return urls, "off_jurisdiction" if own else "off_ruleset"


# ---------------------------------------------------------------- scoring

def score_contract(status: int | None, body) -> dict:
    problems = []
    if status != 200:
        problems.append(f"http status {status}")
    if not isinstance(body, dict):
        problems.append("body is not a JSON object")
        return {"ok": False, "problems": problems}
    try:
        ReasonResponse.model_validate(body)
    except Exception as e:  # pydantic ValidationError; keep the first few lines readable
        problems.append("schema: " + " | ".join(str(e).splitlines()[:6]))
    steps = body.get("steps") if isinstance(body.get("steps"), list) else []
    if not steps:
        problems.append("no steps")
    ids = [s.get("id") for s in steps if isinstance(s, dict)]
    if ids != list(range(1, len(steps) + 1)):
        problems.append(f"ids not 1..n contiguous: {ids}")
    bad = sorted({str(s.get("status")) for s in steps if isinstance(s, dict)} - ALLOWED_STATUS)
    if bad:
        problems.append(f"statuses outside allowed set: {bad}")
    return {"ok": not problems, "problems": problems}


OFF_LABEL = {"off_jurisdiction": "off-jurisdiction", "off_ruleset": "off-ruleset", "off_kb": "off-KB"}


def _classify(u, kb_urls: set[str], jur_urls: set[str], off_label: str) -> str:
    if not u:
        return "null"
    if not isinstance(u, str):
        return "off_kb"
    n = norm_url(u)
    return "sourced" if n in jur_urls else off_label if n in kb_urls else "off_kb"


def score_grounding(body, kb_urls: set[str], jur_urls: set[str], off_label: str) -> dict:
    """Per cited URL: sourced = in the target's own ruleset; off_jurisdiction / off_ruleset = in the KB but not the
    target's ruleset (label from target_ruleset); off_kb = nowhere in the KB (fabricated); null = uncited.
    regulatorUrl is graded the same way (null allowed) but kept out of the step counts."""
    b = body if isinstance(body, dict) else {}
    steps = b["steps"] if isinstance(b.get("steps"), list) else []
    g = {"steps": 0, "sourced": 0, "off_jurisdiction": 0, "off_ruleset": 0, "off_kb": 0, "null": 0, "bad_urls": []}
    for s in steps:
        if not isinstance(s, dict):
            continue
        g["steps"] += 1
        k = _classify(s.get("sourceUrl"), kb_urls, jur_urls, off_label)
        g[k] += 1
        if k in OFF_LABEL:
            g["bad_urls"].append(f"{OFF_LABEL[k]} sourceUrl {s['sourceUrl']}")
    g["regulator_url"] = _classify(b.get("regulatorUrl"), kb_urls, jur_urls, off_label)
    if g["regulator_url"] in OFF_LABEL:
        g["bad_urls"].append(f"{OFF_LABEL[g['regulator_url']]} regulatorUrl {b['regulatorUrl']}")
    g["ok"] = not g["bad_urls"]
    return g


def _titles(steps) -> set[str]:
    return {str(s.get("title", "")).strip().lower() for s in steps or [] if isinstance(s, dict)}


def score_semantics(kind: str, body, prior_steps, contract_ok: bool) -> dict:
    if not contract_ok:
        return {"ok": False, "checks": {}, "problems": ["contract invalid; semantics not scorable"]}
    steps, log = body["steps"], body["logEntry"]
    flag, text = bool(log.get("flag", False)), str(log.get("text", ""))
    c: dict[str, bool] = {}
    if kind in ("build", "reset", "unregulated"):
        c["flag_false"] = flag is False
    if kind == "delay":
        c["had_prior_steps"] = bool(prior_steps)  # a re-plan needs a plan: no upstream steps, no credit
        c["flag_true"] = flag is True
        c["has_at_risk"] = any(s.get("status") == "at-risk" for s in steps)
        dates = []
        for d in ISO_DATE_RE.findall(text):
            try:
                dt.date.fromisoformat(d); dates.append(d)
            except ValueError:
                pass
        c["log_has_iso_date"] = bool(dates)
    if kind == "rejection":
        c["flag_true"] = flag is True
        c["had_prior_steps"] = bool(prior_steps)
        c["remediation_step"] = bool(prior_steps) and (
            len(steps) > len(prior_steps) or bool(_titles(steps) - _titles(prior_steps)))
    if kind == "unregulated":
        c["2_to_4_steps"] = 2 <= len(steps) <= 4
        c["no_exam_or_licence_step"] = not any(
            LICENSING_STEP_RE.search(s.get("title", "")) and not NEGATION_RE.search(s.get("title", ""))
            for s in steps)
        c["log_says_unregulated"] = bool(UNREGULATED_RE.search(text))
        c["no_regulator"] = body.get("regulator") in (None, "")
        c["no_regulator_url"] = body.get("regulatorUrl") in (None, "")
    return {"ok": all(c.values()), "checks": c, "problems": [k for k, v in c.items() if not v]}


# ---------------------------------------------------------------- run

Poster = Callable[[str, dict], tuple]  # (url, json) -> (status_code | None, body_json_or_text)


def http_post(timeout: float) -> Poster:
    import requests
    def post(url, payload):
        try:
            r = requests.post(url, json=payload, timeout=timeout)
        except requests.RequestException as e:
            return None, f"{type(e).__name__}: {e}"
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, r.text[:2000]
    return post


def run(base_url: str, post: Poster, out_dir: Path) -> tuple[dict, Path]:
    kb_urls = kb_url_set()
    results, by_id = [], {}
    for sid, profile, event, steps_from, kind in SCENARIOS:
        upstream = by_id.get(steps_from) if steps_from else None
        prior = (upstream["response"].get("steps") or []) if upstream and upstream["scores"]["contract"]["ok"] else []
        req = {"profile": profile, "event": event, "currentSteps": prior}
        t0 = time.time()
        status, body = post(base_url.rstrip("/") + "/reason", req)
        ms = round((time.time() - t0) * 1000)
        contract = score_contract(status, body)
        jur_urls, off_label = target_ruleset(profile)
        scores = {"contract": contract, "grounding": score_grounding(body, kb_urls, jur_urls, off_label),
                  "semantics": score_semantics(kind, body, prior, contract["ok"])}
        scores["grounding"]["target_ruleset_url_count"] = len(jur_urls)
        no_upstream = bool(steps_from) and not prior
        if no_upstream:
            scores["note"] = f"upstream {steps_from} invalid; sent empty currentSteps"
        rec = {"id": sid, "event": event, "check": kind, "request": req, "http_status": status,
               "elapsed_ms": ms, "response": body, "scores": scores,
               "no_upstream": no_upstream,
               # a sourceUrl/regulatorUrl outside the KB is fabricated, one outside the target's ruleset is
               # mis-grounded: both fail the scenario (loss-guard #2); null is honest and only counts as uncited
               "passed": contract["ok"] and scores["semantics"]["ok"] and scores["grounding"]["ok"]}
        results.append(rec); by_id[sid] = rec
        g = scores["grounding"]
        why = "; ".join(([scores["note"]] if no_upstream else []) + contract["problems"]
                        + scores["semantics"]["problems"] + g["bad_urls"]) or "ok"
        print(f"{'PASS' if rec['passed'] else 'FAIL'}  {sid:<16} {event:<18} {ms:>6}ms  "
              f"sourced {g['sourced']}/{g['steps']} (off-jur {g['off_jurisdiction']}, off-rs {g['off_ruleset']}, "
              f"off-KB {g['off_kb']}, null {g['null']}; regulatorUrl {g['regulator_url']})  {why}")

    n = len(results)
    passed = sum(r["passed"] for r in results)
    valid = sum(r["scores"]["contract"]["ok"] for r in results)
    no_up = sum(r["no_upstream"] for r in results)
    V = [r for r in results if r["scores"]["contract"]["ok"]]  # grounding totals: contract-valid responses only
    G = lambda k: sum(r["scores"]["grounding"][k] for r in V)  # noqa: E731
    steps, sourced, off_jur, off_rs, off_kb, null = (
        G(k) for k in ("steps", "sourced", "off_jurisdiction", "off_ruleset", "off_kb", "null"))
    reg_bad = sum(r["scores"]["grounding"]["regulator_url"] in OFF_LABEL for r in V)
    judged = [r for r in results if r["check"] in ("delay", "rejection", "unregulated")]
    flagged = [r for r in results if r["check"] in ("build", "reset")]
    j_ok = sum(r["scores"]["semantics"]["ok"] for r in judged)
    f_ok = sum(r["scores"]["semantics"]["ok"] for r in flagged)
    pct = f"{round(100 * sourced / steps)}%" if steps else "n/a"
    cited = steps - null
    line = (f"{passed}/{n} scenarios passed all checks · {valid}/{n} contract-valid · sourced {pct} "
            f"({sourced}/{steps} steps in contract-valid responses cite a URL from the target jurisdiction's curated "
            f"ruleset; {off_jur} off-jurisdiction, {off_rs} off-ruleset, {off_kb} off-KB, {null} uncited) · "
            f"delay/rejection/unregulated judgments {j_ok}/{len(judged)} · build/reset flag=false {f_ok}/{len(flagged)}"
            + (f" · {reg_bad} regulatorUrl outside the target's ruleset" if reg_bad else "")
            + (f" · {no_up} dependents ran without upstream steps" if no_up else ""))
    publish = "do not publish this as an accuracy number"
    warning = (f"WARNING: no steps returned by contract-valid responses; {publish}" if not steps else
               f"WARNING: only {pct} of steps cite a URL from the target jurisdiction's ruleset (<50%); {publish}"
               if sourced / steps < 0.5 else None)
    totals = {"scenarios": n, "passed": passed, "valid": valid, "steps": steps, "sourced": sourced,
              "off_jurisdiction": off_jur, "off_ruleset": off_rs, "off_kb": off_kb, "null": null,
              "regulator_url_bad": reg_bad, "dependents_without_upstream": no_up,
              "sourced_rate_all_steps": round(sourced / steps, 4) if steps else None,
              "sourced_rate_cited_steps": round(sourced / cited, 4) if cited else None,
              "judgments_ok": j_ok, "judgments": len(judged), "flag_checks_ok": f_ok, "flag_checks": len(flagged)}
    ts = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    report = {"generated_at": ts, "base_url": base_url, "kb_url_count": len(kb_urls), "summary_line": line, "warning": warning,
              "all_passed": all(r["passed"] for r in results), "totals": totals, "scenarios": results}
    out_dir.mkdir(parents=True, exist_ok=True)
    path, k = out_dir / f"eval-{ts}.json", 1
    while path.exists():  # two runs in the same second must not overwrite each other's evidence
        path, k = out_dir / f"eval-{ts}-{k}.json", k + 1
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    return report, path


# ---------------------------------------------------------------- offline stubs (for --self-test)
# Canned responders built from kb/store at runtime, so no regulator/URL is hardcoded here.

def _ruleset(profile: dict) -> dict | None:
    for p in (ROOT / "kb" / "store").glob("*/*.json"):
        rs = json.loads(p.read_text())
        if rs.get("profession") == profile["profession"] and rs.get("country") == profile["targetCountry"] \
                and rs.get("region_name") in (profile["targetRegion"], profile["targetCountry"]):
            return rs
    return None


def _renumber(steps):
    return [{**s, "id": i} for i, s in enumerate(steps, 1)]


def stub_good(req: dict) -> dict:
    prof, event, cur = req["profile"], req["event"], [dict(s) for s in req.get("currentSteps") or []]
    if prof["profession"] == "Software Engineer":
        steps = [{"id": i, "title": t, "status": "upcoming", "detail": t, "source": None, "sourceUrl": None}
                 for i, t in enumerate(["Confirm work authorization route", "Credential assessment for immigration",
                                        "Job search"], 1)]
        return {"steps": steps, "logEntry": {"flag": False, "text": f"Software engineering is not a regulated "
                f"profession in {prof['targetRegion']}; no licence is required to practise."}}
    rs = _ruleset(prof)
    if event == "simulate_delay" and cur:
        cur[min(1, len(cur) - 1)]["status"] = "at-risk"
        return {"steps": cur, "logEntry": {"flag": True, "text": "Language result expires 2026-11-02, before the "
                                           "projected registration decision on 2027-01-15."}}
    if event == "simulate_rejection" and cur:
        cur[0]["status"] = "at-risk"
        fix = {**cur[0], "title": "Remediation: resubmit rejected documents", "status": "in-progress"}
        return {"steps": _renumber(cur[:1] + [fix] + cur[1:]),
                "logEntry": {"flag": True, "text": "Step 1 was rejected; remediation inserted, dependents blocked."}}
    steps = [{"id": r["order"], "title": r["name"], "status": "upcoming", "detail": r["detail"],
              "source": r.get("body"), "sourceUrl": r.get("source")} for r in rs["requirements"]]
    return {"steps": _renumber(steps), "regulator": rs["regulator"], "regulatorUrl": rs["source"],
            "logEntry": {"flag": False, "text": f"Pathway built from the {rs['jurisdiction']} ruleset."}}


def stub_bad(req: dict) -> dict:
    """One targeted defect per scenario, so each check is proven to fire. The RN-Ontario build stays
    contract-valid so delay/rejection receive real currentSteps and are judged on their own defect."""
    r, prof, ev = stub_good(req), req["profile"], req["event"]
    region = prof["targetRegion"]
    if prof["profession"] == "Software Engineer":                       # templated licensing path, citing a
        civil = _ruleset({**WEI, "profession": "Civil Engineer"})       # KB URL from another profession's ruleset
        r["steps"] = _renumber(r["steps"] + [{**r["steps"][0], "title": "Licensing exam"}] * 3)
        r["steps"][0]["sourceUrl"] = civil["source"]
        r["logEntry"]["text"] = "Pathway built."
    elif ev == "build_pathway" and region == "Ontario":                 # build must not flag
        r["logEntry"]["flag"] = True
    elif ev == "simulate_delay":                                        # no flag, no at-risk, no date
        r["steps"] = [{**s, "status": "upcoming"} for s in r["steps"]]
        r["logEntry"] = {"flag": False, "text": "Timeline may slip."}
    elif ev == "simulate_rejection":                                    # echo steps, no remediation
        r = {"steps": req["currentSteps"], "logEntry": {"flag": True, "text": "Rejected."}}
    elif ev == "reset":                                                 # ids 1,3,4,... (gap)
        r["steps"] = [{**s, "id": s["id"] + (s["id"] > 1)} for s in r["steps"]]
    elif region == "Germany":                                           # fabricated source URL
        r["steps"][0]["sourceUrl"] = "https://example.invalid/fabricated-regulator"
    elif region == "New York":                                          # cites Ontario's ruleset
        on = _ruleset(AIDA)["requirements"]
        r["steps"] = [{**s, "sourceUrl": on[i % len(on)]["source"]} for i, s in enumerate(r["steps"])]
    return r


def stub_bad_chain(req: dict) -> dict:
    """Second bad run: the RN-Ontario build breaks the status enum, so its dependents get no upstream steps and the
    delay still claims a re-plan (only had_prior_steps catches it); SWE names a regulator (only no_regulator)."""
    r, prof, ev = stub_good(req), req["profile"], req["event"]
    if prof["profession"] == "Software Engineer":                       # unregulated path naming a regulator
        r["regulator"] = _ruleset({**WEI, "profession": "Civil Engineer"})["regulator"]
    elif ev == "build_pathway" and prof["targetRegion"] == "Ontario":   # status outside the enum
        r["steps"][0]["status"] = "done"
    elif ev == "simulate_delay" and not req.get("currentSteps"):        # re-plans a pathway it never received
        r["steps"][1]["status"] = "at-risk"
        r["logEntry"] = {"flag": True, "text": "Language result expires 2026-11-02, before the registration decision."}
    elif prof["targetCountry"] == "Germany":                            # invented regulator + fabricated URL
        r["regulator"], r["regulatorUrl"] = "stub-invented-regulator", "https://example.invalid/invented-regulator"
    elif prof["targetRegion"] == "New York":                            # Ontario's regulator URL on a NY plan
        r["regulatorUrl"] = _ruleset(AIDA)["source"]
    return r


def self_test(out_dir: Path) -> int:
    local = lambda fn: (lambda url, payload: (200, json.loads(json.dumps(fn(payload)))))  # noqa: E731
    print("== good stub ==")
    good, gp = run("stub://good", local(stub_good), out_dir)
    print(good["summary_line"]); print(f"-> {gp}")
    print("== bad stub ==")
    bad, bp = run("stub://bad", local(stub_bad), out_dir)
    print(bad["summary_line"]); print(f"-> {bp}")
    got = {r["id"]: r for r in bad["scenarios"]}
    print("== bad-chain stub ==")
    chain, cp = run("stub://bad-chain", local(stub_bad_chain), out_dir)
    print(chain["summary_line"]); print(f"-> {cp}")
    gotc = {r["id"]: r for r in chain["scenarios"]}
    print("== uncited stub (valid, zero citations: exit 0 must still warn) ==")
    uncited = lambda q: {**stub_good(q), "steps": [{**s, "sourceUrl": None} for s in stub_good(q)["steps"]]}  # noqa: E731
    low, lp = run("stub://uncited", local(uncited), out_dir)
    print(low["warning"]); print(low["summary_line"]); print(f"-> {lp}")
    print("== all-invalid stub (0/7 valid: grounding must not be counted) ==")
    def all_invalid(q):
        r = stub_good(q)
        return {**r, "steps": [{**s, "status": "done"} for s in r["steps"]]}
    inv, ip = run("stub://all-invalid", local(all_invalid), out_dir)
    print(inv["warning"]); print(inv["summary_line"]); print(f"-> {ip}")
    expect = {  # scenario -> the specific check that must fail
        "rn-on-build": lambda r: r["scores"]["semantics"]["problems"] == ["flag_false"],
        "rn-on-delay": lambda r: r["scores"]["semantics"]["problems"] == ["flag_true", "has_at_risk", "log_has_iso_date"],
        "rn-on-rejection": lambda r: r["scores"]["semantics"]["problems"] == ["remediation_step"],
        "rn-on-reset": lambda r: any("ids not 1..n" in p for p in r["scores"]["contract"]["problems"]),
        "swe-on-build": lambda r: {"2_to_4_steps", "no_exam_or_licence_step", "log_says_unregulated"}
                                  <= set(r["scores"]["semantics"]["problems"])
                                  and r["scores"]["grounding"]["off_ruleset"] == 1
                                  and r["scores"]["grounding"]["off_jurisdiction"] == 0,
        "rn-de-build": lambda r: r["scores"]["grounding"]["off_kb"] == 1,
        "rn-ny-build": lambda r: r["scores"]["grounding"]["off_jurisdiction"] >= 1 and r["scores"]["contract"]["ok"]
                                 and r["scores"]["semantics"]["ok"],
    }
    expect_chain = {  # only the build's enum, the dependents' missing upstream, and the SWE regulator are broken
        "rn-on-build": lambda r: any("statuses outside" in p for p in r["scores"]["contract"]["problems"]),
        "rn-on-delay": lambda r: r["no_upstream"] and r["scores"]["semantics"]["problems"] == ["had_prior_steps"],
        "rn-on-rejection": lambda r: r["no_upstream"] and not r["passed"],
        "swe-on-build": lambda r: r["scores"]["semantics"]["problems"] == ["no_regulator"],
        # regulatorUrl is the only defect: contract + semantics + step citations all clean, scenario still fails
        "rn-de-build": lambda r: r["scores"]["grounding"]["regulator_url"] == "off_kb" and not r["passed"]
                                 and r["scores"]["semantics"]["ok"] and r["scores"]["grounding"]["off_kb"] == 0,
        "rn-ny-build": lambda r: r["scores"]["grounding"]["regulator_url"] == "off_jurisdiction" and not r["passed"]
                                 and r["scores"]["semantics"]["ok"] and r["scores"]["grounding"]["off_jurisdiction"] == 0,
    }
    fails = []
    t = good["totals"]
    if not good["all_passed"] or t["off_kb"] or t["off_jurisdiction"] or t["off_ruleset"] or t["regulator_url_bad"] \
            or good["warning"] or any(r["scores"]["grounding"]["regulator_url"] not in ("sourced", "null")
                                      for r in good["scenarios"]):
        fails.append("good stub did not pass cleanly")
    it = inv["totals"]
    if not (it["valid"] == 0 and it["steps"] == 0 and "sourced n/a" in inv["summary_line"]
            and (inv["warning"] or "").startswith("WARNING: no steps returned")):
        fails.append("all-invalid stub: grounding counted over invalid responses, or warning text wrong")
    if not good["summary_line"].startswith("7/7 scenarios passed all checks"):
        fails.append("summary line must lead with passed-all-checks")
    fails += [f"bad stub: {sid} defect not caught" for sid, ok in expect.items() if not ok(got[sid])]
    fails += [f"bad stub: {r['id']} passed despite its defect" for r in bad["scenarios"] if r["passed"]]
    fails += [f"bad-chain stub: {sid} defect not caught" for sid, ok in expect_chain.items() if not ok(gotc[sid])]
    if "2 dependents ran without upstream steps" not in chain["summary_line"]:
        fails.append("bad-chain stub: summary line hides dependents that ran without upstream steps")
    if not (low["all_passed"] and low["warning"]):
        fails.append("uncited stub: <50% sourced did not raise a WARNING")
    print("\n".join(fails) if fails else "SELF-TEST PASSED: good stub passes; every bad-stub defect caught")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--out-dir", type=Path, default=None, help="default docs/evidence (self-test: a temp dir)")
    ap.add_argument("--timeout", type=float, default=180.0, help="per-request seconds (model calls are slow)")
    ap.add_argument("--self-test", action="store_true", help="offline: score canned good + bad stub responses")
    a = ap.parse_args()
    if a.self_test:
        return self_test(a.out_dir or Path(tempfile.mkdtemp(prefix="eval-selftest-")))
    report, path = run(a.base_url, http_post(a.timeout), a.out_dir or ROOT / "docs" / "evidence")
    print(f"-> {path}")
    if report["warning"]:
        print(report["warning"])
    print(report["summary_line"])
    return 0 if report["all_passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
