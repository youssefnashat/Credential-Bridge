"""AgentCore Runtime entrypoint. Accepts the same /reason payload shape.
Deploy with the AgentCore CLI (see README Option A)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from app.schemas import ReasonRequest
from app.agent import build_agent, reason

app = BedrockAgentCoreApp()
_AGENT = None


@app.entrypoint
def invoke(payload: dict, context=None):
    """payload matches POST /reason body: {profile, event, currentSteps}."""
    global _AGENT
    if _AGENT is None:
        _AGENT = build_agent()
    req = ReasonRequest.model_validate(payload)
    return reason(req, agent=_AGENT).model_dump()


if __name__ == "__main__":
    app.run()
