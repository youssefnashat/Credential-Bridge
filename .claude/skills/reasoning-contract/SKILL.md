---
name: reasoning-contract
description: The /reason contract, event semantics, and how the Strands agent must produce grounded, non-templated output. Read before touching backend/app.
---
# Contract
POST /reason { profile{name,profession,countryTrained,targetCountry,targetRegion}, event, currentSteps[] }
-> { steps[]{id,title,status,detail,source,sourceUrl}, logEntry{text,flag}, regulator?, regulatorUrl? }
status in complete|in-progress|upcoming|not-started|at-risk ; ids 1..n contiguous, presentation order.
# Events
build_pathway(flag=false) · simulate_delay(flag=true, real dates) · simulate_rejection(flag=true, insert remediation step) · reset(flag=false).
# How the agent must behave
- Call get_regulator_rules FIRST; base steps only on returned data + source URL.
- Use today + months_between tools for expiry/prereq reasoning; do not guess windows.
- Software Engineer -> unregulated judgment path (work-authorization only), stated explicitly.
- Output ONLY the structured object. structured_output preferred; text+JSON-parse is the wired fallback.
# Anti-patterns
Templated per-profession static output. Regulators/URLs not in regulators.json. Breaking required contract fields.
