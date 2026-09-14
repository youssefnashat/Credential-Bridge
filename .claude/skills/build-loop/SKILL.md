---
name: build-loop
description: The sprint build loop — how the orchestrator session picks tasks from docs/TASKS.md, dispatches specialist subagents in parallel, gates them through qa-verifier, and commits. Read before running or resuming the loop.
---
# Roles
- **Orchestrator** = the main Claude Code session. Owns docs/TASKS.md, docs/CONTEXT_LOG.md, git, .claude/**.
  Never writes product code itself; dispatches.
- **Specialists** (.claude/agents): strands-engineer · grounding-engineer · api-deploy-engineer · submission-pm.
  Each owns the files in its description. Edits only the task's `files`. Never commits.
- **qa-verifier**: read-only gate. Every task passes it before commit.

# One tick
1. Read docs/TASKS.md + last 12 lines of docs/CONTEXT_LOG.md. Re-check BLOCKED reasons (did a human gate clear?).
2. Pick up to 3 READY tasks, highest pri first, whose `files` don't overlap each other or anything RUNNING.
3. Dispatch each as a background subagent with a self-contained prompt: role file + CLAUDE.md + the
   relevant skill + task row + "edit only these files; do not commit; report what you changed and the
   command output proving done-when". Mark RUNNING.
4. On each return → dispatch qa-verifier on that task's files. PASS → `git add <files>` + commit
   `feat|fix|docs(T#): …`, mark DONE, append one CONTEXT_LOG line. FAIL → back to READY with the
   PROBLEMS pasted into the task; after 2 fails → BLOCKED(needs human) and surface it.
5. If nothing is READY and everything left is HUMAN/BLOCKED, stop dispatching and tell the human exactly
   which gate to clear. Don't invent busywork.

# Hard rules
- HUMAN tasks never run automatically. Never push, deploy, publish, or submit without an explicit human yes.
- Anything needing AWS stays BLOCKED until `aws sts get-caller-identity` succeeds.
- Scope freeze at Mon Sep 14 12:00pm PT: after that, only P0 fixes + submission tasks.
- New work discovered mid-task goes on the board as a new row, not into the current diff.
