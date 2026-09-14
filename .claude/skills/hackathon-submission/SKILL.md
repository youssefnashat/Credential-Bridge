---
name: hackathon-submission
description: Devpost submission checklist, README structure, video plan pointer, and builder.aws blog plan for Agents for Humans.
---
# Devpost checklist (rules verified 2026-09-13, agentsforhumans.devpost.com)
Deadline Sep 14 2026, 5:00pm PDT. Strands Agents SDK required; AgentCore optional (strengthens Technical Implementation).
- [ ] Text description of features/functionality — draft in `docs/DEVPOST.md`
- [ ] Public repo, Apache-2.0 (MIT also allowed) LICENSE file, license visible in About
- [ ] README (order below) with setup + run instructions
- [ ] Architecture diagram — `docs/architecture.png`, rendered from the mermaid in `docs/ARCHITECTURE.md`
- [ ] Video ≤5 min, **public** on YouTube or Vimeo, shows it working + pitch on problem / who / why — plan: `docs/VIDEO_SCRIPT.md`
- [ ] AWS Builder ID
- [ ] Optional: live demo link (AgentCore Runtime URL) — otherwise exact local run instructions
- [ ] Track: Good Neighbor
- [ ] Pre-existing code disclosed (README "Data sources & honesty note" + `docs/DEVPOST.md`)
- [ ] Optional: builder.aws posts, +0.2 each (max 0.6), titled "Agents for Humans: ..." — `docs/BLOG_PLAN.md`

Judging (equal weight): Technical Implementation · Design · Potential Impact · Creativity & Originality · Presentation.

# Video
The canonical plan is **`docs/VIDEO_SCRIPT.md`** (max 4:30, every beat mapped to a criterion and an
exact command). Do not keep a second beat list here. Film only what the code does on the request path:
build_pathway → simulate_delay → (simulate_rejection) → unregulated Software Engineer → concurrent
sessions → architecture/AgentCore. Checker, packet, and watcher ping are NOT in the video (not built /
not wired). Harvester and accuracy number only if they exist for real (see the script's conditional beats).

# README order
Problem · Who · (Why it matters) · What it does · Demo (video link / gif) · Accuracy · Architecture · Run it · AgentCore · Data sources & honesty note (incl. pre-existing code) · Roadmap · License

# Honesty rules
- Every README/Devpost/blog claim reproducible by a documented command, or phrased as design intent.
- Accuracy line stays `_Pending live evaluation run (see docs/evidence/)_` until a number exists in `docs/evidence/`.
- Sample agent outputs are labelled illustrative unless copied from a saved live run.
