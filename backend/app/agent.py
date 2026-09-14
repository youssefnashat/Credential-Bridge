"""Credential Bridge reasoning agent (Strands Agents SDK).

The agent reasons over grounded regulator reference data to (1) build a personal licensing
pathway, (2) detect prerequisite/expiry conflicts on an event, and (3) explain the change in
plain language referencing the actual dates/values. Output is validated against the frontend
contract via pydantic structured output — never templated strings.
"""
from __future__ import annotations
import json, logging, os
from datetime import date
from functools import lru_cache
from typing import Any

from strands import Agent, tool
from strands.models import BedrockModel, Model

from .schemas import ReasonRequest, ReasonResponse, Step, LogEntry
from .reference import lookup

log = logging.getLogger("credbridge.agent")

MODEL_ID = os.getenv("CREDBRIDGE_MODEL", "us.anthropic.claude-3-7-sonnet-20250219-v1:0")
REGION = os.getenv("AWS_REGION", "us-west-2")
TODAY = os.getenv("CREDBRIDGE_TODAY")  # allow demo to pin "today"


def _today() -> date:
    return date.fromisoformat(TODAY) if TODAY else date.today()


# ---- tools the agent can call (deterministic; keeps math + grounding out of the prompt) ----
@tool
def get_regulator_rules(profession: str, target_country: str, target_region: str) -> str:
    """Return grounded licensing reference data (regulator, gateway, evaluation body, language
    tests + validity, exam, experience, source URL) for a profession in a jurisdiction, or a
    flag that the profession is unregulated / the region is unknown. Returns JSON."""
    return json.dumps(lookup(profession, target_country, target_region))


@tool
def months_between(iso_a: str, iso_b: str) -> int:
    """Whole months from iso_a to iso_b (b - a). Negative if b precedes a."""
    a, b = date.fromisoformat(iso_a[:10]), date.fromisoformat(iso_b[:10])
    return (b.year - a.year) * 12 + (b.month - a.month)


@tool
def today() -> str:
    """Return today's date (ISO). Use this as the reference point for expiry reasoning."""
    return _today().isoformat()


SYSTEM = """You are Credential Bridge, an agent that helps internationally trained professionals
and the settlement caseworkers guiding them get licensed in a new country.

You reason over GROUNDED regulator data — always call get_regulator_rules first and base every
step on what it returns. Never invent a regulator, exam, or URL that is not in that data.

Your job depends on the `event`:

- build_pathway: produce a realistic, correctly ORDERED pathway for this profession + region.
  Respect real dependencies: credential/source evaluation before the licensing exam; a language
  test that must still be VALID at the registration/exam decision, not merely at application;
  experience requirements where they exist. Give the first step a sensible status (often
  "complete" or "in-progress" if the applicant plausibly has it, else "upcoming"/"not-started")
  and later steps "upcoming"/"not-started". The opening logEntry summarizes the plan and gives an
  honest estimated timeframe. flag=false.

- simulate_delay: choose a real dependent pair already in currentSteps (e.g. a language test whose
  validity window closes before the exam/registration it gates, or an evaluation expiring before a
  bridging cohort starts). Mark the affected steps "at-risk", update their detail with the ACTUAL
  dates, and write a logEntry that names the specific collision and a concrete recommendation
  (switch cohort, retake early, expedite). flag=true.

- simulate_rejection: mark an early step "at-risk", INSERT a new remediation step immediately after
  it (renumber ids so the list stays 1..n in order), set the now-blocked dependent steps to
  "not-started", and explain in the logEntry why, referencing the rejected item. flag=true.

- reset: regenerate the original clean pathway exactly as a fresh build_pathway. flag=false.

UNREGULATED professions: if get_regulator_rules returns unregulated=true (e.g. Software Engineer),
DO NOT force a licensing template. Return a short pathway of 2-3 steps for work-authorization only
(e.g. Educational Credential Assessment for immigration, portfolio/reference verification), and a
logEntry that explicitly states the profession is not licensed/regulated in that jurisdiction so no
practice licence is required — this is deliberate judgment, not an oversight. flag=false.

Rules:
- Steps must match this shape exactly: {id:int, title:str, status:one of
  complete|in-progress|upcoming|not-started|at-risk, detail:str, source:str, sourceUrl:str}.
  Put the regulator name in `source` and its URL in `sourceUrl` on the steps that come from it.
- ids are 1..n in presentation order, no gaps.
- Dates in detail text must be concrete and internally consistent; use the today tool + months_between
  to reason about validity windows rather than guessing.
- Keep logEntry.text plain-language and specific. Never output anything except the structured object."""


TOOLS = [get_regulator_rules, months_between, today]


def make_model(model_id: str | None = None, max_tokens: int = 3000) -> Model:
    """Model for every Credential Bridge agent. CREDBRIDGE_PROVIDER picks the provider:
    'bedrock' (default; CREDBRIDGE_MODEL + AWS_REGION) or 'anthropic' (Claude API; key from
    ANTHROPIC_API_KEY; needs strands-agents[anthropic]) — a fallback while Bedrock access is pending.
    No temperature: current Claude models reject sampling params, so it is left out on both."""
    provider = os.getenv("CREDBRIDGE_PROVIDER", "bedrock").strip().lower()
    if provider == "anthropic":
        from strands.models.anthropic import AnthropicModel  # lazy: `anthropic` is an optional extra
        return AnthropicModel(model_id=model_id or os.getenv("CREDBRIDGE_MODEL", "claude-sonnet-5"),
                              max_tokens=max_tokens)
    if provider != "bedrock":
        raise ValueError(f"CREDBRIDGE_PROVIDER must be 'bedrock' or 'anthropic', not {provider!r}")
    # max_tokens is a direct BedrockConfig kwarg in strands 1.55 — a `params={...}` dict is ignored.
    return BedrockModel(model_id=model_id or MODEL_ID, region_name=REGION, max_tokens=max_tokens)


@lru_cache(maxsize=1)
def _model() -> Model:
    # one client for the process (thread-safe), shared by every fresh per-call Agent
    return make_model()


def build_agent() -> Agent:
    return Agent(model=_model(), tools=TOOLS, system_prompt=SYSTEM, callback_handler=None)


def _fresh(agent: Agent | None) -> Agent:
    """A new Agent per call. A strands Agent keeps agent.messages across calls (history would leak
    between applicants) and raises ConcurrencyException on overlapping calls, so the shared agent
    passed by api/orchestrator is only a template: we reuse its model + prompt, never its state."""
    if agent is None:
        return build_agent()
    if not isinstance(agent, Agent):
        return agent  # test doubles
    return Agent(model=agent.model, tools=TOOLS, system_prompt=agent.system_prompt, callback_handler=None)


def _task(req: ReasonRequest) -> str:
    return (
        f"event: {req.event}\n"
        f"today: {_today().isoformat()}\n"
        f"profile: {req.profile.model_dump_json()}\n"
        f"currentSteps: {json.dumps([s.model_dump() for s in req.currentSteps])}\n\n"
        f"Call get_regulator_rules(profession='{req.profile.profession}', "
        f"target_country='{req.profile.targetCountry}', target_region='{req.profile.targetRegion}') "
        f"then return the ReasonResponse for this event."
    )


def reason(req: ReasonRequest, agent: Agent | None = None) -> ReasonResponse:
    task = _task(req)
    # structured output via structured_output_model= (Agent.structured_output is deprecated in 1.55).
    # Fallback: a plain call on another fresh agent, then parse the largest JSON object.
    try:
        out = _fresh(agent)(task, structured_output_model=ReasonResponse).structured_output
        if not isinstance(out, ReasonResponse):
            raise ValueError("no structured_output on result")
    except Exception as e:  # noqa: BLE001
        log.warning("structured output failed (%s); falling back to text+parse", e)
        out = _parse(str(_fresh(agent)(task)))
    return _renumber(out)


def _parse(text: str) -> ReasonResponse:
    import re
    # take the largest {...} block
    blocks = re.findall(r"\{.*\}", text, re.S)
    for b in sorted(blocks, key=len, reverse=True):
        try:
            return ReasonResponse.model_validate_json(b)
        except Exception:
            continue
    raise ValueError("agent returned no valid ReasonResponse JSON")


def _renumber(r: ReasonResponse) -> ReasonResponse:
    for i, s in enumerate(r.steps, 1):
        s.id = i
    return r
