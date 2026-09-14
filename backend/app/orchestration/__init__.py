"""Orchestration for Credential Bridge.

Two orthogonal concerns:
1) SESSION concurrency — many caseworkers, each with many applicant cases, running at once,
   each an isolated session with its own persisted state (session_store + orchestrator).
2) AGENT composition — within one case, the specialized agents can run as a Strands Graph
   (build_case_graph): pathway -> [approval gate] -> watcher, with harvester feeding the KB.

AgentCore Runtime already gives per-session microVM isolation; this layer gives the same
semantics locally and defines the concurrency contract so both behave identically.
"""
