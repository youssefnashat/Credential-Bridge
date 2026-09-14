"""Deadline Watcher — dormant specialized agent. Given a pathway (steps with detail dates) and a
current date, it does NO model call unless a dated requirement is within the alert window; only
then does it summarize the decision for the caseworker. This is the 'runs quietly, pings only on a
real decision' behaviour the Everyday/Good-Neighbor tracks reward."""
from __future__ import annotations
import re
from datetime import date, datetime

DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")

def scan(steps: list[dict], as_of: date, window_days: int = 45) -> list[dict]:
    alerts = []
    for s in steps:
        for m in DATE_RE.findall(s.get("detail", "")):
            try: d = date.fromisoformat(m)
            except ValueError: continue
            delta = (d - as_of).days
            if delta <= window_days:
                alerts.append({"step_id": s.get("id"), "title": s.get("title"), "date": m,
                               "days_left": delta,
                               "action": "expired — re-obtain before it blocks the next step" if delta < 0
                                         else "expiring — renew or bring the dependent step forward"})
    return alerts

def notify_needed(steps: list[dict], as_of_iso: str, window_days: int = 45) -> dict:
    a = scan(steps, date.fromisoformat(as_of_iso[:10]), window_days)
    return {"as_of": as_of_iso[:10], "notify": bool(a), "alerts": a}
