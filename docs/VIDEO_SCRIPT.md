# Video plan (canonical) — max 4:30, screen recording + voiceover

This is the **only** video plan. `.claude/skills/hackathon-submission/SKILL.md` points here.
Devpost requires: ≤5 min, public on YouTube or Vimeo, shows the project **working**, and a pitch
covering **(1) the problem, (2) who it's for, (3) why it matters**. Judging criteria referenced
below: **TI** Technical Implementation · **D** Design · **PI** Potential Impact ·
**CO** Creativity & Originality · **P** Presentation.

**Rule for filming: show only what the code does today.** Nothing in this plan depends on a
component that isn't on the request path. Not in the video: a document "checker" (not built), a
"packet" step and a "watcher ping" (the case graph and watcher exist in the repo but are not wired to
any endpoint), and "harvester running unattended" (only if T11 produces a real harvested ruleset —
see *Conditional beats*). Never read a scripted date or number aloud — read what the agent actually
returned on screen.

---

## Pre-flight (before recording)
1. AWS credentials + Bedrock model access in us-west-2 (task board H1/T8). One dry run of every beat.
2. Start the server with a pinned date so expiry reasoning is stable across takes:
   ```bash
   cd backend
   cp .env.example .env                  # once
   set -a; source .env; set +a           # the app reads the shell env; .env is not auto-loaded
   export CREDBRIDGE_TODAY=2026-09-14
   ./run_local.sh                        # uvicorn on :8000
   ```
3. Move stale sessions out of the way so `GET /sessions` only shows demo cases:
   `mkdir -p /tmp/old-sessions && mv backend/data/sessions/*.json /tmp/old-sessions/ 2>/dev/null`
4. Surface: use the frontend UI if it is wired to `/reason` (task T12). Otherwise use a terminal
   with a large font; every beat below has the exact command (see *Command sheet*). Both surfaces
   hit the same endpoint, so the story is identical.
5. Have `docs/architecture.png` open in a viewer.

---

## Beats

| # | time | length | criterion | on screen (exact action) | voiceover (spoken) |
|---|---|---|---|---|---|
| 1 | 0:00 | 20s | PI · P | Title card, then a plain slide: "Nurse trained in Manila → Ontario" | **Problem.** "A nurse trained in Manila can't practise in Ontario until she clears a licensing sequence — credential evaluation, a language test, registration, a national exam. The order and the expiry windows differ by profession and by jurisdiction, and one expired document can send her back a step." |
| 2 | 0:20 | 25s | PI · P | Slide: "Who: settlement caseworkers + the professionals they serve" | **Who + why.** "Settlement agencies and nonprofit caseworkers do this guidance by hand, one client at a time. These are professions with shortages — every month a qualified nurse spends stuck is a month she isn't working as one." |
| 3 | 0:45 | 10s | CO | File tree of `kb/store/` (C0) | "Credential Bridge is a Strands agent on Amazon Bedrock that reasons over a per-jurisdiction compliance knowledge base — it reads the rules, it doesn't recall them." |
| 4 | 0:55 | 55s | TI · D | **build_pathway** for Aida Torres, RN, Philippines → Ontario (C1). Scroll the steps; point at a step's `source` / `sourceUrl`. Then C1b: the same URL and `valid_at` fields in `kb/store/CA-ON/registered-nurse.json`. | "The agent calls its grounding tool first, then orders the steps. Each step carries the regulator it came from — and here's that URL in the knowledge base file." Read the returned `logEntry.text` summary aloud (first sentence only). |
| 5 | 1:50 | 60s | CO · TI | **simulate_delay** on the same session (C2) — the server feeds the stored steps back in. Highlight the steps now `at-risk` and the `logEntry` (flag=true). Cut to C1b line showing `"valid_at": "registration_decision"`. | "Now a delay hits. The agent looks at the steps it already built, finds which requirement no longer lines up — here's the explanation, with the dates it computed." Read the returned `logEntry.text`. "That comes from one field in the knowledge base: when the document must still be valid. A checklist shows both items green." |
| 6 | 2:50 | 20s | TI | **simulate_rejection** on the same session (C3). Show the inserted remediation step and the renumbered ids. | "A rejection: the agent inserts a remediation step and marks what's now blocked." *(Cut first if over time.)* |
| 7 | 3:10 | 30s | CO | **Software Engineer** — Wei Chen, China → Ontario (C4). Show the short pathway and the `logEntry`. | "Switch to a software engineer. There's no licence to obtain for this in Ontario — the lookup says so, and the agent says so instead of forcing a licensing template. That's deliberate." |
| 8 | 3:40 | 20s | PI · TI | `python demo_concurrent.py` (C5), then `GET /sessions` (C6). | "An agency runs many cases at once. Five caseworker sessions, run in parallel, each persisted separately." *(Gated: include only if the dry run completes all five without errors.)* |
| 9 | 4:00 | 20s | TI · D | `docs/architecture.png` (8s) → `python kb/pipeline/build_kb_index.py` output (C7, 6s) → AgentCore (C8, 6s). | "FastAPI in front, one Strands agent with three tools, a schema-validated knowledge base first and a compact table as fallback. The same `reason()` function sits behind an AgentCore Runtime entrypoint." Say "deployed on AgentCore" **only** if C8 ran live (T10). If `docs/evidence/` holds a measured grounding score (T9), show it here for 3s and read the number from the file. |
| 10 | 4:20 | 10s | P | Repo URL + "Apache-2.0" + builder.aws post titles | "Built with the Strands Agents SDK on Amazon Bedrock. Code, setup and write-ups are linked below." |

**Total: 4:30.** Beats 6 and 8 are the first cuts (→ 3:50). Target the recorded cut at ~4:15.

### Conditional beats (only if the precondition is met on the dry run)
- **Harvester (swap for beat 6, 20s, TI):** only if `python kb/pipeline/run_harvest_batch.py --limit 1`
  wrote a new ruleset that validates. Show the new `kb/store/<J>/<prof>.json` with
  `"harvest_method": "agent"` and `"needs_review": true`. Say "harvested and waiting for human review";
  never say it's verified.
- **Measured accuracy (inside beat 9):** only from a file in `docs/evidence/`. No file, no number.

---

## Command sheet (run from repo root unless noted; server on :8000)

```bash
# C0 — what the KB covers
ls kb/store/*/

# C1 — build_pathway (stateful session so later events reuse these steps)
curl -s -X POST localhost:8000/sessions/aida-demo/reason -H 'content-type: application/json' -d '{
 "profile":{"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},
 "event":"build_pathway","currentSteps":[]}' | python -m json.tool

# C1b — the grounding the steps came from
grep -n -E '"(name|valid_at|validity_months|source)"' kb/store/CA-ON/registered-nurse.json

# C2 — simulate_delay (currentSteps [] => the server seeds the stored steps for this session)
curl -s -X POST localhost:8000/sessions/aida-demo/reason -H 'content-type: application/json' -d '{
 "profile":{"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},
 "event":"simulate_delay","currentSteps":[]}' | python -m json.tool

# C3 — simulate_rejection on the same session
curl -s -X POST localhost:8000/sessions/aida-demo/reason -H 'content-type: application/json' -d '{
 "profile":{"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},
 "event":"simulate_rejection","currentSteps":[]}' | python -m json.tool

# C4 — unregulated profession (stateless endpoint)
curl -s -X POST localhost:8000/reason -H 'content-type: application/json' -d '{
 "profile":{"name":"Wei Chen","profession":"Software Engineer","countryTrained":"China","targetCountry":"Canada","targetRegion":"Ontario"},
 "event":"build_pathway","currentSteps":[]}' | python -m json.tool

# C5 — five caseworker sessions at once
cd backend && python demo_concurrent.py && cd ..

# C6 — sessions persisted independently
curl -s localhost:8000/sessions | python -m json.tool

# C7 — KB validation (no AWS; also rewrites kb/store/_index.json)
python kb/pipeline/build_kb_index.py

# C8 — AgentCore (only if deployed, task T10); otherwise show backend/agentcore_entrypoint.py for 5s
cd backend && agentcore invoke '{"profile":{"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},"event":"build_pathway","currentSteps":[]}'
```

## After recording
- Upload to YouTube or Vimeo with visibility set to **Public** (not Unlisted/Private), ≤5 min.
- Save the raw JSON from C1–C4 to `docs/evidence/` so every on-screen claim is reproducible.
- Put the link in `README.md` (Demo section) and `docs/DEVPOST.md`.
