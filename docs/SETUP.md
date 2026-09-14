# Credential Bridge — build setup for Claude Code in VS Code

This repo is ready to build *in*. Open the folder in VS Code, start Claude Code, and it will read
`CLAUDE.md` + `.claude/agents` + `.claude/skills` automatically. This file is the human checklist of
everything the project needs.

## 0. One-time accounts / IDs (required by the hackathon)
- **AWS account** with billing (the $50 credit form closed Sep 11; budget a few dollars of Bedrock).
- **AWS Builder ID** — required in the Devpost submission. Create at https://profile.aws.amazon.com/.
- **Bedrock model access** — Console → Bedrock → *Model access* → enable
  Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`) on Amazon Bedrock in **us-west-2**. THIS BLOCKS EVERYTHING; do it first.
- **GitHub repo** (public; Devpost accepts MIT or Apache-2.0 — this repo is Apache-2.0) — License file is in the root so it shows in About.

## 1. Local prerequisites
- Python 3.11+  · Node only for rendering `docs/architecture.png` via `npx @mermaid-js/mermaid-cli` (the frontend is static files at the repo root, no build step)
- AWS CLI configured: `aws configure` (or put keys in backend/.env)
- Docker Desktop (only needed for the AgentCore container path / Option B)
- Claude Code: https://claude.ai/code  (VS Code extension or CLI)

## 2. Python packages (backend/requirements.txt, pinned)
strands-agents[anthropic,web-fetch]==1.55.1 · bedrock-agentcore==1.23.0 · jsonschema · botocore[crt] (needed
for `aws login` sessions) · fastapi · uvicorn · pydantic · boto3 · python-dotenv.
For deploy: `pip install bedrock-agentcore-starter-toolkit` (0.3.12; `agentcore configure / deploy / invoke /
destroy`, the commands in the README; `launch` is now `deploy`). The toolkit recommends the newer AgentCore CLI
(`npm install -g @aws/agentcore`); don't install both.

## 3. Model / region
- Model: Claude Sonnet 4.6 (`us.anthropic.claude-sonnet-4-6`) on Amazon Bedrock. It's the default in
  `backend/app/agent.py`; leave `CREDBRIDGE_MODEL` unset to use it. Region: `us-west-2`.
- Copy backend/.env.example to backend/.env. `app/api.py` loads it at startup, and real environment
  variables override it. Set `CREDBRIDGE_TODAY=2026-09-14` there (or export it) to pin "today" for a
  reproducible demo, then run `./run_local.sh`.
- Credentials from `aws login` also need `backend/.venv/bin/pip install "botocore[crt]"`.

## 4. Reference docs to keep open (paste into Claude Code as needed)
- Strands quickstart: https://strandsagents.com/docs/user-guide/quickstart/
- Strands multi-agent Graph: https://strandsagents.com/docs/api/python/strands.multiagent.graph/
- Strands → AgentCore deploy: https://strandsagents.com/docs/user-guide/deploy/deploy_to_bedrock_agentcore/python/
- AgentCore quickstart (model string confirmed here): https://aws.github.io/bedrock-agentcore-starter-toolkit/examples/agentcore-quickstart-example.html
- builder.aws (blog bonus, 0.2 pts each): https://builder.aws.com/

## 5. MCP servers (optional, for building — NOT shipped in the agent)
The agent itself uses only Strands + Bedrock. These help you *build* faster in Claude Code:
- **GitHub MCP** — commits/PRs from the editor.
- **AWS MCP / docs MCP** — pull Bedrock/AgentCore docs inline.
- A **web-fetch MCP** — only if you extend the KB harvester interactively.
Do not add MCPs to the runtime agent; keep the deployed footprint = Strands + Bedrock (+ AgentCore).

## 6. Specialized agents in this repo (backend/app/agents/)
- **pathway** — the reasoner, serves /reason (build/replan/explain). Grounded on the KB.
- **harvester** — background KB pipeline agent: regulator URL → schema-valid ruleset → kb/store.
- **watcher** — deterministic scan (no model call) that flags dated requirements inside a 45-day window; not exposed via the API yet.
- (checker) — not built.
`backend/app/orchestration/case_graph.py` composes pathway → approval gate → finalize as a Strands Graph; it is not
wired to an endpoint yet, so it is not in the video (see docs/VIDEO_SCRIPT.md).

## 7. Knowledge base / data pipeline (kb/)
- Schema: kb/schema/ruleset.schema.json  (one ruleset per profession × jurisdiction).
- Sources: kb/sources/registry.jsonl  (where each region's rules come from + method).
- Store: kb/store/<JURISDICTION>/<profession>.json  (8 curated rulesets across 7 jurisdictions: RN in CA-ON, CA-BC, US-NY, US-CA, GB, AU, DE; Civil Engineer in CA-ON).
- Validate + index: `python kb/pipeline/build_kb_index.py`  (no AWS).
- Harvest more: `python kb/pipeline/run_harvest.py --profession .. --jurisdiction .. --regulator .. --url ..`

## 8. First Claude Code prompts (suggested)
1. "Read CLAUDE.md and docs/SETUP.md. Confirm the /reason contract and run backend/tests_smoke.py."
2. "Start the server with ./run_local.sh and run the three curl examples from the README. Show me the outputs."
3. "Serve the UI (`python3 -m http.server 8765` from the repo root), open http://localhost:8765/?api=http://localhost:8000 and build Aida's pathway."
4. "Harvest one queued pair from kb/sources/harvest_queue.jsonl (`run_harvest_batch.py --limit 1`), then rebuild the index."
5. "Deploy to AgentCore Runtime with the agentcore CLI; if it fails, log the error in docs/CONTEXT_LOG.md and keep local."

## 9. Submission checklist (Devpost, deadline Sep 14 2026 5:00pm PDT)
Canonical list: `.claude/skills/hackathon-submission/SKILL.md`. Text fields drafted in `docs/DEVPOST.md`.
- [ ] Public repo, Apache-2.0 visible in About (LICENSE in root)
- [ ] README with setup + run
- [ ] Architecture diagram — docs/architecture.png (rendered from docs/ARCHITECTURE.md mermaid)
- [ ] Demo video ≤5 min, public on YouTube/Vimeo — plan in docs/VIDEO_SCRIPT.md
- [ ] AWS Builder ID
- [ ] Optional live demo link (AgentCore URL); otherwise local run instructions + this repo
- [ ] Track: Good Neighbor
- [ ] Pre-existing code disclosed (README + docs/DEVPOST.md)
- [ ] Optional: 1–3 builder.aws posts (docs/blog/*.md, +0.2 each), titled "Agents for Humans: ..."
