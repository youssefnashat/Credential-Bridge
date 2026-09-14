# Architecture

```mermaid
flowchart LR
  FE["Frontend static site<br/>getAgentReasoning(profile,event)"] -- "POST /reason" --> API["FastAPI<br/>/reason · /health · CORS · audit log"]
  API --> AG["Strands Agent<br/>Claude 3.7 Sonnet · Bedrock us-west-2<br/>structured output → contract"]
  AG -- get_regulator_rules --> REF["regulators.json<br/>multi-region, grounded, source URLs"]
  AG -- today / months_between --> CALC["deterministic date tools<br/>(expiry & prerequisite math)"]
  AG --> OUT["steps[] + logEntry{text,flag}"]
  OUT --> FE
  subgraph Deploy
    ENTRY["agentcore_entrypoint.py<br/>@app.entrypoint"] --> RT["AgentCore Runtime<br/>same agent, same contract"]
  end
  API -. audit .-> LOG["data/audit.jsonl"]
```

**Why this shape.**
- **Grounded, not generative-from-memory.** Every step is based on `get_regulator_rules`; the model reasons over regulator data instead of recalling it, so a judge can trace each step to a source URL.
- **Judgment is visible.** Date math lives in deterministic tools; the *decisions* (sequencing, conflict detection, the unregulated-profession call, the re-plan explanation) come from the agent — which is what makes this an agent and not a form wizard.
- **One contract, two runtimes.** The identical agent serves both FastAPI (local/dev, easy demo) and AgentCore Runtime (managed), so the frontend never changes.

## Event behaviour
| event | agent does |
|---|---|
| build_pathway | grounded, ordered pathway + opening summary + timeframe (flag=false) |
| simulate_delay | finds a real expiry/prereq collision in currentSteps, marks steps at-risk, explains with actual dates (flag=true) |
| simulate_rejection | marks early step at-risk, inserts remediation step, blocks dependents, explains (flag=true) |
| reset | regenerates the clean pathway (flag=false) |
