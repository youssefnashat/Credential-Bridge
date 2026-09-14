"""Pathway agent — the reasoner that serves /reason. Implemented in app.agent; re-exported here
so the specialized-agent package is the single import surface."""
from app.agent import build_agent as build_pathway_agent, reason  # noqa: F401
