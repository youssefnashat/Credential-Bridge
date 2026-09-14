# Agents for Humans: grounding a Strands agent so it doesn't invent licensing steps

*Build log — Credential Bridge, Good Neighbor track.*

## The trap
Ask a general-purpose LLM "how does an internationally trained nurse get licensed in Ontario?" and it
will answer fluently and sometimes wrongly — an exam that doesn't apply, a body that doesn't exist, a
validity window that's off. For a tool a settlement caseworker relies on, a confident wrong answer is
worse than no answer. So the first design decision in Credential Bridge was: the model reasons, but it
does not *remember* the rules. It reads them.

## The knowledge base
We built a per-jurisdiction compliance KB — one JSON file per (profession, jurisdiction) under
`kb/store/`, validated against a JSON Schema by `kb/pipeline/build_kb_index.py`. It currently holds 8
curated rulesets (Registered Nurse in Ontario, BC, New York, California, the UK, Australia and Germany;
Civil Engineer in Ontario). A smaller curated table, `regulators.json`, fills gaps for pairs not yet in
the KB. The reasoning-critical fields aren't the obvious ones:

- `valid_at`: must this artifact be valid at *application*, at the *registration decision*, at the
  *exam*, or continuously? A language test valid at application but expired by the decision is exactly
  the kind of problem a checklist can't see. Encoding it gives the agent something to reason over.
- `validity_months`: how long the artifact lives once obtained.
- `depends_on`: the prerequisite graph.

Every requirement carries a `source` URL back to the regulator's (or administering body's) page, and
every ruleset carries `confidence` and `needs_review`.

## The Strands piece
The agent gets a tool, not a paragraph:

```python
@tool
def get_regulator_rules(profession: str, target_country: str, target_region: str) -> str:
    """Return grounded licensing reference data ... or a flag that the profession is
    unregulated / the region is unknown. Returns JSON."""
    return json.dumps(lookup(profession, target_country, target_region))
```

`lookup()` maps the free-text profile ("Canada" / "Ontario", "United Kingdom" / "England", "Germany")
to a jurisdiction key, reads the KB first, falls back to the compact table, and returns
`unknown_region` rather than guessing when it has nothing.

The system prompt tells the agent to call this tool first and never to invent a regulator, exam or URL
that isn't in what it returns. Two more `@tool` functions, `today` and `months_between`, handle date
arithmetic. The model's job is the part that's genuinely reasoning: ordering the steps, spotting the
expiry collision, and explaining it in plain language.

Output goes through Strands structured output into the same pydantic `ReasonResponse` that FastAPI
uses as its response model, so the `/reason` contract the frontend depends on is enforced at the
boundary: callers get a valid object or an error, not a malformed one.

## What we guarded against
Strands' structured-output API has moved between releases — in the version we installed (1.55.1), the
older `Agent.structured_output` method is marked deprecated. So `reason()` has a fallback: if structured
output fails, it makes a plain call, takes the largest JSON block in the reply, and validates it against
the same pydantic model. If nothing validates, it raises. Make the happy path clean and the fallback
boring.

## How we check it
Without AWS, `backend/tests_smoke.py` asserts that every ruleset in `kb/store` is reachable from a
natural-language profile and that an unknown country never lands on a guessed jurisdiction. With
Bedrock, the check is simple: take each `sourceUrl` in a response and confirm it appears in the KB or
fallback data for that profile. In our live run of 7 scenarios (`docs/evidence/eval-20260914T012945Z.json`),
52 of 55 steps cited a URL from the target jurisdiction's curated ruleset, none cited an
off-jurisdiction or invented URL, and 3 carried no citation. That shows provenance, not correctness:
every link is traceable, but a human still has to confirm what each step says.

Next post: making the agent's *judgment* the thing the audience actually sees.

*Built with the Strands Agents SDK and Claude Sonnet 4.6 (us.anthropic.claude-sonnet-4-6) on Amazon Bedrock, us-west-2.*
