#!/usr/bin/env bash
# PreToolUse(Bash) gate: block `git push` unless the no-AWS smoke test and KB validation pass.
# Exit 2 = block (stderr is shown to Claude); exit 0 = allow.
cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
case "$cmd" in *"git push"*) ;; *) exit 0 ;; esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 2
py=backend/.venv/bin/python; [ -x "$py" ] || py=python3
if ! out=$( (cd backend && "../$py" tests_smoke.py) 2>&1 ); then
  echo "push blocked: backend/tests_smoke.py failed" >&2; echo "$out" | tail -20 >&2; exit 2
fi
if ! out=$("$py" kb/pipeline/build_kb_index.py 2>&1); then
  echo "push blocked: KB validation failed" >&2; echo "$out" | tail -20 >&2; exit 2
fi
exit 0
