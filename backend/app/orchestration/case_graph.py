"""Within ONE case, compose the specialized agents as a Strands Graph. The pathway agent runs,
a human-approval edge gates progression, then a finalize node prepares the packet + watch dates.
This is the multi-agent story to show on screen alongside the concurrent-sessions story.

Run:  g = build_case_graph();  g(task, invocation_state={"approved": True})
Without approved=True the graph completes after "pathway" and "finalize" never runs.
Build one graph per case: graph nodes are Agents and keep their message history.

Kept import-safe: if the installed Strands GraphBuilder signature differs, callers can fall back
to the linear orchestrator above — the graph is the 'wow', the orchestrator is the workhorse."""
from __future__ import annotations


def approved(state, *, invocation_state, **kw) -> bool:
    # strands 1.55 passes invocation_state (the dict given to graph(...)) to any condition whose
    # signature names it (multiagent/graph.py _is_context_condition / GraphEdge.should_traverse)
    return bool((invocation_state or {}).get("approved"))


def build_case_graph(hooks=None):
    from strands.multiagent import GraphBuilder
    from app.agent import build_agent
    pathway = build_agent()
    finalizer = build_agent()  # same model; different role via task text

    b = GraphBuilder()
    b.add_node(pathway, "pathway")
    b.add_node(finalizer, "finalize")
    b.add_edge("pathway", "finalize", condition=approved)
    b.set_entry_point("pathway")
    b.set_execution_timeout(600).set_node_timeout(240)
    if hooks:
        b.set_hook_providers(hooks if isinstance(hooks, list) else [hooks])
    return b.build()
