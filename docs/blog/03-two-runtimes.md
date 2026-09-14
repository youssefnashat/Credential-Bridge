# Agents for Humans: one Strands agent, two runtimes (FastAPI locally, AgentCore Runtime)

*Build log — Credential Bridge, Good Neighbor track.*

## The constraint
Our frontend is a static site a teammate built in parallel, with its own view model: timeline steps with
an "authority", and a reasoning log made of entries. Rather than bend either side to the other, we
defined the backend contract once as pydantic models and put a small adapter in the frontend's
`agent.js` that maps the UI's model onto `POST /reason` and maps the reply back, rejecting anything that
isn't in the contract shape. We also wanted a zero-friction local dev loop *and* a managed deployment on
Amazon Bedrock AgentCore Runtime, which the hackathon rules say strengthens the Technical Implementation
score.

## The shape that made it easy
We kept the agent pure — a `reason(request) -> response` function over grounded data, with the contract
defined once as pydantic models — and gave it two thin adapters.

**FastAPI**, for local dev and the UI (simplified; the real handler also writes an audit line):
```python
@app.post("/reason", response_model=ReasonResponse)
def do_reason(req: ReasonRequest):
    return reason(req, agent=_agent())
```

**AgentCore Runtime**, the same function behind AWS's managed runtime:
```python
app = BedrockAgentCoreApp()
_AGENT = None

@app.entrypoint
def invoke(payload: dict, context=None):
    global _AGENT
    if _AGENT is None:
        _AGENT = build_agent()
    return reason(ReasonRequest.model_validate(payload), agent=_AGENT).model_dump()
```

Same reasoning, same contract, two entry points.

## The bug the shared agent hid
Both adapters hold one agent for the whole process, which looks efficient. But a Strands `Agent` keeps
its conversation history across calls, and it raises a `ConcurrencyException` if two calls overlap.
Shared naively, one applicant's case would leak into the next caseworker's answer. So `reason()` treats
the shared agent as a template: it builds a fresh `Agent` for every request from the same model client
and system prompt. The client is shared, and the conversation isn't.

## Deploying it
We used the starter toolkit's `agentcore` CLI (`pip install bedrock-agentcore-starter-toolkit`, 0.3.12),
from the repo root:

```bash
agentcore configure -e backend/agentcore_entrypoint.py -rf backend/requirements.txt -n credential_bridge -r us-west-2 -dm -ni
agentcore deploy --env CREDBRIDGE_MODEL=us.anthropic.claude-sonnet-4-6 --env AWS_REGION=us-west-2
agentcore invoke '{"profile":{"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},"event":"build_pathway","currentSteps":[]}'
agentcore destroy   # when you're done
```

The container was built with CodeBuild, so we needed no local Docker, and we left AgentCore memory off
because our session state already lives outside the agent. The first live `invoke` returned a grounded
Ontario pathway with the College of Nurses of Ontario as the regulator, the same shape FastAPI returns.

Gotchas worth saving you an hour:
- In toolkit 0.3.12, `launch` is now `deploy`. The toolkit also prints a notice that it's no longer
  supported and points to the newer AgentCore CLI (`npm install -g @aws/agentcore`). Pick one; don't
  install both.
- Runtime containers are linux/arm64, the execution role needs `bedrock:InvokeModel`, and the model
  has to be available to your account in that region. Claude 3.7 Sonnet had gone end-of-life on
  Bedrock, so we passed Claude Sonnet 4.6 in with `--env`.
- Pin your requirements. The Runtime installs from `backend/requirements.txt`, so we pinned it to the
  versions we'd verified locally (strands-agents 1.55.1, bedrock-agentcore 1.23.0).

## What the browser calls
The Runtime is invoked with SigV4-signed AWS requests, so a static page can't call it the way it calls
`localhost:8000/reason`. The UI keeps calling FastAPI. Its backend base URL is a query parameter
(`?api=`), so switching backends is a URL change, not a code change. Putting the UI in front of the
Runtime needs a small authenticated proxy, which is our next step.

## Why this matters beyond the hackathon
The pattern — pure agent core, thin runtime adapters, a schema-validated contract — is how you avoid
rewriting an agent when it moves from a laptop to a managed runtime.

*Built with the Strands Agents SDK, Claude Sonnet 4.6 (us.anthropic.claude-sonnet-4-6) on Amazon Bedrock,
and Amazon Bedrock AgentCore Runtime.*
