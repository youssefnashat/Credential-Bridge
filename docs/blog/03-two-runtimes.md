# Agents for Humans: one Strands agent, two runtimes (FastAPI locally, AgentCore Runtime)

*Build log — Credential Bridge, Good Neighbor track.*

## The constraint
Our frontend is a static site that calls `POST /reason` with a fixed request/response shape. Whatever
backend we built had to match that contract exactly. We also wanted a zero-friction local dev loop *and*
a path to a managed deployment on Amazon Bedrock AgentCore Runtime, which the hackathon rules say
strengthens the Technical Implementation score.

## The shape that made it easy
We kept the agent pure — a `reason(request) -> response` function over grounded data, with the contract
defined once as pydantic models — and gave it two thin adapters.

**FastAPI**, for local dev and the demo (simplified; the real handler also writes an audit line):
```python
@app.post("/reason", response_model=ReasonResponse)
def do_reason(req: ReasonRequest):
    return reason(req, agent=_agent())   # agent built lazily on first request
```

**AgentCore Runtime**, the same function behind AWS's managed runtime:
```python
app = BedrockAgentCoreApp()

@app.entrypoint
def invoke(payload: dict, context=None):
    return reason(ReasonRequest.model_validate(payload), agent=_AGENT).model_dump()
```

Same reasoning, same contract, two entry points. The frontend's `fetch()` URL is the only thing that
should change between local and cloud.

## The gotcha worth saving you an hour
The deploy tooling changed. The Strands deployment guide now points to the AgentCore CLI
(`npm install -g @aws/agentcore`, with `create` / `dev` / `deploy` / `invoke`), which replaces the pip
package `bedrock-agentcore-starter-toolkit` (whose CLI uses `configure` / `launch` / `invoke`). Having
both installed causes conflicts, so pick one. With the starter toolkit, the flow is:

```bash
agentcore configure --entrypoint agentcore_entrypoint.py --name credential-bridge
agentcore launch
agentcore invoke '{"profile":{...},"event":"build_pathway","currentSteps":[]}'
```

AgentCore Runtime runs linux/arm64 containers, the model has to be enabled in the same region (we use
us-west-2), and the execution role needs `bedrock:InvokeModel`.

_[TODO(team): replace this paragraph with what actually happened on `launch`/`deploy` — the URL, any
errors, and how long it took. As of this draft the entrypoint is written but not yet deployed.]_

## Why this matters beyond the hackathon
The pattern — pure agent core, thin runtime adapters, a schema-validated contract — is how you avoid
rewriting an agent when it moves from a laptop to a managed runtime.

*Built with the Strands Agents SDK and Amazon Bedrock AgentCore.*
