# Agents for Humans: make the agent's judgment the demo, not the plumbing

*Build log — Credential Bridge, Good Neighbor track.*

## The critique to design against
The fastest way to lose an agent hackathon is to build something a judge can call "a form wizard."
A clean timeline of licensing steps *looks* like an agent but proves nothing — a static checklist
produces the same screen. The evidence that you built an agent is a moment where it does something a
checklist can't: catch a problem, reason about it, and explain the trade-off.

## The moment we built the demo around
An internationally trained nurse has a language test valid for 24 months and an NNAS evaluation and
exam timeline that, once it slips, pushes her registration decision past that 24-month window. A list
shows both items green. Our agent, on a `simulate_delay` event, reasons over the real dates:

> "Your IELTS is valid until 2026-03-10, but with the NNAS delay your CNO registration decision now
> falls in April 2026. CNO requires the language result to be valid *at the decision*, not at
> application — so this test will have expired. Retake before February, or request the earlier
> assessment cohort."

That paragraph isn't templated. The date math lives in deterministic tools (`today`, `months_between`);
the *decision* — which pair collides, why it matters, what to do — comes from the model reasoning over
the grounded rule that carries a `valid_at: registration_decision` field.

## The second judgment moment
Switch the profession to Software Engineer. A naive tool forces a licensing template onto it. Ours
checks the KB, sees `regulated: false`, and says so out loud: software engineering isn't a licensed
profession in these jurisdictions, so there's no practice licence to obtain — here's a short
work-authorization path (an ECA for immigration) instead. We coded that on purpose. Recognizing when
*not* to apply your own template is judgment, and judges notice it.

## How Strands makes this legible
Hooks write an audit line for every tool call, so the reasoning is observable, not a black box. The
whole thing is one focused agent with three tools and a strict system prompt — small enough to read in
the repo, which is itself part of the pitch.

Next post: shipping the same agent two ways — FastAPI locally, AgentCore Runtime in production —
without changing a line the frontend sees.

*Built with the Strands Agents SDK and Amazon Bedrock.*
