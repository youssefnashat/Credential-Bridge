# Architecture

![Architecture](architecture.png)

Rendered from the mermaid below:
`npx -y @mermaid-js/mermaid-cli -i <this-diagram>.mmd -o docs/architecture.png -b white -w 2400`
(copy the block into a `.mmd` file first).

```mermaid
flowchart TB
  subgraph Clients
    FE["Static frontend (repo root)<br/>agent.js adapter → POST /reason"]
    CW["Caseworker tooling<br/>curl · demo_concurrent.py"]
  end

  FE -- "POST /reason" --> API
  CW -- "POST /sessions/{id}/reason<br/>POST /batch · GET /sessions" --> API

  API["FastAPI · backend/app/api.py<br/>/reason · /sessions/{id}/reason<br/>/batch · /sessions · /health"]
  API -- "stateless call" --> AG
  API -- "stateful call" --> ORCH["Session orchestrator<br/>atomic per-session writes<br/>/batch: bounded thread pool"]
  ORCH <--> SS[("Session store<br/>data/sessions/*.json<br/>atomic writes")]
  ORCH --> AG
  API -. "audit line per request" .-> LOG[("data/audit.jsonl")]

  AG["Strands Agent: pathway reasoner<br/>fresh Agent per call · shared BedrockModel<br/>structured output → ReasonResponse<br/>steps[] + logEntry{text,flag}"]
  AG <--> BR["Amazon Bedrock · us-west-2<br/>Claude Sonnet 4.6<br/>us.anthropic.claude-sonnet-4-6"]
  AG -- "@tool today<br/>@tool months_between" --> DT["Deterministic date tools"]
  AG -- "@tool get_regulator_rules" --> LK["reference.lookup()<br/>profile → jurisdiction key"]
  LK -- "1 · primary" --> KB[("Compliance KB · kb/store<br/>8 schema-validated rulesets<br/>valid_at · validity_months<br/>depends_on · source URL")]
  LK -. "2 · fallback" .-> RJ[("regulators.json<br/>compact table<br/>+ unregulated flag")]

  subgraph PIPE["KB pipeline (offline)"]
    HV["Harvester Strands agent<br/>regulator URL → ruleset JSON<br/>needs_review = true"]
    VAL["build_kb_index.py<br/>JSON Schema validation<br/>→ _index.json"]
  end
  HV --> KB
  VAL --> KB

  subgraph RT["Amazon Bedrock AgentCore Runtime"]
    ENTRY["agentcore_entrypoint.py<br/>BedrockAgentCoreApp @entrypoint<br/>deployed: credential_bridge · us-west-2<br/>same payload, same contract"]
  end
  ENTRY -- "same reason()" --> AG

  classDef store fill:#f4f1e8,stroke:#8a7a4a;
  classDef agent fill:#e8f0fb,stroke:#3a62a8;
  class KB,RJ,SS,LOG store;
  class AG,HV agent;
```

## Components
| component | file | role |
|---|---|---|
| HTTP API | `backend/app/api.py` | `/reason` (stateless), `/sessions/{id}/reason` (stateful), `/batch`, `/sessions`, `/health`; CORS; appends one audit line per request to `data/audit.jsonl` |
| Pathway reasoner | `backend/app/agent.py` | a fresh Strands `Agent` per call over one shared `BedrockModel`; tools `get_regulator_rules`, `today`, `months_between`; structured output into `ReasonResponse`, with a validated text-parse fallback; ids renumbered 1..n; then `_ground()` sets `regulator` / `regulatorUrl` from the lookup and drops any step `sourceUrl` not in that jurisdiction's URL set |
| Grounding lookup | `backend/app/reference.py` | maps the free-text profile to a jurisdiction key (`CA-ON`, `US-NY`, `GB`, `AU`, `DE`, …); reads **`kb/store` first**, falls back to `backend/reference/regulators.json`; unknown → `unknown_region`, unregulated → `unregulated: true` |
| Compliance KB | `kb/store/**`, `kb/schema/ruleset.schema.json`, `kb/ontology/credential-ontology.md` | one ruleset per profession × jurisdiction; requirements typed by `kind` with `valid_at`, `validity_months`, `depends_on`, `source` |
| KB pipeline | `kb/pipeline/*.py` | `build_kb_index.py` validates every ruleset against the schema and writes `_index.json` (no AWS); `run_harvest.py` / `run_harvest_batch.py` call the harvester |
| Harvester | `backend/app/agents/harvester.py` | second Strands agent with a web-fetch tool; regulator URL → ruleset JSON with `harvest_method: agent`, `needs_review: true` |
| Session orchestrator | `backend/app/orchestration/orchestrator.py`, `session_store.py` | seeds `currentSteps` from the stored session when a request sends `[]`; writes each session's state atomically under a per-session lock; `/batch` runs sessions concurrently on a bounded `ThreadPoolExecutor` (`CREDBRIDGE_MAX_CONCURRENCY`) |
| AgentCore entrypoint | `backend/agentcore_entrypoint.py` | `BedrockAgentCoreApp` `@app.entrypoint` accepting the `/reason` body; same `reason()`; deployed as Runtime `credential_bridge` (us-west-2, built with CodeBuild, memory off); invoked with SigV4, so the UI calls FastAPI |

**In the repo, not on the request path yet:** `backend/app/orchestration/case_graph.py` (a Strands
`GraphBuilder` graph: pathway node → finalize node behind a conditional edge on
`invocation_state["approved"]`, i.e. a human-approval gate) and `backend/app/agents/watcher.py` (a
deterministic scan that flags dated requirements within a 45-day window, no model call). Neither is
exposed through an endpoint, so neither appears in the diagram or the demo.

## Why this shape
- **Grounded, not generated from memory.** The agent calls `get_regulator_rules` first; the KB is the primary source and the compact table only fills gaps. The model reasons over returned data, so each step can be traced to a source URL.
- **Judgment is in the model; arithmetic is in tools.** `today` (pinnable via `CREDBRIDGE_TODAY`) and `months_between` do the date math. Sequencing, which dependency collides, the unregulated-profession call, and the explanation come from the agent.
- **The KB encodes *when* a document must be valid.** `valid_at` ∈ {application, registration_decision, exam, continuous} is what lets the agent detect an expiry collision instead of just listing documents.
- **One contract, two runtimes.** FastAPI and the AgentCore entrypoint call the same `reason()` with the same pydantic models. The UI calls FastAPI; the Runtime is invoked with SigV4-signed AWS requests.
- **State outside the agent.** Session state lives in the session store, keyed by session id, so cases are isolated from each other.

## Event behaviour (as instructed by the system prompt)
| event | agent is instructed to | flag |
|---|---|---|
| build_pathway | grounded, ordered pathway + opening summary + honest timeframe | false |
| simulate_delay | pick a real dependent pair in `currentSteps`, mark affected steps at-risk, explain with actual dates and a concrete recommendation | true |
| simulate_rejection | mark an early step at-risk, insert a remediation step after it, renumber, set blocked dependents to not-started, explain | true |
| reset | regenerate the clean pathway | false |
| (unregulated profession) | 2–3 work-authorization steps; state that no practice licence is required | false |
