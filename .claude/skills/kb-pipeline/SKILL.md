---
name: kb-pipeline
description: The compliance/regulatory knowledge base — schema, per-jurisdiction layout, how to add or harvest rulesets. Read before touching kb/.
---
# Shape
One file per (profession, jurisdiction): kb/store/<JURISDICTION>/<profession-slug>.json, validated against
kb/schema/ruleset.schema.json. Jurisdiction keys: CA-ON, CA-BC, CA-AB, US-NY, US-CA, US-TX, GB, AU, DE...
# Requirement objects carry the reasoning-critical fields
- valid_at: application | registration_decision | exam | continuous  (the crux of expiry-collision logic)
- validity_months: how long the artifact stays valid once obtained
- depends_on: names of requirements that must complete first
Every ruleset + requirement carries a source URL. regulated=false => unregulated jurisdiction.
# Add coverage
Curated: write the JSON by hand from the regulator page, harvest_method=curated, needs_review=false.
Harvested: `python kb/pipeline/run_harvest.py --profession .. --jurisdiction .. --regulator .. --url ..`
  (agent tier, needs_review=true). Then `python kb/pipeline/build_kb_index.py` (validates + indexes).
# Rules
Never invent a regulator/exam/URL. Unknown -> null. Validation must pass before commit.
