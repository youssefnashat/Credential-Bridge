# Credential Bridge — build setup for Claude Code in VS Code

This repo is ready to build *in*. Open the folder in VS Code, start Claude Code, and it will read
`CLAUDE.md` + `.claude/agents` + `.claude/skills` automatically. This file is the human checklist of
everything the project needs.

## 0. One-time accounts / IDs (required by the hackathon)
- **AWS account** with billing (the $50 credit form closed Sep 11; budget a few dollars of Bedrock).
- **AWS Builder ID** — required in the Devpost submission. Create at https://profile.aws.amazon.com/.
- **Bedrock model access** — Console → Bedrock → *Model access* → enable
  `Anthropic Claude 3.7 Sonnet` in **us-west-2**. THIS BLOCKS EVERYTHING; do it first.
- **GitHub repo** (public; Devpost accepts MIT or Apache-2.0 — this repo is Apache-2.0) — License file is in the root so it shows in About.

## 1. Local prerequisites
- Python 3.11+  · Node only for rendering `docs/architecture.png` via `npx @mermaid-js/mermaid-cli` (frontend is separate)
- AWS CLI configured: `aws configure` (or put keys in backend/.env)
- Docker Desktop (only needed for the AgentCore container path / Option B)
- Claude Code: https://claude.ai/code  (VS Code extension or CLI)

## 2. Python packages (backend/requirements.txt)
strands-agents · strands-agents-tools · fastapi · uvicorn · pydantic · boto3 · python-dotenv ·
bedrock-agentcore  (+ jsonschema optional, for strict KB validation).
For deploy, pick ONE: `pip install bedrock-agentcore-starter-toolkit` (`agentcore configure/launch/invoke`, the
commands in the README) or the newer AgentCore CLI `npm install -g @aws/agentcore` (`create/dev/deploy/invoke`),
which the Strands docs say replaces the toolkit. Having both installed conflicts.

## 3. Model / region
- Model: `us.anthropic.claude-3-7-sonnet-20250219-v1:0`  · Region: `us-west-2`
- Copy backend/.env.example to backend/.env. The app does **not** auto-load `.env`; export it into the shell
  before starting: `set -a; source .env; set +a; export CREDBRIDGE_TODAY=2026-09-14; ./run_local.sh`.

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
- Store: kb/store/<JURISDICTION>/<profession>.json  (8 curated rulesets: RN in CA-ON, CA-BC, US-NY, US-CA, GB, AU, DE; Civil Engineer in CA-ON).
- Validate + index: `python kb/pipeline/build_kb_index.py`  (no AWS).
- Harvest more: `python kb/pipeline/run_harvest.py --profession .. --jurisdiction .. --regulator .. --url ..`

## 8. First Claude Code prompts (suggested)
1. "Read CLAUDE.md and docs/SETUP.md. Confirm the /reason contract and run backend/tests_smoke.py."
2. "Start the server with ./run_local.sh and run the three curl examples from the README. Show me the outputs."
3. "If build_pathway works, wire the frontend getAgentReasoning() to localhost:8000/reason and confirm."
4. "Add CA-BC and US-CA nurse rulesets to the KB by harvesting, then rebuild the index."
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
