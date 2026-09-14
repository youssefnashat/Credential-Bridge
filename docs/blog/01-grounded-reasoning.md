# Agents for Humans: grounding a Strands agent so it never hallucinates a licensing step

*Build log — Credential Bridge, Good Neighbor track.*

## The trap
Ask any LLM "how does an internationally trained nurse get licensed in Ontario?" and it will answer
fluently and sometimes wrongly — a made-up exam, a body that doesn't exist, a validity window off by
a year. For a tool a settlement caseworker relies on, a confident wrong answer is worse than no answer.
So the first design decision in Credential Bridge was: the model reasons, but it does not *remember*
the rules. It reads them.

## The knowledge base
We built a per-jurisdiction compliance KB — one JSON file per (profession, jurisdiction), validated
against a schema. The reasoning-critical fields aren't the obvious ones; they're:

- `valid_at`: does this artifact need to be valid at *application*, or at the *registration decision*?
  A language test valid at application but expired by the decision is the single most common way a
  packet dies. Encoding this is what lets the agent catch the collision instead of listing steps.
- `validity_months`: how long the artifact lives once obtained.
- `depends_on`: the real prerequisite graph.

Every requirement carries its `source` URL back to the regulator's own page.

## The Strands piece
The agent gets a tool, not a paragraph:

```python
@tool
def get_regulator_rules(profession: str, target_country: str, target_region: str) -> str:
    "Grounded licensing data (regulator, exams, language validity, source URL) or an unregulated flag."
    return json.dumps(lookup(profession, target_country, target_region))
```

The system prompt forbids inventing anything not returned by that tool. The model's job is the part
that's genuinely reasoning — ordering the steps, spotting the expiry collision, explaining it in plain
language — not recalling facts it might get wrong. Output is a pydantic `structured_output`, so the
`/reason` contract the frontend depends on can never come back malformed.

## What broke
`structured_output` raised on one SDK version mid-build. Rather than pin and pray, we wired a fallback:
if it throws, the agent makes a normal call and we parse the largest JSON block. The endpoint returns a
valid contract object either way. Lesson for a 24-hour build: make the happy path clean and the fallback
boring.

## Result
Every pathway step in the demo traces to a regulator URL. When a judge asks "is this made up?", the
answer is a link. Next post: making the agent's *judgment* the thing the audience actually sees.

*Built with the Strands Agents SDK and Amazon Bedrock (Claude 3.7 Sonnet, us-west-2).*
