"""Specialized agents for Credential Bridge.

Each is a focused Strands agent with a narrow job and its own tools/prompt. The public
/reason endpoint is served by the Pathway agent (the reasoner). The others form the KB
data pipeline and the background watcher, and can be composed in a Strands Graph.

- harvester : reads a regulator page -> structured JurisdictionRuleSet into the KB (background)
- pathway   : builds/updates the licensing pathway + explains conflicts (serves /reason)
- watcher   : dormant; fires only when a dated requirement is within its window
- (checker) : optional document cross-check agent (kept minimal for scope)
"""
