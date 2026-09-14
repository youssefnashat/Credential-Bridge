"""Within ONE case, compose the specialized agents as a Strands Graph. The pathway agent runs,
a human-approval edge gates progression, then a finalize node prepares the packet + watch dates.
This is the multi-agent story to show on screen alongside the concurrent-sessions story.

Kept import-safe: if the installed Strands GraphBuilder signature differs, callers can fall back
to the linear orchestrator above — the graph is the 'wow', the orchestrator is the workhorse."""
from __future__ import annotations

def build_case_graph(hooks=None):
    from strands.multiagent import GraphBuilder
    from app.agent import build_agent
    pathway = build_agent()
    finalizer = build_agent()  # same model; different role via task text

    def approved(state, *, invocation_state, **kw) -> bool:
        return bool(invocation_state.get("approved"))

    b = GraphBuilder()
    b.add_node(pathway, "pathway")
    b.add_node(finalizer, "finalize")
    b.add_edge("pathway", "finalize", condition=approved)
    b.set_entry_point("pathway")
    b.set_execution_timeout(600).set_node_timeout(240)
    if hooks:
        b.set_hook_providers(hooks)
    return b.build()
