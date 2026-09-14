# Lanes — one Claude Code session per lane, all running in parallel

Orchestrator session: **aws-hackathon-6a** (owns the board, runs QA, is the ONLY committer).
Repo: `/Users/tech/Desktop/AWS HACKATHON /AWS-HACKATHON-credential-bridge` — note the trailing space in `AWS HACKATHON `; always quote paths.

Lanes are split by **file ownership**, so lanes run in parallel without colliding. A task that needs
files from two lanes is sequenced by the orchestrator (one lane finishes, the next starts).

| lane | session | role file | owns (edit only these) | now | next |
|---|---|---|---|---|---|
| orchestrator | aws-hackathon-6a | .claude/skills/build-loop | docs/TASKS.md, docs/CONTEXT_LOG.md, docs/LANES.md, .claude/** (except lane-owned skills), git | QA + commits | — |
| strands | aws-hackathon-09 | .claude/agents/strands-engineer.md | backend/app/agent.py, backend/app/agents/**, backend/app/orchestration/case_graph.py, backend/tests_offline.py | standby — T3 finishing | T8 (needs AWS) |
| grounding | aws-hackathon-c6 | .claude/agents/grounding-engineer.md | backend/app/reference.py, backend/reference/**, kb/** | standby — T7 finishing | T11 (needs AWS) |
| api-deploy | aws-hackathon-aa | .claude/agents/api-deploy-engineer.md | backend/app/api.py, backend/app/orchestration/orchestrator.py, backend/app/orchestration/session_store.py, backend/agentcore_entrypoint.py, backend/run_local.sh, backend/requirements.txt, backend/demo_concurrent.py, .claude/skills/agentcore-deploy/** | T14 | T4, T10 |
| frontend | aws-hackathon-78 | (none yet) | frontend/** once located | T15 | T12 |
| submission | aws-hackathon-d2 | .claude/agents/submission-pm.md | README.md, docs/** (except TASKS, CONTEXT_LOG, LANES, evidence), .claude/skills/hackathon-submission/** | standby — T5 finishing | Devpost + blog polish |
| eval | aws-hackathon-c2 | .claude/agents/qa-verifier.md | backend/eval_run.py, docs/evidence/** (except url-check.md) | T16 | T9 (needs AWS) |

`backend/tests_smoke.py` is shared: only the task that names it may edit it, and the orchestrator sequences those.

## Session protocol (every lane session follows this)
1. Work only on the task the orchestrator assigned you, and only in your lane's files.
2. Never `git add/commit/push`, never edit docs/TASKS.md, docs/CONTEXT_LOG.md, or docs/LANES.md.
3. When done, SendMessage to `aws-hackathon-6a`:
   `DONE T#: <files changed> | proof: <command + output tail> | new: <task candidates or none>`.
   The orchestrator runs qa-verifier, commits, and replies with PASS + your next task or FAIL + problems.
4. Need a file outside your lane, found new work, or blocked → SendMessage `NEED T#: …` and wait. Don't edit it.
5. Use `backend/.venv/bin/python`. Do not `pip install` into the shared venv — use a scratch venv.
6. No AWS calls until the orchestrator announces H1 cleared. Never push, deploy, publish, or submit.

## Budget mode (from 2026-09-13 late evening — user asked to be mindful of tokens)
- Idle lanes stay idle; the orchestrator only messages a lane when assigning a task. Don't poll, don't send FYIs.
- DONE reports ≤ 12 lines: files · proof tail · new (one line each).
- Orchestrator runs mechanical checks itself; one batched reviewer (cheaper model) covers judgment probes for several tasks at once instead of one full reviewer per task.
- No new P2 work until the deadline path (Bedrock live run → eval → video) is unblocked.
