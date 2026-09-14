# Build-loop task board (the orchestrator reads + rewrites this every tick)

Protocol: `.claude/skills/build-loop/SKILL.md`. Deadline Mon Sep 14 2026 5:00pm PT — submit by 3:00pm PT.

Status: `READY` · `RUNNING` · `REVIEW` · `DONE` · `BLOCKED(<why>)` · `HUMAN` (never auto-run)
Two tasks may run at once only if their **files** columns don't overlap.

## Human gates (the loop cannot do these — they unblock everything tagged `needs:`)
| id | status | what | unblocks |
|---|---|---|---|
| H1 | HUMAN | AWS credentials on this machine (`aws configure` / `aws login`) + Bedrock model access in us-west-2 | T8, T9, T10, T11 |
| H2 | HUMAN | Where is the frontend (`getAgentReasoning()`)? repo/path | T12 |
| H3 | HUMAN | OK to push to github.com/youssefnashat/Credential-Bridge (and from which account) | T13 |
| H4 | HUMAN | AWS Builder ID, record + upload YouTube video, publish builder.aws posts, submit Devpost | — |

## Auto tasks
| id | pri | status | owner | files | task | done-when |
|---|---|---|---|---|---|---|
| T1 | P0 | REVIEW | grounding-engineer | backend/app/reference.py, backend/tests_smoke.py | Fix `_region_key`: non-CA countries all map to `US-*` (Germany→`US-GE`), so DE/GB/AU rulesets are unreachable from natural profiles | every kb/store ruleset resolves `source:"kb"` from a natural profile; smoke passes |
| T2 | P0 | DONE | orchestrator | .claude/settings.json, .claude/hooks/** | Push gate never blocks (bad matcher; smoke fails with exit 1, hooks block only on 2) | verified: non-push exit 0 · healthy push exit 0 · broken repo push exit 2 |
| T3 | P0 | RUNNING | strands-engineer | backend/app/agent.py, backend/app/agents/**, backend/app/orchestration/case_graph.py | Verify every Strands call against the INSTALLED SDK (structured_output, BedrockModel params, GraphBuilder edge-condition signature, harvester fetch-tool import); fix mismatches; add no-AWS construction test | build_agent(), build_harvester(), build_case_graph() construct offline; smoke passes |
| T4 | P1 | READY(after T1) | api-deploy-engineer | backend/app/orchestration/session_store.py, backend/app/orchestration/orchestrator.py, backend/app/api.py, backend/tests_smoke.py | session_store writes to cwd-relative `data/sessions` (breaks under AgentCore / other cwd); prior-steps seed read outside the session lock; smoke test pollutes real session dir | paths repo-anchored or env-set; seed inside lock; smoke uses temp dir |
| T5 | P1 | RUNNING | submission-pm | README.md, docs/*.md (not TASKS/CONTEXT_LOG), docs/architecture.png, .claude/skills/hackathon-submission/** | Reconcile docs with verified Devpost rules; skill's video beats (harvester/checker/packet) contradict VIDEO_SCRIPT.md; README arch block omits KB | every README claim reproducible by a documented command; one consistent video plan |
| T6 | P1 | RUNNING(merged into T5) | submission-pm | docs/architecture.png, docs/ARCHITECTURE.md | Render architecture diagram to PNG (Devpost upload) | PNG exists and matches code |
| T7 | P2 | RUNNING | grounding-engineer | kb/store/**, kb/sources/**, docs/evidence/url-check.md | Check every source URL in KB + regulators.json resolves; dead → `needs_review:true` + note. Never invent replacements | report of URL status committed in docs/evidence/url-check.md |
| T8 | P0 | BLOCKED(H1) | strands-engineer | backend/.env, backend/app/agent.py | Confirm the model ID is invocable in us-west-2 (`aws bedrock list-inference-profiles`); Claude 3.7 Sonnet may be legacy — switch to a current Claude on Bedrock if not | one live build_pathway returns a valid contract |
| T9 | P0 | BLOCKED(H1,T8) | qa-verifier | docs/evidence/** | Run the 3 README curls + simulate_rejection + reset; save outputs; score grounding (every sourceUrl present in KB) → the README accuracy line | docs/evidence/*.json + accuracy number |
| T10 | P1 | BLOCKED(H1,T8) | api-deploy-engineer | backend/** deploy files | `agentcore launch` (time-box 2h) | Runtime URL invokes, or failure logged in CONTEXT_LOG |
| T11 | P2 | BLOCKED(H1) | grounding-engineer | kb/store/** | `run_harvest_batch.py --limit 3`, then human-review diffs | new rulesets validate, needs_review=true |
| T12 | P0 | BLOCKED(H2) | api-deploy-engineer | frontend call site | Point frontend at /reason; verify all 4 events render | demo path works end-to-end |
| T13 | P0 | BLOCKED(H3) | orchestrator | — | Push commits | remote matches local |
