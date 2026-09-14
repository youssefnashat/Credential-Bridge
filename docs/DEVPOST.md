# Devpost submission text — Credential Bridge

> Paste each section into the matching Devpost field. Before submitting, resolve every `TODO(team)`:
> the video link, repo URL, AWS Builder ID, builder.aws links, and the submission-period check in the
> disclosure. Every number here comes from `docs/evidence/`.

## Project name
Credential Bridge

## Tagline
A Strands agent on Amazon Bedrock that plans an internationally trained professional's licensing pathway from a per-jurisdiction compliance knowledge base, and flags when steps stop lining up.

## Track
Good Neighbor: built for settlement agencies and nonprofit caseworkers who guide internationally trained professionals through credential recognition.

## Inspiration / the problem
An internationally trained nurse, engineer, physician or teacher has to clear a licensing sequence before they can work in their field: credential evaluation, language testing, registration, exams, sometimes supervised experience. The order, prerequisites and validity windows differ by profession and by jurisdiction. Caseworkers at settlement agencies and nonprofits guide people through this largely by hand, one client at a time. The failure we kept coming back to is timing: a document that is valid when you apply but has expired by the registration decision it has to support. A checklist shows both items as done. Catching that needs something that knows *when* each document has to be valid and can reason over dates.

## What it does
A caseworker opens the web app and enters an applicant: name, profession, country trained, target country and region. They get a dated licensing pathway. Each step has a status, a plain-language detail and a link to the regulator page it came from, next to a panel that logs the agent's reasoning. Three scenario buttons send events to the agent:

- **Simulate a schedule delay** (`simulate_delay`): the agent re-reads the current steps, finds a dependency that no longer lines up, marks those steps at-risk, and explains the collision with dates computed by tools, plus a concrete recommendation.
- **Simulate a document rejection** (`simulate_rejection`): the agent picks an early step, marks it at-risk, inserts a remediation step, blocks its dependents, and explains why.
- **Reset the case** (`reset`): the agent rebuilds the clean pathway.

A **Your documents** checklist keeps the applicant's files together. The files stay in the browser tab and are never sent to the agent.

Here's a real example from our live evaluation. For Aida Torres, a nurse trained in the Philippines and applying in Ontario, the delay run found a collision on its own. The slipped credential assessment pushes the registration decision to 2027-09-15, but a police criminal record check ordered as planned would expire on 2027-09-01. The knowledge base records that check as valid for 6 months and required to be valid at the registration decision. The agent recommended ordering it a month later.

For an unregulated profession (Software Engineer), the grounding lookup says so. The agent returns a short work-authorization path and states that no practice licence is required, rather than forcing a licensing template.

Behind the UI is one contract, `POST /reason`. A stateful variant (`POST /sessions/{id}/reason`) stores each case's steps, and `POST /batch` runs many caseworkers' sessions in parallel. The UI offers Canada (Ontario, British Columbia, Alberta), the United States (New York, California, Texas), and the United Kingdom, Australia and Germany. The compliance KB holds 8 curated, schema-validated rulesets: Registered Nurse in Ontario, British Columbia, New York, California, the UK, Australia and Germany, and Civil Engineer in Ontario. A compact fallback table covers other pairs, such as Physician and Teacher in Ontario and New York.

## How we built it
**Strands Agents SDK (Python) on Amazon Bedrock, deployed to Amazon Bedrock AgentCore Runtime.**

- **Pathway agent** (`backend/app/agent.py`): a Strands `Agent` over a `BedrockModel` running Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`) on Amazon Bedrock in `us-west-2`. It has a system prompt that defines behaviour per event, and three `@tool` functions:
  - `get_regulator_rules(profession, target_country, target_region)` is the grounding tool. It maps the profile to a jurisdiction key and returns the KB ruleset (primary) or the compact table entry (fallback), or an `unregulated` / `unknown_region` flag.
  - `today()` and `months_between()` are deterministic date tools, so the model never does date arithmetic in its head. `today` can be pinned with `CREDBRIDGE_TODAY` for reproducible runs.
- **A fresh agent per call.** A Strands `Agent` keeps its message history and rejects overlapping calls. So `reason()` builds a new `Agent` for every request over one shared model client, and no applicant's context leaks into the next.
- **Structured output.** The result is parsed straight into the same pydantic `ReasonResponse` that FastAPI uses as its `response_model`. If structured output fails, a fallback parses the model's text and validates it against the same model; nothing unvalidated is returned.
- **Grounding enforced in code.** After the model answers, `_ground()` sets `regulator` / `regulatorUrl` from the lookup and removes any step `sourceUrl` that isn't in that jurisdiction's URL set. A fabricated link can't reach the UI.
- **Compliance KB** (`kb/`): a JSON Schema for one ruleset per profession × jurisdiction, and an ontology that defines requirement kinds, `valid_at`, `validity_months` and `depends_on`. `build_kb_index.py` validates every ruleset without AWS. Every source URL was checked on 2026-09-13 (`docs/evidence/url-check.md`).
- **Web UI**: a static, framework-free frontend (HTML/CSS/vanilla JS). One file, `agent.js`, is the seam: an adapter maps the UI's view model onto `POST /reason` and back, and rejects any reply that isn't in the contract shape. `?mock=1` runs the original offline demo, clearly labelled "Demo mode".
- **Serving**: FastAPI with a session orchestrator. Each session's state is written atomically under a per-session lock, and `POST /batch` runs many sessions concurrently on a bounded pool (`CREDBRIDGE_MAX_CONCURRENCY`).
- **AgentCore Runtime**: the same `reason()` behind a `BedrockAgentCoreApp` entrypoint, deployed as `credential_bridge` in us-west-2 with the `agentcore` CLI (built with CodeBuild, memory off). A live invoke returned a grounded Ontario pathway (`docs/evidence/agentcore-invoke-20260914T0155Z.txt`). The browser calls FastAPI, because the Runtime is invoked with SigV4-signed AWS requests.
- **Harvester agent** (`backend/app/agents/harvester.py`): a second Strands agent that reads a regulator page and emits a schema-valid ruleset marked `needs_review: true`. **Case graph** (`backend/app/orchestration/case_graph.py`): a Strands `GraphBuilder` graph with a human-approval edge before finalize. Both are in the repo but not on the request path yet.
- **Evaluation**: `backend/eval_run.py` fires 7 scenarios at the live endpoint and scores contract validity, grounding (every `sourceUrl` against the jurisdiction's curated URLs), delay semantics, and the unregulated-profession judgment. `tests_smoke.py` and `tests_offline.py` cover the contract, grounding reachability, concurrency and `_ground()` without AWS.

## Challenges we ran into
- **Modelling time, not just documents.** The useful fact isn't "a police check is required" but "it's valid for 6 months and must still be valid at the registration decision". We added `valid_at` and `validity_months` to the schema so the agent has something concrete to reason over.
- **Our model went away mid-build.** Claude 3.7 Sonnet is end-of-life on Bedrock, so we moved to Claude Sonnet 4.6. The first live evaluation passed 5 of 7: the rejection scenario hit the output-token limit on the 9-step Ontario ruleset, and the delay dates weren't ISO. Raising `max_tokens` to 8000 and requiring YYYY-MM-DD in the prompt took the second run to 7 of 7.
- **Not trusting the model with citations.** The prompt says "never invent a URL", but a prompt isn't a guarantee. So we moved the rule into code: `_ground()` drops any link that isn't in the jurisdiction's curated set.
- **One contract for two runtimes and a UI built in parallel.** The frontend had its own view model, so a small adapter in `agent.js` maps it onto the `/reason` contract and back. FastAPI and the AgentCore entrypoint share the same pydantic models, so the contract is defined once.
- **Free-text profiles to jurisdiction keys.** Profiles say "Germany" or "United Kingdom" / "England", while the KB is keyed `DE`, `GB`, `CA-ON`. The mapping has to reach every ruleset and has to refuse to guess for countries it doesn't know. The smoke test checks both.
- **Knowing when not to plan.** Software engineering isn't a licensed profession in these jurisdictions. We made that an explicit, grounded outcome instead of letting the model fill in a licensing template.

## Accomplishments that we're proud of
- **Live evaluation (Claude Sonnet 4.6 on Amazon Bedrock, 2026-09-13):** 7/7 scenarios passed all checks · 95% of steps (52/55) cite a URL from the target jurisdiction's curated ruleset, 0 off-jurisdiction or invented URLs, 3 uncited · delay / rejection / unregulated-profession judgments 3/3. Evidence: [docs/evidence/eval-20260914T012945Z.json](docs/evidence/eval-20260914T012945Z.json) · reproduce: start the server with `CREDBRIDGE_TODAY=2026-09-14`, then `backend/.venv/bin/python backend/eval_run.py`. This measures provenance, not correctness: it shows that each cited URL belongs to the curated ruleset for that applicant's jurisdiction. It does not show that the step's content is right.
- The agent found a real, regulator-sourced expiry collision (the 6-month police check) without being told which pair to look for.
- Deployed on Amazon Bedrock AgentCore Runtime, and the same `reason()` also serves FastAPI locally.
- A compliance KB with 8 curated, schema-validated rulesets across 7 jurisdictions, each requirement carrying a source URL and the moment it must be valid.
- A complete caseworker experience: intake, a dated pathway with source links, a reasoning log, and one-click scenarios.

## What we learned
- For regulatory reasoning, the schema matters more than the prompt: encoding `valid_at` and `validity_months` is what lets the agent find collisions.
- Keep date math in tools and decisions in the model. It makes the output checkable and the prompt shorter.
- Put the rules you can't afford to break in code, not in the prompt. Citations are enforced after the model answers.
- A Strands `Agent` is stateful; build one per request and share the model client instead.
- Define the contract once (pydantic) and let every runtime and the UI adapter reuse it.

## What's next
- Expose the case graph (human approval before a case finalizes) and the deadline watcher through the API.
- An authenticated proxy so the UI can call the AgentCore Runtime directly.
- Close the remaining same-session race: two simultaneous events on one case can both start from the same stored steps.
- Harvest the queued jurisdictions, with human review before any ruleset is marked reviewed.
- Durable session storage (DynamoDB or AgentCore Memory) and caseworker sign-off.
- Pilot with a settlement agency to test it against real caseloads.

## Built with
python · strands-agents · amazon-bedrock · anthropic-claude (Claude Sonnet 4.6) · amazon-bedrock-agentcore · fastapi · pydantic · uvicorn · boto3 · json-schema · javascript · html · css

## Links
- Repository: _TODO(team): public GitHub URL (Apache-2.0)_
- Video: _TODO(team): public YouTube/Vimeo link (≤5 min)_
- Live demo: the AgentCore Runtime (`credential_bridge`, us-west-2) needs AWS-signed requests, so there's no public URL. The web UI runs locally against FastAPI; see the README's *Run it*.
- Architecture diagram: `docs/architecture.png`
- builder.aws posts: _TODO(team): links once published (titles in docs/BLOG_PLAN.md)_

## Pre-existing code disclosure
Built during the submission period. The initial backend / KB / docs scaffold was committed unmodified from the project zip (`AWS-HACKATHON-credential-bridge.zip`) on 2026-09-13 (`11b25f3`), as a baseline; every change after it is a separate commit. The static frontend (by Nash) was added on 2026-09-13 (`0b443ed`). _[TODO(team): confirm the submission period's start date (Aug 10, 2026?) on the Devpost rules page, and that the scaffold and frontend were created within it.]_ Third-party: Strands Agents SDK (`strands-agents` with the `anthropic` and `web-fetch` extras), `bedrock-agentcore`, jsonschema, botocore, FastAPI, Uvicorn, Pydantic, boto3, python-dotenv (see `backend/requirements.txt`), and `bedrock-agentcore-starter-toolkit` for deployment; the frontend loads Google Fonts (Fraunces, IBM Plex Sans, IBM Plex Mono).

## Other required fields
- AWS Builder ID: _TODO(team)_
- License: Apache-2.0 (`LICENSE` in repo root)
