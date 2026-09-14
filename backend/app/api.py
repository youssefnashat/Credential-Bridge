"""HTTP API for Credential Bridge.
- POST /reason                      stateless single call (original frontend contract)
- POST /sessions/{id}/reason        stateful: persists steps per caseworker session
- POST /batch                       run many sessions' events concurrently (multi-session demo)
- GET  /sessions                    list active sessions
- GET  /health
"""
import json, logging, time
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .schemas import ReasonRequest, ReasonResponse
from .agent import build_agent, reason
from .orchestration import session_store
from .orchestration.orchestrator import Orchestrator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("credbridge.api")

app = FastAPI(title="Credential Bridge", version="1.1")
# NOTE: wildcard CORS is fine for a hackathon demo; scope origins down for production.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"], allow_credentials=False)

_AGENT = None
_ORCH = None
_AUDIT = Path("data/audit.jsonl")

def _agent():
    global _AGENT
    if _AGENT is None: _AGENT = build_agent()
    return _AGENT

def _orch():
    global _ORCH
    if _ORCH is None: _ORCH = Orchestrator()
    return _ORCH

def _audit(rec: dict):
    _AUDIT.parent.mkdir(parents=True, exist_ok=True)
    with _AUDIT.open("a") as f: f.write(json.dumps({"t": time.time(), **rec}) + "\n")

@app.get("/health")
def health(): return {"status": "ok"}

@app.post("/reason", response_model=ReasonResponse)
def do_reason(req: ReasonRequest):
    t0 = time.time(); resp = reason(req, agent=_agent())
    _audit({"ep":"reason","profession":req.profile.profession,"event":req.event,
            "steps":len(resp.steps),"flag":resp.logEntry.flag,"ms":round((time.time()-t0)*1000)})
    return resp

@app.post("/sessions/{session_id}/reason", response_model=ReasonResponse)
def session_reason(session_id: str, req: ReasonRequest):
    t0 = time.time(); resp = _orch().handle(session_id, req)
    _audit({"ep":"session_reason","session":session_id,"event":req.event,
            "steps":len(resp.steps),"flag":resp.logEntry.flag,"ms":round((time.time()-t0)*1000)})
    return resp

class BatchJob(BaseModel):
    session_id: str
    request: ReasonRequest

class BatchIn(BaseModel):
    jobs: list[BatchJob]

@app.post("/batch")
def batch(inp: BatchIn):
    """Run many caseworker sessions' events concurrently. Demonstrates simultaneous sessions."""
    t0 = time.time()
    jobs = [(j.session_id, j.request) for j in inp.jobs]
    results = _orch().handle_many(jobs)
    out = [{"session_id": sid, "steps": len(r.steps), "flag": r.logEntry.flag,
            "log": r.logEntry.text} for sid, r in results]
    _audit({"ep":"batch","n":len(jobs),"ms":round((time.time()-t0)*1000)})
    return {"count": len(out), "ms": round((time.time()-t0)*1000), "results": out}

@app.get("/sessions")
def sessions():
    return {"sessions": session_store.list_sessions()}
