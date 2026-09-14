# Devpost submission text — Credential Bridge

> Paste each section into the matching Devpost field. Before submitting, resolve every `TODO(team)`:
> video link, repo URL, AWS Builder ID, accuracy line (only from `docs/evidence/`), AgentCore status,
> and the model name if task T8 switches it.

## Project name
Credential Bridge

## Tagline
A Strands agent that plans an internationally trained professional's licensing pathway from a per-jurisdiction compliance knowledge base, and flags when steps stop lining up.

## Track
Good Neighbor — built for settlement agencies and nonprofit caseworkers who guide internationally trained professionals through credential recognition.

## Inspiration / the problem
An internationally trained nurse, engineer, physician or teacher has to clear a licensing sequence before they can work in their field: credential evaluation, language testing, registration, exams, sometimes supervised experience. The order, prerequisites and validity windows differ by profession and by jurisdiction. Caseworkers at settlement agencies and nonprofits guide people through this largely by hand, one client at a time. The failure we kept coming back to is timing: a language result that is valid when you apply but expired by the registration decision it has to support. A checklist shows both items as done. Catching that needs something that knows *when* each document has to be valid and can reason over dates.

## What it does
Credential Bridge exposes one contract, `POST /reason`, that takes an applicant profile (profession, country trained, target country and region) and an event:

- **build_pathway** — returns an ordered list of steps for that profession and jurisdiction, each with a status and the regulator source and URL it came from, plus a plain-language summary.
- **simulate_delay** — takes the current steps, finds a dependency that no longer lines up (e.g. a language test whose validity window closes before the registration decision), marks the affected steps at-risk, and explains the problem with dates computed by tools.
- **simulate_rejection** — marks an early step at-risk, inserts a remediation step, blocks its dependents, and explains why.
- **reset** — rebuilds the clean pathway.

For an unregulated profession (Software Engineer), the grounding lookup says so, and the agent returns a short work-authorization path and states that no practice licence is required — rather than forcing a licensing template.

A stateful variant (`POST /sessions/{id}/reason`) stores each case's steps so a caseworker can apply events to a case over time. `POST /batch` and `demo_concurrent.py` run many caseworker sessions in parallel.

Coverage today: 8 curated, schema-validated rulesets in the compliance KB (Registered Nurse in Ontario, British Columbia, New York, California, the UK, Australia and Germany; Civil Engineer in Ontario), plus a compact fallback table for other pairs (e.g. Physician and Teacher in Ontario and New York).

## How we built it
**Strands Agents SDK (Python) on Amazon Bedrock.**

- **Pathway agent** (`backend/app/agent.py`): a Strands `Agent` with a `BedrockModel` (Claude 3.7 Sonnet, `us-west-2`, temperature 0.2) _[TODO(team): update if T8 changes the model]_, a system prompt that defines behaviour per event, and three `@tool` functions:
  - `get_regulator_rules(profession, target_country, target_region)` — the grounding tool. It maps the profile to a jurisdiction key and returns the KB ruleset (primary) or the compact table entry (fallback), or an `unregulated` / `unknown_region` flag.
  - `today()` and `months_between()` — deterministic date tools, so the model never does date arithmetic in its head. `today` can be pinned with `CREDBRIDGE_TODAY` for reproducible runs.
- **Structured output**: the agent's result is parsed straight into the same pydantic `ReasonResponse` that FastAPI uses as its `response_model`, so the frontend contract is enforced at the boundary. If structured output fails, a fallback parses the model's text and validates it against the same model; nothing unvalidated is returned.
- **Harvester agent** (`backend/app/agents/harvester.py`): a second Strands agent with a web-fetch tool that reads a regulator page and emits a ruleset JSON matching the KB schema, with `harvest_method: agent` and `needs_review: true`. `kb/pipeline/run_harvest_batch.py` works through a queue of regulator URLs.
- **Case graph** (`backend/app/orchestration/case_graph.py`): a Strands `GraphBuilder` graph — pathway node, then a finalize node behind a conditional edge on `invocation_state["approved"]` (a human-approval gate). It is in the repo but not yet exposed through the API.
- **Compliance KB** (`kb/`): a JSON Schema for one ruleset per profession × jurisdiction, an ontology (`kb/ontology/credential-ontology.md`) that defines requirement kinds, `valid_at`, `validity_months` and `depends_on`, and `build_kb_index.py`, which validates every ruleset and builds an index without AWS.
- **Serving**: FastAPI with a session orchestrator (bounded thread pool across sessions, a per-session lock and atomic JSON writes within one), and an Amazon Bedrock AgentCore Runtime entrypoint (`BedrockAgentCoreApp`) wrapping the same `reason()` function. _[TODO(team): AgentCore status — "deployed and invoked" only if T10 succeeded; otherwise "entrypoint written, deployment pending".]_
- **Verification without AWS**: `backend/tests_smoke.py` checks that every KB ruleset resolves from a natural-language profile, that unknown countries don't get mapped to a guess, and that the contract round-trips.

## Challenges we ran into
- **Modelling time, not just documents.** The useful fact isn't "IELTS is required" but "IELTS must still be valid at the registration decision". We added `valid_at` and `validity_months` to the schema and ontology so the agent has something concrete to reason over.
- **Free-text profiles to jurisdiction keys.** Frontend profiles say "Germany" or "United Kingdom" / "England", while the KB is keyed `DE`, `GB`, `CA-ON`. The mapping has to reach every ruleset and has to refuse to guess for countries it doesn't know. The smoke test now checks both.
- **Keeping one contract across two runtimes.** The frontend was fixed, so FastAPI and AgentCore both had to return exactly the same shape. Pydantic models shared by both entry points made that a single definition.
- **Knowing when not to plan.** Software engineering isn't a licensed profession in these jurisdictions. We made that an explicit, grounded outcome instead of letting the model fill in a licensing template.
- **Limited live Bedrock time during the build**, so most verification ran through the no-AWS smoke test and KB validation. _[TODO(team): update after the live evaluation run.]_

## Accomplishments that we're proud of
- A compliance KB with 8 curated, schema-validated rulesets across 7 jurisdictions, each requirement carrying a source URL and the moment it must be valid.
- The agent reasons over that data through a tool rather than recalling it, and returns a contract-valid object or an error — never a malformed response.
- The unregulated-profession case is handled as judgment, grounded in the reference data.
- One `reason()` function behind both FastAPI and an AgentCore Runtime entrypoint.
- _Accuracy: pending live evaluation run (see docs/evidence/)._ _[TODO(team): replace only with a number from docs/evidence/.]_

## What we learned
- For regulatory reasoning, the schema matters more than the prompt: encoding `valid_at` did more for conflict detection than any prompt wording could.
- Keep date math in tools and decisions in the model. It makes the output checkable and the prompt shorter.
- Define the contract once (pydantic) and let every runtime reuse it.
- Strands' structured-output API moves between releases, so a validated fallback path is cheap insurance.

## What's next
- Expose the case graph (human approval before a case finalizes) and the deadline watcher through the API.
- Harvest the queued jurisdictions (Alberta, Texas, Ireland nursing; BC/Alberta engineering; Ontario physicians and teachers), with human review before any ruleset is marked reviewed.
- Automated source-URL checks and a grounding evaluation set.
- Durable session storage (DynamoDB or AgentCore Memory) and caseworker-facing sign-off.
- Pilot with a settlement agency to test it against real caseloads.

## Built with
python · strands-agents · strands-agents-tools · amazon-bedrock · anthropic-claude (Claude 3.7 Sonnet) · amazon-bedrock-agentcore · fastapi · pydantic · uvicorn · boto3 · json-schema

## Links
- Repository: _TODO(team): public GitHub URL (Apache-2.0)_
- Video: _TODO(team): public YouTube/Vimeo link (≤5 min)_
- Live demo: _optional — AgentCore Runtime URL if deployed_
- Architecture diagram: `docs/architecture.png`
- builder.aws posts: _TODO(team): links once published (titles in docs/BLOG_PLAN.md)_

## Pre-existing code disclosure
Built during the submission period (Aug 10 – Sep 14, 2026). The initial backend / KB / docs scaffold was committed unmodified on 2026-09-13 (`11b25f3`) from the team's own working copy, as a baseline; every change after it is a separate commit. The static frontend (by Nash) was added on 2026-09-13 (`0b443ed`). _[TODO(team): confirm the scaffold and frontend were created within the submission period.]_ Third-party: Strands Agents SDK (`strands-agents`, `strands-agents-tools`), `bedrock-agentcore`, FastAPI, Uvicorn, Pydantic, boto3, python-dotenv (see `backend/requirements.txt`); the frontend loads Google Fonts (Fraunces, IBM Plex Sans, IBM Plex Mono).

## Other required fields
- AWS Builder ID: _TODO(team)_
- License: Apache-2.0 (`LICENSE` in repo root)
