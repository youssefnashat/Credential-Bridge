# Agents for Humans: make the agent's judgment the demo, not the plumbing

*Build log — Credential Bridge, Good Neighbor track.*

## The critique to design against
The fastest way to lose an agent hackathon is to build something a judge can call "a form wizard."
A clean timeline of licensing steps *looks* like an agent but proves nothing — a static checklist
produces the same screen. The evidence that you built an agent is a moment where it does something a
checklist can't: catch a problem, reason about it, and explain the trade-off.

## The moment we built the demo around
In our Ontario nursing ruleset, the language test has `validity_months: 24` and
`valid_at: "registration_decision"` — it must still be valid when the College of Nurses of Ontario makes
its decision, not just when the applicant applies. If the credential evaluation or exam timeline slips,
a result that was fine at application can expire before the decision. A list shows both items green.

On a `simulate_delay` event, the agent gets the current steps, calls its grounding tool, and is
instructed to find a real dependent pair that no longer lines up, mark the affected steps `at-risk`,
and explain it with actual dates. The kind of explanation it is prompted to produce looks like this
(*illustrative — not a captured output*):

> "Your IELTS result is valid until 2027-05-02, but with the evaluation delay your CNO registration
> decision now falls after that date. CNO needs the language result to be valid at the decision, so
> book a retake that will still be valid then."

_[TODO(team): replace with a real logEntry from docs/evidence/ before publishing.]_

That paragraph isn't templated. The date math lives in deterministic tools (`today`, pinnable via
`CREDBRIDGE_TODAY`, and `months_between`); the *decision* — which pair collides, why it matters, what to
do — comes from the model reasoning over a grounded rule that carries `valid_at`.

`simulate_rejection` is the companion move: the agent marks an early step at-risk, inserts a remediation
step right after it, renumbers the list, and sets the now-blocked steps to not-started.

## The second judgment moment
Switch the profession to Software Engineer. A naive tool forces a licensing template onto it. Ours calls
the same grounding tool, which returns `unregulated: true` from our reference table, and the system
prompt tells the agent to say so plainly: software engineering isn't a licensed profession in these
jurisdictions, so there's no practice licence to obtain — here's a short work-authorization path (for
example an Educational Credential Assessment for immigration) instead. Recognizing when *not* to apply
your own template is judgment, and we made it an explicit, grounded outcome.

## How we keep it legible
Every step carries the `source` and `sourceUrl` it came from, so a caseworker can check it in one click.
The API appends one line per request to `data/audit.jsonl` (endpoint, event, step count, flag, latency).
And the whole reasoner is one focused Strands agent with three tools and a strict system prompt — small
enough to read in the repo, which is itself part of the pitch.

Next post: shipping the same agent two ways — FastAPI locally and AgentCore Runtime — without changing
the shape the frontend sees.

*Built with the Strands Agents SDK and Amazon Bedrock.*
