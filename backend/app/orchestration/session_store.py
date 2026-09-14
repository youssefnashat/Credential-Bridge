"""Per-session state with safe concurrent access. One session == one applicant case for one
caseworker. Backed by JSON files under data/sessions/<session_id>.json with a per-session lock,
so many sessions mutate in parallel without stepping on each other. Swap for DynamoDB/AgentCore
Memory by keeping this interface."""
from __future__ import annotations
import json, threading, time
from pathlib import Path
from typing import Any

ROOT = Path("data/sessions")
ROOT.mkdir(parents=True, exist_ok=True)
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()

def _lock(session_id: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(session_id, threading.Lock())

def _path(session_id: str) -> Path:
    safe = "".join(c for c in session_id if c.isalnum() or c in "-_")
    return ROOT / f"{safe}.json"

def load(session_id: str) -> dict[str, Any]:
    p = _path(session_id)
    return json.loads(p.read_text()) if p.exists() else {"session_id": session_id, "steps": [], "history": []}

def save(session_id: str, state: dict[str, Any]) -> None:
    state["updated_at"] = time.time()
    tmp = _path(session_id).with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(_path(session_id))   # atomic

def update(session_id: str, mutate) -> dict[str, Any]:
    """Read-modify-write under the session lock. `mutate(state)->state`."""
    with _lock(session_id):
        state = load(session_id)
        state = mutate(state)
        save(session_id, state)
        return state

def list_sessions() -> list[dict]:
    out = []
    for p in ROOT.glob("*.json"):
        d = json.loads(p.read_text())
        out.append({"session_id": d.get("session_id"), "profession": d.get("profile",{}).get("profession"),
                    "region": (d.get("profile",{}) or {}).get("targetRegion"),
                    "steps": len(d.get("steps", [])), "updated_at": d.get("updated_at")})
    return sorted(out, key=lambda x: x.get("updated_at") or 0, reverse=True)
