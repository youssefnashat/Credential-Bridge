# Credential Bridge — project brain (Claude Code reads this first, every session)

## MODE: hackathon sprint (NOT a long-lived platform build)
Deadline **Mon Sep 14 2026, 5:00pm PT / 8:00pm ET**. Submit by 6pm ET. Optimize for a WORKING DEMO
and a stable contract, not architecture. Bias: smallest change that makes the demo real. Do not
add infra, frameworks, or abstractions that aren't needed to film the video and pass judging.

## What this is
A Strands agent that reasons about an internationally trained professional's licensing pathway,
grounded in a per-jurisdiction compliance knowledge base. A separate static frontend calls
`POST /reason`. `backend/` is the agent behind that contract; `kb/` is the knowledge base + pipeline.

## THREE ways this project loses — guard against all three
1. **Contract drift** — the frontend depends on `/reason`. Change `backend/app/schemas.py` with
   OPTIONAL fields only. Run `python backend/tests_smoke.py` before every push.
2. **Fabricated regulator data** — never invent a regulator, exam, body, or URL. Everything comes
   from `kb/store/**` (schema `kb/schema/ruleset.schema.json`) or `backend/reference/regulators.json`.
   Unknown -> null / say "not in KB".
3. **Over-engineering / "form-wizard" reasoning** — the pathway, conflict detection, and
   explanations must come from the model via structured output, not templated strings. Keep date
   math in tools, decisions in the agent.

## The contract (do not break)
`POST /reason` { profile{name,profession,countryTrained,targetCountry,targetRegion}, event, currentSteps[] }
 -> { steps[]{id,title,status,detail,source,sourceUrl}, logEntry{text,flag}, regulator?, regulatorUrl? }
events: build_pathway | simulate_delay | simulate_rejection | reset
status: complete|in-progress|upcoming|not-started|at-risk ; ids 1..n contiguous.
professions: Registered Nurse, Physician, Civil Engineer, Software Engineer(UNREGULATED case), Teacher
regions in KB (nurse): CA-ON, CA-BC, US-NY, US-CA, GB, AU, DE (+ CA-ON civil eng). Extend via kb/pipeline/run_harvest_batch.py.

## Repo map
- backend/app/agent.py ......... reasoner (serves /reason); tools: get_regulator_rules, today, months_between
- backend/app/agents/ .......... specialized agents: harvester (KB pipeline), watcher (dormant), pathway (re-export)
- backend/app/reference.py ..... grounding: reads kb/store first, falls back to regulators.json
- backend/app/api.py ........... FastAPI /reason /health, CORS, audit log
- backend/app/orchestration/ ... session_store (concurrent per-session state), orchestrator (parallel sessions), case_graph (Strands Graph)
- backend/agentcore_entrypoint.py  AgentCore Runtime (agentcore CLI)
- backend/demo_concurrent.py ... fires N caseworker sessions at once (the concurrency demo)
- kb/ontology/credential-ontology.md  shared domain model (entities, valid_at, conflict types)
- backend/tests_smoke.py ....... NO-AWS contract + grounding check — run before pushing
- kb/schema/ruleset.schema.json  the KB contract (compliance rules per profession x jurisdiction)
- kb/store/<JURIS>/<prof>.json .. curated rulesets (CA-ON, US-NY, GB, AU) + agent-harvested ones
- kb/sources/registry.jsonl .... where each jurisdiction's rules come from (pipeline input)
- kb/pipeline/ ................. kb_store (load/validate), build_kb_index, run_harvest
- docs/ ........................ ARCHITECTURE, VIDEO_SCRIPT, BLOG_PLAN, SETUP, CONTEXT_LOG

## Commands
```
# backend (needs AWS + model enabled)
cd backend && cp .env.example .env       # AWS_REGION=us-west-2; Anthropic use-case form already submitted; `aws login` if calls fail
./run_local.sh                            # uvicorn :8000
python tests_smoke.py                     # NO AWS — contract + grounding
# KB pipeline (validation is no-AWS; harvest needs AWS)
python kb/pipeline/build_kb_index.py      # validate all rulesets + write _index.json
python kb/pipeline/run_harvest.py --profession "Registered Nurse" --jurisdiction CA-BC \
   --regulator "BCCNM" --url https://www.bccnm.ca/RN/applications_registration/Pages/Default.aspx
# orchestration / concurrency
python backend/demo_concurrent.py           # after ./run_local.sh — many sessions at once
# expand KB unattended
python kb/pipeline/run_harvest_batch.py --limit 5

# deploy
cd backend && agentcore configure --entrypoint agentcore_entrypoint.py --name credential-bridge && agentcore launch
```

## Model / region (verified)
us.anthropic.claude-sonnet-4-6 on us-west-2 — verified live 2026-09-13 (7/7 eval). 3.7 Sonnet is EOL; Sonnet 5 isn't offered to this account. Pin CREDBRIDGE_TODAY=2026-09-14 for a
deterministic demo so expiry dates don't drift while filming.

## Build order for the sprint (do these, in order)
1. `cp .env.example .env`, enable model in Bedrock, `./run_local.sh`, run the 3 README curls. Confirm reasoning.
2. Point frontend getAgentReasoning() at localhost:8000/reason; confirm the two halves talk.
3. Film: build_pathway → simulate_delay (dated re-plan) → Software Engineer unregulated case.
4. (If time) `agentcore launch`; swap frontend URL to the Runtime URL.
5. Publish 3 builder.aws posts (docs/blog/*.md). Fill the eval/accuracy line in README.
6. Devpost: repo URL, Apache-2.0 (already in About via LICENSE), architecture image, YouTube link, AWS Builder ID.

## Conventions
- Python 3.11+, pydantic at boundaries. Small commits (feat:/fix:/docs:). Append docs/CONTEXT_LOG.md each session.
- Subagents in .claude/agents, skills in .claude/skills — already tuned to THIS build.
