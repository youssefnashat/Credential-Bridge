---
name: orchestration
description: How Credential Bridge runs many caseworker sessions concurrently and composes specialized agents. Read before touching backend/app/orchestration.
---
# Two axes
1. Session concurrency: POST /sessions/{id}/reason. Orchestrator holds ONE shared Strands agent +
   a bounded ThreadPool (CREDBRIDGE_MAX_CONCURRENCY). session_store gives per-session locks +
   atomic writes: different sessions parallel, same session serialized. State in data/sessions/, not the agent.
2. Multi-agent per case: backend/app/orchestration/case_graph.py = Strands GraphBuilder,
   pathway -> approval edge (invocation_state.approved) -> finalize. harvester feeds KB; watcher dormant.
# Rules
- Never store case state inside the agent; the agent is stateless per call.
- Respect Bedrock limits — cap concurrency, don't remove the pool.
- POST /batch runs many (session_id, request) jobs at once (demo of simultaneous sessions).
- On AgentCore Runtime each session is a microVM already; keep local semantics identical.
# Demo
python backend/demo_concurrent.py  (5 caseworkers at once) then GET /sessions.
