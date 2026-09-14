# Credential Bridge

**A Strands agent on Amazon Bedrock that builds an internationally trained professional's licensing pathway from a per-jurisdiction compliance knowledge base, spots the deadlines that stop lining up, and explains the re-plan. It's built for settlement caseworkers and the people they serve.**

Agents for Humans Hackathon 2026 · Good Neighbor track · Apache-2.0

---

## The problem
A nurse trained in Manila or a civil engineer trained in Lagos can't practise in Canada, the US, the UK, Australia or Germany without clearing a licensing sequence: credential evaluation, language testing, registration, board exams, sometimes supervised experience. **The order, the prerequisites and the validity windows differ by profession and by province, state or country.** One timing mistake can send an applicant back a step that already cost months and fees. A classic case is a document that's valid when you apply but expires before the registration decision it has to support.

## Who it's for
Settlement-agency and nonprofit caseworkers who guide internationally trained professionals through credential recognition, largely by hand and one client at a time. It's also for the professionals themselves.

## Why it matters
Nursing, medicine, engineering and teaching have persistent shortages, and every month a qualified person spends stuck on sequencing is a month they aren't working in their field. A static checklist lists requirements, but it doesn't notice when two of them stop lining up. Credential Bridge builds a personal pathway, detects those collisions, and explains the re-plan in plain language. Each step carries a source link so a caseworker can check it.

## What it does
A caseworker enters an applicant (name, profession, country trained, target country and region) in the web UI and gets a dated pathway. Scenario buttons then send events to the agent:

1. **`build_pathway`**: an ordered pathway for that profession and jurisdiction, built from grounded data (regulator, evaluation body, language tests and their validity windows, exams). Each step has a status, a detail line, and the regulator's `source` / `sourceUrl`.
2. **`simulate_delay`**: the agent re-reads the current steps, picks a real dependency that no longer lines up, marks those steps `at-risk`, and explains the collision with ISO dates it computed with deterministic date tools. In the live evaluation it found one on its own: for Aida Torres (Philippines → Ontario), a slipped credential assessment pushes the registration decision past the six-month life of her police criminal record check. The full reply is scenario `rn-on-delay` in the [eval evidence](docs/evidence/eval-20260914T012945Z.json).
3. **`simulate_rejection`**: marks an early step at-risk, inserts a remediation step right after it, renumbers, and sets the blocked dependents to not-started.
4. **`reset`**: rebuilds the clean pathway.
5. **Unregulated professions.** For Software Engineer, the grounding lookup returns `unregulated: true`, and the agent returns a short work-authorization path and says no practice licence is needed. It doesn't force a licensing template.

The model makes the decisions: ordering, which pair collides, the explanation. They come back through **Strands structured output** validated against the pydantic contract, not through templated strings. **Grounding is enforced in code:** after the model answers, `_ground()` in `backend/app/agent.py` sets `regulator` / `regulatorUrl` from the grounding lookup, and removes any step `sourceUrl` that isn't in that jurisdiction's URL set.

## Demo
**Live demo:** https://logjufgxwjxpwmpts7lsrs4vjq0vxsvx.lambda-url.us-west-2.on.aws/. The same web UI, in front of the AgentCore Runtime through a small Lambda proxy ([deploy/live-demo/](deploy/live-demo/README.md)). Claude is currently served through the Anthropic API while our Bedrock model access is under review; usage is capped. Each agent step takes about a minute.

Video: _link pending_. The shot plan and the exact command behind each beat are in [docs/VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md) (see its *Command sheet*).

## Accuracy
**Live evaluation (Claude Sonnet 4.6 on Amazon Bedrock, 2026-09-13):** 7/7 scenarios passed all checks · 95% of steps (52/55) cite a URL from the target jurisdiction's curated ruleset, 0 off-jurisdiction or invented URLs, 3 uncited · delay / rejection / unregulated-profession judgments 3/3. Evidence: [docs/evidence/eval-20260914T012945Z.json](docs/evidence/eval-20260914T012945Z.json) · reproduce: start the server with `CREDBRIDGE_TODAY=2026-09-14`, then `backend/.venv/bin/python backend/eval_run.py`.

This measures provenance, not correctness: it shows that each cited URL belongs to the curated ruleset for that applicant's jurisdiction. It does not show that the step's content is right. The 7 scenarios are RN Ontario build / delay / rejection / reset, Software Engineer Ontario, RN Germany and RN New York; the 3 uncited steps are Software Engineer steps, which have no regulator to cite. `backend/.venv/bin/python backend/eval_run.py --self-test` checks the scorer offline against good and bad stub responses.

## Architecture
![Architecture](docs/architecture.png)

- **UI** (repo root, static) → `agent.js` adapter → `POST /reason`.
- **FastAPI** (`backend/app/api.py`): `/reason` (stateless), `/sessions/{id}/reason` (stateful), `/batch`, `/sessions`, `/health`; one audit line per request in `data/audit.jsonl`.
- **Reasoner** (`backend/app/agent.py`): a fresh Strands `Agent` per call over one shared `BedrockModel`, running Claude Sonnet 4.6 (us.anthropic.claude-sonnet-4-6) on Amazon Bedrock in us-west-2. It has three tools:
  - `get_regulator_rules`, the grounding lookup;
  - `today`, which can be pinned with `CREDBRIDGE_TODAY`;
  - `months_between`.

  Output is structured into `ReasonResponse`, with a validated text-parse fallback, and then passed through `_ground()`.
- **Grounding** (`backend/app/reference.py`): maps the free-text profile to a jurisdiction key, reads `kb/store/<JURIS>/<profession>.json` first and `backend/reference/regulators.json` as a fallback, and returns `unregulated` or `unknown_region` instead of guessing.
- **AgentCore Runtime** (`backend/agentcore_entrypoint.py`) wraps the same `reason()` and is deployed as `credential_bridge` in us-west-2 (see [AgentCore](#agentcore)). Locally the UI calls FastAPI; the public live demo reaches the Runtime through a small Lambda proxy (`deploy/live-demo/`), because invoking the Runtime needs SigV4-signed AWS requests.

Mermaid source and component table: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Concurrency: [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md).

## Run it
Requires Python 3.11+, AWS credentials (`aws configure` or `aws login`), and Bedrock access to Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`) on Amazon Bedrock in `us-west-2`.

```bash
cd backend
cp .env.example .env     # loaded by app/api.py at startup; real env vars override it
./run_local.sh           # creates .venv, installs requirements, serves uvicorn on :8000
```
- Leave `CREDBRIDGE_MODEL` unset to use the code default, `us.anthropic.claude-sonnet-4-6`.
- To pin "today" so expiry dates are reproducible, set `CREDBRIDGE_TODAY=2026-09-14` in `.env` or export it before starting.
- `backend/requirements.txt` pins the verified versions (strands-agents 1.55.1, bedrock-agentcore 1.23.0) and includes `botocore[crt]`, which `aws login` sessions need.

### Open the UI
Static frontend by Nash: `index.html`, `styles.css`, `app.js`, `agent.js` and `pathways.js` at the repo root, with no build step and no dependencies. With the backend running on :8000, open a second terminal at the repo root:
```bash
python3 -m http.server 8765
open "http://localhost:8765/?api=http://localhost:8000"
```
- **Live (default).** The page calls `POST {api}/reason`. `?api=` sets the backend base URL, and the default is `http://localhost:8000`. Every step, status and log line on screen comes from the agent. `agent.js` is the single seam: its adapter maps the intake form onto the `/reason` request and maps the reply back. For example, "Doctor / Physician" becomes `Physician`, country trained becomes `countryTrained`, and the current timeline becomes `currentSteps`. A reply that isn't in the contract shape is shown as an error, never patched. Live calls can take a minute or more; the page waits up to 120 s.
- **Offline demo (`?mock=1`).** This is Nash's original simulation. It's templated in the browser, calls no model, and uses illustrative dates. The header shows a "Demo mode" chip.
- **What you see.** An intake form (name, profession, country trained, target country and region; all required) leads to a dashboard. The sidebar holds the applicant summary, a **Your documents** checklist and the scenario buttons. The main area is a **Pathway** timeline beside a panel that logs the agent's reasoning. Each step shows its status, detail and source link, or "no source cited" when it has none. *Simulate a schedule delay* sends `simulate_delay`; when the agent flags a conflict, the at-risk steps are bracketed in the timeline gutter. *Simulate a document rejection* sends `simulate_rejection`, and in live mode the agent chooses which document is returned. *Reset the case* sends `reset`. Target options: Canada (Ontario, British Columbia, Alberta), United States (New York, California, Texas), and the United Kingdom, Australia and Germany as national rulesets.
- **Documents.** In live mode, **Your documents** is a checklist of five common documents: transcripts, credential evaluation, language test, proof of practice and identity. An upload records only the file's name and size in the browser tab. It's never sent to the agent, because the `/reason` contract has no field for documents, and it never changes a step. With `?mock=1`, uploads drive the templated pathway, and the rejection reasons, dates and "Drafted applications" tab are invented for the demo. The drafts tab doesn't appear in live mode.
- **Design.** Fraunces, IBM Plex Sans and IBM Plex Mono (Google Fonts). The layout is responsive to phone width, keyboard navigable with visible focus, and respects `prefers-reduced-motion`. Case state lives in memory, so reloading starts a new case.
- **Hosting.** Any static host works: Netlify, Vercel or GitHub Pages, with the publish directory set to the repo root and no build command. A hosted copy still defaults to `http://localhost:8000`, which is the viewer's own machine. It only runs live with `?api=` pointing at a reachable backend; otherwise use `?mock=1`. The demo video is filmed locally.

### Try the endpoint
```bash
curl -s localhost:8000/health            # {"status":"ok"}

# 1) build a pathway (stateful session: the server stores the steps)
curl -s -X POST localhost:8000/sessions/aida-demo/reason -H 'content-type: application/json' -d '{
 "profile":{"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},
 "event":"build_pathway","currentSteps":[]}' | python3 -m json.tool

# 2) inject a delay: with currentSteps [] the session endpoint feeds back the steps stored by call 1
curl -s -X POST localhost:8000/sessions/aida-demo/reason -H 'content-type: application/json' -d '{
 "profile":{"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},
 "event":"simulate_delay","currentSteps":[]}' | python3 -m json.tool

# 3) the judgment case: an unregulated profession (stateless endpoint)
curl -s -X POST localhost:8000/reason -H 'content-type: application/json' -d '{
 "profile":{"name":"Wei Chen","profession":"Software Engineer","countryTrained":"China","targetCountry":"Canada","targetRegion":"Ontario"},
 "event":"build_pathway","currentSteps":[]}' | python3 -m json.tool
```
`simulate_rejection` and `reset` use the same body with a different `event`. To check a citation by hand, take a `sourceUrl` from a response and look for it in that jurisdiction's file, for example `grep -c "cno.org" kb/store/CA-ON/registered-nurse.json` from the repo root.

### No-AWS checks
```bash
cd backend
.venv/bin/python tests_smoke.py     # every KB ruleset resolves from a natural profile; unknown countries aren't guessed; contract round-trips; concurrent sessions persist
.venv/bin/python tests_offline.py   # concurrent reason() calls; text-parse fallback; _ground() drops fabricated regulators/URLs; case graph skips finalize unless approved
.venv/bin/python eval_run.py --self-test
.venv/bin/python ../kb/pipeline/build_kb_index.py   # validates kb/store/** (8 rulesets, 7 jurisdictions) and rewrites kb/store/_index.json
```

### API contract
`POST /reason`
```jsonc
// request
{ "profile": { "name": "Aida Torres", "profession": "Registered Nurse",
               "countryTrained": "Philippines", "targetCountry": "Canada", "targetRegion": "Ontario" },
  "event": "build_pathway",              // build_pathway | simulate_delay | simulate_rejection | reset
  "currentSteps": [] }
// response (shape; values illustrative)
{ "steps": [ { "id": 1, "title": "...", "status": "upcoming", "detail": "...",
               "source": "College of Nurses of Ontario (CNO)", "sourceUrl": "https://..." } ],
  "logEntry": { "text": "...", "flag": false },
  "regulator": "College of Nurses of Ontario (CNO)", "regulatorUrl": "https://..." }
```
`status` ∈ complete · in-progress · upcoming · not-started · at-risk. `id`s are 1..n. `source`, `sourceUrl`, `regulator` and `regulatorUrl` are optional and may be `null`. Schemas: `backend/app/schemas.py`.

| endpoint | purpose |
|---|---|
| `POST /reason` | stateless single call (what the UI uses) |
| `POST /sessions/{id}/reason` | stateful: seeds `currentSteps` from the stored session when the request sends `[]` |
| `POST /batch` | run many sessions' events concurrently on a bounded pool |
| `GET /sessions` | list stored sessions |
| `GET /health` | liveness |

### Many caseworker sessions at once
```bash
cd backend && .venv/bin/python demo_concurrent.py    # server running; 5 sessions at once (CREDBRIDGE_URL overrides the base URL)
curl -s localhost:8000/sessions | python3 -m json.tool
```
Each session's state is written atomically under a per-session lock; `POST /batch` runs many sessions concurrently on a bounded pool (`CREDBRIDGE_MAX_CONCURRENCY`, default 4). There's one known gap: two events that hit the *same* session at the same moment can both start from the same stored steps. Details are in [docs/ORCHESTRATION.md](docs/ORCHESTRATION.md).

### Coverage
Reproduce with `ls kb/store/*/` and `python3 -m json.tool backend/reference/regulators.json`.

| profession | compliance KB (`kb/store`, primary) | fallback (`regulators.json`) |
|---|---|---|
| Registered Nurse | CA-ON, CA-BC, US-NY, US-CA, GB, AU, DE | CA-AB, US-TX |
| Civil Engineer | CA-ON | CA-BC, CA-AB, US-CA, US-TX, US-NY |
| Physician | — | CA-ON, US-NY |
| Teacher | — | CA-ON, CA-BC, US-NY |
| Software Engineer | — | unregulated in all covered jurisdictions |

`targetCountry` accepts names like "Canada", "United States"/"USA", "United Kingdom"/"UK"/"England", "Australia" and "Germany". `targetRegion` names the province or state for Canada and the US (GB, AU and DE are national). An unknown country or region returns `unknown_region`; it is never mapped to a guess. Domain model: [kb/ontology/credential-ontology.md](kb/ontology/credential-ontology.md).

To grow the KB (needs AWS): `.venv/bin/python ../kb/pipeline/run_harvest_batch.py --limit 1` from `backend/`. It works through `kb/sources/harvest_queue.jsonl` with the harvester Strands agent, validates each ruleset before writing it, and marks it `needs_review: true`.

## AgentCore
**Status: deployed.** The Runtime `credential_bridge` runs in us-west-2. It was built with CodeBuild (no local Docker) and has AgentCore memory turned off. `backend/agentcore_entrypoint.py` is a `BedrockAgentCoreApp` whose `@app.entrypoint` accepts the `/reason` body and returns the same response from the same `reason()`. A live `agentcore invoke` for Aida Torres returned a grounded Ontario pathway with CNO as the regulator: [docs/evidence/agentcore-invoke-20260914T0155Z.txt](docs/evidence/agentcore-invoke-20260914T0155Z.txt). Bedrock model access on our account was later suspended pending review, so since 2026-09-14 the Runtime runs with `CREDBRIDGE_PROVIDER=anthropic`: the same agent and tools, with Claude Sonnet 4.6 served through the Anthropic API. Setting it back to `bedrock` needs no code change.

Deploy from the repo root with the starter toolkit's `agentcore` CLI (`pip install bedrock-agentcore-starter-toolkit`, 0.3.12, where `launch` is now `deploy`):
```bash
agentcore configure -e backend/agentcore_entrypoint.py -rf backend/requirements.txt -n credential_bridge -r us-west-2 -dm -ni
agentcore deploy --env CREDBRIDGE_MODEL=us.anthropic.claude-sonnet-4-6 --env AWS_REGION=us-west-2
agentcore invoke '{"profile":{"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},"event":"build_pathway","currentSteps":[]}'
agentcore destroy        # teardown
```
The toolkit now prints a notice that it's no longer supported and points to the newer AgentCore CLI (`npm install -g @aws/agentcore`); we haven't moved to it. The execution role needs `bedrock:InvokeModel` for the model in us-west-2. The Runtime is invoked with SigV4-signed AWS requests, so a browser can't call it directly. The public live demo puts a small Lambda proxy with a usage cap in front of it: see [deploy/live-demo/README.md](deploy/live-demo/README.md).

## Data sources & honesty note
- **Curated KB.** All 8 KB rulesets are `harvest_method: "curated"` from official regulator pages, and each carries `source` URLs, a `confidence` and `needs_review`. `regulators.json` is a compact curated table for pairs not yet in the KB.
- **Source-URL checks.** Every source URL in the KB, `kb/sources` and `regulators.json` was checked on 2026-09-13. The method, each status and every replacement are in [docs/evidence/url-check.md](docs/evidence/url-check.md). Dead links were replaced only with verified pages on the same regulator's domain (`512e7dc`, `3d13057`). The PEO and EGBC pages sit behind Cloudflare, so they were confirmed by search rather than fetched.
- **Rules change.** For example, CNO has required an approved educational credential assessment (WES / ICAS / ICES-BCIT) since 2025-04-01, and the Ontario ruleset reflects that. The California BRN asks for an English exam only when it has "reasonable doubt".
- **Harvested rulesets.** The harvester writes rulesets with `needs_review: true`, and they're unverified until a human clears them. No harvested ruleset is in the KB yet.
- **What code enforces, and what it doesn't.** Code enforces the `regulator`, `regulatorUrl` and every `sourceUrl` (`_ground()`), but not the free-text `detail`. The model can add document-preparation advice that isn't in the KB. For example, the AgentCore run's first step for Aida is "Gather & Notarize Philippine Nursing Documents" (PRC licence, transcripts, apostille), which no ruleset states. This is a **research aid for caseworkers, not legal or immigration advice**.
- **Pre-existing code.** Built during the submission period. The initial backend / KB / docs scaffold was committed unmodified from the project zip (`AWS-HACKATHON-credential-bridge.zip`) on 2026-09-13 (`11b25f3`), as a baseline; every change after it is a separate commit. The static frontend (by Nash) was added on 2026-09-13 (`0b443ed`). _[TODO(team): confirm the submission period's start date (Aug 10, 2026?) on the Devpost rules page, and that the scaffold and frontend were created within it.]_ Third-party: Strands Agents SDK (`strands-agents` with the `anthropic` and `web-fetch` extras), `bedrock-agentcore`, jsonschema, botocore, FastAPI, Uvicorn, Pydantic, boto3, python-dotenv (see `backend/requirements.txt`), and `bedrock-agentcore-starter-toolkit` for deployment; the frontend loads Google Fonts (Fraunces, IBM Plex Sans, IBM Plex Mono).

## Roadmap
- Expose the case graph already in the repo (`backend/app/orchestration/case_graph.py`: Strands `GraphBuilder`, pathway → human-approval edge → finalize) and the deadline watcher (`backend/app/agents/watcher.py`) through the API.
- Close the same-session race: hold the session for the whole event.
- Harvest the queued pairs in `kb/sources/harvest_queue.jsonl`, with human review before `needs_review` flips.
- Switch the live demo back to Amazon Bedrock once our model access is restored.
- Swap the file-backed session store for DynamoDB or AgentCore Memory; scope CORS down from `*`.

## License
Apache-2.0. See [LICENSE](LICENSE).

## Team
Kanwar Jhattu · Youssef Nashaat
