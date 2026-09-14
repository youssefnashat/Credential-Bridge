---
name: agentcore-deploy
description: Deploy the Credential Bridge agent to AgentCore Runtime with the agentcore CLI. Read before deploy work.
---
Entry: backend/agentcore_entrypoint.py (@app.entrypoint invoke(payload) accepts the /reason body).
Steps:
1. pip install bedrock-agentcore bedrock-agentcore-starter-toolkit  (gives the `agentcore` CLI; uninstall any old starter-toolkit CLI that conflicts)
2. agentcore configure --entrypoint agentcore_entrypoint.py --name credential-bridge
3. agentcore launch
4. agentcore invoke '{"profile":{...},"event":"build_pathway","currentSteps":[]}'
Gotchas: Runtime is ARM64; model must be enabled in us-west-2; IAM role needs bedrock:InvokeModel. Time-box 2h, else ship local + document.
