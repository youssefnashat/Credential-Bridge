"""Rule Harvester — specialized background agent. Given a profession + jurisdiction + regulator
URL, fetches the page and extracts a JurisdictionRuleSet (schema-valid) with the source URL.
Runs unattended to populate the KB. Never fabricates: unknown -> null, needs_review stays true."""
from __future__ import annotations
import json, os
from datetime import datetime, timezone
from strands import Agent
from strands.models import BedrockModel
from strands.vended_tools import http_request  # core strands>=1.55 (httpx), always importable

MODEL_ID = os.getenv("CREDBRIDGE_HARVEST_MODEL", "us.anthropic.claude-3-7-sonnet-20250219-v1:0")
REGION = os.getenv("AWS_REGION", "us-west-2")

def _fetch_tool():
    # web_fetch(markdown) = page -> clean markdown, no nested model call. Needs the optional
    # `strands-agents[web-fetch]` extra (bs4 + markdownify); without it, raw GET via http_request.
    # (Plain `web_fetch` defaults to mode='agentic', which spawns a second analyst model call.)
    try:
        from strands.vended_tools.web_fetch import make_web_fetch
    except ImportError:
        return http_request
    return make_web_fetch(mode="markdown")

SYSTEM = """You are the Rule Harvester for a credential-recognition knowledge base.
Given a profession, a jurisdiction key (e.g. CA-ON), a regulator name and a URL, fetch the page
(you may follow at most 2 internal links specifically about registration for internationally
educated / overseas-qualified applicants) and extract the licensing requirements.

Output a JurisdictionRuleSet: profession, jurisdiction, regulator, gateway (or null), regulated
(bool), source (the URL you actually read), requirements[] each with order, kind
(evaluation|language|exam|experience|bridging|registration|document|fee|background_check|other),
name, body, detail, validity_months (or null), valid_at
(application|registration_decision|exam|continuous|null), depends_on[] (names), and source.

Hard rules: state only what the page supports. Unknown fields are null. Set confidence 0-1 for how
complete/explicit the page was, and needs_review=true unless it was fully explicit. harvest_method
is 'agent'. Output ONLY the JSON object."""

def build_harvester() -> Agent:
    model = BedrockModel(model_id=MODEL_ID, region_name=REGION, max_tokens=3000, temperature=0.1)
    return Agent(model=model, tools=[_fetch_tool()], system_prompt=SYSTEM, callback_handler=None)

def harvest(profession: str, jurisdiction: str, regulator: str, url: str, agent: Agent | None = None) -> dict:
    # fresh Agent per page: a reused Agent keeps every prior page in agent.messages
    agent = Agent(model=agent.model, tools=[_fetch_tool()], system_prompt=SYSTEM, callback_handler=None) \
        if isinstance(agent, Agent) else (agent or build_harvester())
    prompt = (f"profession: {profession}\njurisdiction: {jurisdiction}\nregulator: {regulator}\n"
              f"url: {url}\nharvested_at: {datetime.now(timezone.utc).isoformat()}\n"
              "Fetch and return the JurisdictionRuleSet JSON.")
    raw = str(agent(prompt))
    import re
    for b in sorted(re.findall(r"\{.*\}", raw, re.S), key=len, reverse=True):
        try:
            d = json.loads(b)
            d.setdefault("profession", profession); d.setdefault("jurisdiction", jurisdiction)
            d.setdefault("regulator", regulator); d.setdefault("source", url)
            d.setdefault("harvested_at", datetime.now(timezone.utc).isoformat())
            d.setdefault("harvest_method", "agent"); d.setdefault("needs_review", True)
            return d
        except Exception:
            continue
    raise ValueError("harvester returned no valid ruleset JSON")
