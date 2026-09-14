# Agents for Humans: one Strands agent, two runtimes (FastAPI locally, AgentCore in prod)

*Build log — Credential Bridge, Good Neighbor track.*

## The constraint
A teammate had already built a static frontend that calls `POST /reason` with a fixed request/response
shape. Whatever backend we built had to match that contract exactly, and we wanted both a
zero-friction local dev loop *and* a real managed deployment for the "live demo scores higher" points.

## The shape that made it easy
We kept the agent pure — a `reason(request) -> response` function over grounded data — and gave it two
thin adapters:

**FastAPI**, for local dev and the demo:
```python
@app.post("/reason", response_model=ReasonResponse)
def do_reason(req: ReasonRequest):
    return reason(req, agent=_agent())   # lazy Bedrock client, cold-start friendly
```

**AgentCore Runtime**, the same agent behind AWS's managed serverless runtime:
```python
app = BedrockAgentCoreApp()
@app.entrypoint
def invoke(payload: dict, context=None):
    return reason(ReasonRequest.model_validate(payload), agent=_AGENT).model_dump()
```

Same reasoning, same contract, two entry points. The frontend's `fetch()` URL is the only thing that
changes between local and cloud.

## The gotcha worth saving you an hour
AWS renamed the deploy tooling: the `agentcore` CLI replaces the old
`bedrock-agentcore-starter-toolkit` CLI, and if the old one is installed they conflict. Uninstall it
first. Then it's three commands:

```bash
agentcore configure --entrypoint agentcore_entrypoint.py --name credential-bridge
agentcore launch
agentcore invoke '{"profile":{...},"event":"build_pathway","currentSteps":[]}'
```

Runtime containers are ARM64 and the model has to be enabled in the same region (us-west-2 for
Claude 3.7 Sonnet). Pin those and it just works.

## Why this matters beyond the hackathon
The pattern — pure agent core, thin runtime adapters, a schema-validated contract — is how you avoid
rewriting an agent when it graduates from a laptop to production. Which is the whole point of building
on Strands and AgentCore in the first place.

*Built with the Strands Agents SDK and Amazon Bedrock AgentCore.*
