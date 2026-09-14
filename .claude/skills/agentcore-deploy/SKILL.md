---
name: agentcore-deploy
description: Deploy the Credential Bridge agent to AgentCore Runtime with the agentcore CLI. Verified runbook (deployed 2026-09-13). Read before deploy work.
---
Entry: backend/agentcore_entrypoint.py (@app.entrypoint invoke(payload) accepts the /reason body).
Verified: starter toolkit 0.3.12, bedrock-agentcore 1.23.0, us-west-2, runtime `credential_bridge`,
CodeBuild build (no Docker), memory disabled. Evidence: docs/evidence/agentcore-invoke-*.txt.

# Prereqs
- AWS profile with rights to create IAM roles, ECR, CodeBuild, AgentCore (we use `credbridge`,
  an IAM user with AdministratorAccess for the hackathon — delete it afterwards). A root `aws login`
  session also works but expires mid-deploy.
- Claude access on Bedrock: Anthropic use-case form submitted once per account (console → Model
  catalog → Claude Sonnet 4.6 → Submit use case details). Takes ~15 min to activate.
- CLI in a scratch venv, not backend/.venv: `python3.11 -m venv /tmp/ac && /tmp/ac/bin/pip install bedrock-agentcore-starter-toolkit`
  (`launch` was renamed `deploy`).

# Deploy — run from the REPO ROOT so kb/ is inside the build context (reference.py reads kb/store)
```bash
export AWS_PROFILE=credbridge AWS_REGION=us-west-2
agentcore configure -e backend/agentcore_entrypoint.py -rf backend/requirements.txt \
                    -n credential_bridge -r us-west-2 -dm -ni
agentcore deploy --auto-update-on-conflict \
  --env CREDBRIDGE_MODEL=us.anthropic.claude-sonnet-4-6 --env AWS_REGION=us-west-2 --env CREDBRIDGE_TODAY=2026-09-14
agentcore invoke '{"profile":{"name":"Aida Torres","profession":"Registered Nurse","countryTrained":"Philippines","targetCountry":"Canada","targetRegion":"Ontario"},"event":"build_pathway","currentSteps":[]}'
agentcore status        # runtime ARN + state
agentcore destroy       # teardown (runtime, ECR repo, roles it created)
```

# Gotchas (all hit for real)
- IAM user with no policies → AccessDenied on GetRole/CreateMemory/InvokeModel. Needs broad rights.
- Without `-dm` the CLI tries to create AgentCore Memory (not needed; sessions live in our store).
- "X-Ray Delivery Destination ... CloudWatch Logs" warning on deploy = observability not enabled; deploy still succeeds.
- Runtime invoke needs SigV4 (or a JWT inbound authorizer): the static frontend can't call it directly.
  Browser → FastAPI `/reason`; AgentCore is demonstrated with `agentcore invoke`. Same agent code.
- Generated `.bedrock_agentcore.yaml` / `Dockerfile` are gitignored.
