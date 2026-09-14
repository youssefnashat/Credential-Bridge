"""Concurrent orchestrator: runs many /reason requests across many sessions in parallel, each
session serialized against itself (so its step-list stays consistent) but independent of others.

- One shared, thread-safe agent instance (Strands Agent is stateless per-call; state lives in the
  session store), so we don't pay cold-start per request.
- A bounded thread pool caps concurrent Bedrock calls (protect your account limits).
- Per-session locks (in session_store) guarantee correctness under concurrency.
"""
from __future__ import annotations
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Iterable

from app.schemas import ReasonRequest, ReasonResponse
from app.agent import build_agent, reason
from app.orchestration import session_store

_MAX = int(os.getenv("CREDBRIDGE_MAX_CONCURRENCY", "4"))

class Orchestrator:
    def __init__(self, max_workers: int | None = None):
        self._agent = build_agent()            # shared across sessions
        self._pool = ThreadPoolExecutor(max_workers=max_workers or _MAX)

    def handle(self, session_id: str, req: ReasonRequest) -> ReasonResponse:
        """Process one event for one session, persisting the resulting steps + a history line."""
        # seed currentSteps from the session if the caller didn't pass them (stateful UX)
        if not req.currentSteps:
            prior = session_store.load(session_id).get("steps", [])
            if prior:
                req = req.model_copy(update={"currentSteps": prior})
        resp = reason(req, agent=self._agent)
        def _mut(state):
            state["profile"] = req.profile.model_dump()
            state["steps"] = [s.model_dump() for s in resp.steps]
            state.setdefault("history", []).append(
                {"event": req.event, "flag": resp.logEntry.flag, "log": resp.logEntry.text})
            return state
        session_store.update(session_id, _mut)
        return resp

    def handle_many(self, jobs: Iterable[tuple[str, ReasonRequest]]) -> list[tuple[str, ReasonResponse]]:
        """Run many (session_id, request) jobs concurrently. Different sessions truly parallel;
        same session is still safe (serialized by its lock inside handle)."""
        futs = {self._pool.submit(self.handle, sid, req): sid for sid, req in jobs}
        out = []
        for f in futs:
            out.append((futs[f], f.result()))
        return out

    def shutdown(self):
        self._pool.shutdown(wait=True)
