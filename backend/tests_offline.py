"""No-AWS test of the Strands wiring: builds every agent/graph offline, drives reason() and the case
graph with a stub Model (no network), and proves calls share no history. Run: python tests_offline.py"""
import json, os, sys, warnings
from concurrent.futures import ThreadPoolExecutor
# forced, not setdefault: an exported-but-empty AWS_ACCESS_KEY_ID would fall through to the login provider
os.environ.update({"AWS_REGION": "us-west-2", "AWS_ACCESS_KEY_ID": "offline", "AWS_SECRET_ACCESS_KEY": "offline",
                   "AWS_EC2_METADATA_DISABLED": "true", "CREDBRIDGE_PROVIDER": "bedrock"})
for k in ("AWS_SESSION_TOKEN", "AWS_PROFILE", "CREDBRIDGE_MODEL", "CREDBRIDGE_HARVEST_MODEL"):
    os.environ.pop(k, None)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from strands import Agent
from strands.models import BedrockModel, Model
from app import agent as agent_mod
from app.agent import build_agent, reason, _fresh, TOOLS, SYSTEM
from app.agents.harvester import build_harvester
from app.agents import pathway, watcher  # noqa: F401
from app.orchestration.case_graph import build_case_graph, approved
from app.schemas import ReasonRequest, ReasonResponse

PAYLOAD = {"steps": [{"id": 5, "title": "Credential evaluation", "status": "upcoming", "detail": "d",
                      "source": "CNO", "sourceUrl": "https://cno.org"},
                     {"id": 9, "title": "Exam", "status": "not-started", "detail": "d"}],
           "logEntry": {"text": "Plan built.", "flag": False}}


class Stub(Model):
    """Offline model. tool=True answers via the ReasonResponse structured-output tool; tool=False
    only ever returns text (forces the SDK's structured-output failure -> our text+parse fallback)."""
    def __init__(self, tool=True, payload=None): self.tool, self.first_len, self.payload = tool, [], payload or PAYLOAD
    def update_config(self, **kw): pass
    def get_config(self): return {}
    async def structured_output(self, *a, **kw): raise NotImplementedError
    async def stream(self, messages, tool_specs=None, system_prompt=None, **kw):
        last = messages[-1]["content"]
        if any("toolResult" in c for c in last):
            text = "done"
        else:
            self.first_len.append(len(messages))  # history size the model sees for a fresh prompt
            name = next((t["name"] for t in tool_specs or [] if t["name"] == "ReasonResponse"), None)
            if self.tool and name:
                yield {"messageStart": {"role": "assistant"}}
                yield {"contentBlockStart": {"start": {"toolUse": {"name": name, "toolUseId": "t1"}}}}
                yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(self.payload)}}}}
                yield {"contentBlockStop": {}}
                yield {"messageStop": {"stopReason": "tool_use"}}
                return
            text = "here you go " + json.dumps(self.payload)
        yield {"messageStart": {"role": "assistant"}}
        yield {"contentBlockDelta": {"delta": {"text": text}}}
        yield {"contentBlockStop": {}}
        yield {"messageStop": {"stopReason": "end_turn"}}


def req(name):
    return ReasonRequest.model_validate({"profile": {"name": name, "profession": "Registered Nurse",
        "countryTrained": "Philippines", "targetCountry": "Canada", "targetRegion": "Ontario"},
        "event": "build_pathway", "currentSteps": []})


# 1) builders construct offline; model config uses real BedrockConfig keys (no 'Invalid configuration')
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter("always")
    a = build_agent(); h = build_harvester(); g = build_case_graph()
bad = [str(x.message) for x in w if "Invalid configuration" in str(x.message) or "deprecated" in str(x.message)]
assert not bad, bad
assert isinstance(a, Agent) and isinstance(a.model, BedrockModel) and isinstance(h.model, BedrockModel)
for m in (a.model, h.model):  # no sampling params: current Claude models reject temperature
    assert m.config["max_tokens"] == 8000 and m.config.get("temperature") is None, m.config
assert set(h.tool_names) & {"web_fetch", "http_request"}, h.tool_names
assert set(a.tool_names) == {"get_regulator_rules", "months_between", "today"}
print(f"OK  build_agent / build_harvester (tool={h.tool_names}) / build_case_graph offline")

# 1b) env is read at call time: values set AFTER `import app.agent` (e.g. a late load_dotenv) apply
from strands.models.anthropic import AnthropicModel


def with_env(env, fn):
    """Run fn with env applied (None = unset) on a cold _model() cache, then restore both."""
    def apply(e):
        for k, v in e.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    old = {k: os.environ.get(k) for k in env}
    apply(env); agent_mod._model.cache_clear()
    try:
        return fn()
    finally:
        apply(old); agent_mod._model.cache_clear()


bm = with_env({"CREDBRIDGE_MODEL": "us.anthropic.claude-opus-5", "AWS_REGION": "us-east-2"}, lambda: build_agent().model)
assert isinstance(bm, BedrockModel) and bm.config["model_id"] == "us.anthropic.claude-opus-5", bm.config
assert bm.client.meta.region_name == "us-east-2", bm.client.meta.region_name
ANTH = {"CREDBRIDGE_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "offline", "CREDBRIDGE_MODEL": None}
aa, ha = with_env(ANTH, lambda: (build_agent().model, build_harvester().model))
for m in (aa, ha):  # provider switch, no network call at construction
    assert isinstance(m, AnthropicModel), type(m)
    assert m.config["model_id"] == "claude-sonnet-5" and m.config["max_tokens"] == 8000 and not m.config.get("params")
am = with_env({**ANTH, "CREDBRIDGE_MODEL": "claude-opus-5"}, lambda: build_agent().model)
assert am.config["model_id"] == "claude-opus-5", am.config
try:  # fail fast: anthropic without a key raises at build time, not on the first request
    with_env({**ANTH, "ANTHROPIC_API_KEY": None, "ANTHROPIC_AUTH_TOKEN": None}, build_agent)
    raise AssertionError("missing ANTHROPIC_API_KEY did not raise")
except ValueError as e:
    assert "ANTHROPIC_API_KEY" in str(e), e
assert with_env({"CREDBRIDGE_TODAY": "2026-09-14"}, agent_mod._today).isoformat() == "2026-09-14"
assert isinstance(build_agent().model, BedrockModel) and bm is not build_agent().model  # default restored
print("OK  late env honoured (bedrock model+region, anthropic model, CREDBRIDGE_TODAY); missing key fails at build")

# 2) approval edge: False without approved, True with it
edge = next(e for e in g.edges if e.from_node.node_id == "pathway" and e.to_node.node_id == "finalize")
assert edge.should_traverse(g.state, invocation_state={}) is False
assert edge.should_traverse(g.state, invocation_state={"approved": False}) is False
assert edge.should_traverse(g.state, invocation_state={"approved": True}) is True
assert approved(None, invocation_state={"approved": True}) is True
print("OK  approval edge gated by invocation_state['approved']")

# 3) raw SDK behaviour we guard against: a reused Agent accumulates history
stub = Stub()
raw = Agent(model=stub, tools=TOOLS, system_prompt=SYSTEM, callback_handler=None)
raw("hello"); raw("again")
assert len(raw.messages) >= 4 and stub.first_len == [1, 3], (len(raw.messages), stub.first_len)
print(f"OK  (evidence) reused strands Agent keeps history: {len(raw.messages)} msgs, 2nd call saw 3")

# 4) reason() with a shared template agent: structured path, no shared history, renumbered ids
stub = Stub()
shared = Agent(model=stub, tools=TOOLS, system_prompt=SYSTEM, callback_handler=None)
r1, r2 = reason(req("A"), agent=shared), reason(req("B"), agent=shared)
assert isinstance(r1, ReasonResponse) and [s.id for s in r1.steps] == [1, 2]
assert stub.first_len == [1, 1], stub.first_len        # each call saw only its own prompt
assert shared.messages == []                            # template never mutated
assert _fresh(shared) is not shared and _fresh(shared).messages == []
print("OK  two reason() calls share no message history; ids renumbered 1..n")

# 5) concurrent reason() on one shared agent (the /batch path) — no ConcurrencyException
with ThreadPoolExecutor(4) as ex:
    outs = list(ex.map(lambda i: reason(req(f"P{i}"), agent=shared), range(8)))
assert len(outs) == 8 and all(len(o.steps) == 2 for o in outs) and shared.messages == []
print("OK  8 concurrent reason() calls on one shared agent")

# 6) text+JSON-parse fallback when the model never calls the structured-output tool
stub = Stub(tool=False)
out = reason(req("C"), agent=Agent(model=stub, tools=TOOLS, system_prompt=SYSTEM, callback_handler=None))
assert out.logEntry.text == "Plan built." and [s.id for s in out.steps] == [1, 2]
assert len(stub.first_len) >= 2 and stub.first_len[-1] == 1, stub.first_len  # fallback ran on a fresh agent
print("OK  fallback text+parse path (on a fresh agent)")

# 6b) grounding is enforced in code (loss-guard #2): regulator/regulatorUrl come from lookup(), and a
#     sourceUrl outside the jurisdiction's URL set is dropped, whatever the model returned
import logging
from app.reference import lookup
g = lookup("Registered Nurse", "Canada", "Ontario")
KB_URL, REQ_URL = g["url"], g["requirements"][0]["source"]
FAB = {"steps": [
    {"id": 1, "title": "Registration", "status": "upcoming", "detail": "d", "source": "CNO", "sourceUrl": KB_URL},
    {"id": 2, "title": "Evaluation", "status": "upcoming", "detail": "d", "source": "CNO", "sourceUrl": REQ_URL + "/"},
    {"id": 3, "title": "Fake board sign-off", "status": "not-started", "detail": "d",
     "source": "Ontario Nursing Authority", "sourceUrl": "https://example.invalid/ona"},
    {"id": 4, "title": "Other jurisdiction", "status": "not-started", "detail": "d",
     "source": "NMC", "sourceUrl": "https://www.nmc.org.uk/registration/"}],
    "logEntry": {"text": "Plan built.", "flag": False},
    "regulator": "Ontario Nursing Authority", "regulatorUrl": "https://example.invalid/ona"}
dropped = []
h = logging.Handler(); h.emit = lambda rec: dropped.append(rec.getMessage())
agent_mod.log.addHandler(h)
try:
    out = reason(req("G"), agent=Agent(model=Stub(payload=FAB), tools=TOOLS, system_prompt=SYSTEM, callback_handler=None))
    swe = req("S"); swe.profile.profession = "Software Engineer"
    uo = reason(swe, agent=Agent(model=Stub(payload=FAB), tools=TOOLS, system_prompt=SYSTEM, callback_handler=None))
finally:
    agent_mod.log.removeHandler(h)
assert [s.sourceUrl for s in out.steps] == [KB_URL, REQ_URL + "/", None, None], [s.sourceUrl for s in out.steps]
assert (out.regulator, out.regulatorUrl) == (g["regulator"], KB_URL), (out.regulator, out.regulatorUrl)
assert out.steps[2].title == "Fake board sign-off" and out.steps[2].source == "Ontario Nursing Authority"  # wording stays the model's
assert sum("ungrounded sourceUrl" in m for m in dropped) == 2 + 4, dropped  # 2 on the RN case, all 4 on SWE
assert uo.regulator is None and uo.regulatorUrl is None and all(s.sourceUrl is None for s in uo.steps)
try:  # a whitespace-only key counts as missing
    with_env({**ANTH, "ANTHROPIC_API_KEY": "  \n"}, build_agent)
    raise AssertionError("whitespace ANTHROPIC_API_KEY did not raise")
except ValueError:
    pass
print("OK  grounding in code: fabricated regulator/URLs dropped (RN 2, SWE all 4), KB URLs kept; blank key rejected")

# 7) graph end-to-end with the stub: finalize runs only when approved
agent_mod._model = lambda: Stub()
for inv, want in (({}, ["pathway"]), ({"approved": True}, ["pathway", "finalize"])):
    res = build_case_graph()("case task", invocation_state=inv)
    got = [n.node_id for n in res.execution_order]
    assert got == want, (inv, got)
print("OK  graph run: finalize skipped unless approved")

print("\nALL OFFLINE CHECKS PASSED")
