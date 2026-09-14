# Credential Recognition Ontology
Shared concepts the KB, the agents, and the reasoning all use. This is the "ontology layer" —
one vocabulary so a nurse pathway in Ontario and a nurse pathway in Germany are described in the
same terms and the reasoner can compare them.

## Entities
- **Applicant** — a person with a profession, country of training, and target jurisdiction.
- **Profession** — a regulated or unregulated occupation (e.g. Registered Nurse, Civil Engineer).
- **Jurisdiction** — a place that regulates practice, keyed `<COUNTRY>[-<SUBDIVISION>]`
  (CA-ON, US-NY, GB, AU, DE). Regulation is provincial/state/national, not global.
- **Regulator** — the legal body that grants the licence/registration in a jurisdiction (CNO, NMC,
  NMBA, State Anerkennungsbehörde). **The right to practise is granted here.**
- **Gateway** — an intake/verification body that feeds the regulator (NNAS, CGFNS, physiciansapply.ca,
  AHPRA, anerkennung-in-deutschland.de). Not the licensor; a prerequisite conduit.
- **Requirement** — a step the applicant must satisfy. Typed by `kind`:
  evaluation · language · exam · experience · bridging · registration · document · fee ·
  background_check · other.

## Requirement attributes that drive reasoning
- **valid_at** ∈ {application, registration_decision, exam, continuous} — the moment the artifact
  must STILL be valid. This is the crux: a language test valid at *application* but expired by the
  *registration_decision* is the classic failure. Encoding valid_at is what turns a checklist into
  a reasoner.
- **validity_months** — lifespan of the artifact once obtained (e.g. IELTS 24 months).
- **depends_on** — requirements that must complete first (the prerequisite graph).
- **body** — who administers this requirement (may differ from the regulator).
- **source** — the regulator URL the rule was read from (provenance for every claim).

## Relationships
- Applicant --targets--> Jurisdiction
- Jurisdiction --regulated_by--> Regulator
- Regulator --requires--> Requirement*
- Requirement --depends_on--> Requirement*
- Requirement --administered_by--> Body
- Profession --regulated_in--> Jurisdiction (boolean `regulated`; false => no licence, e.g. Software Engineer)

## Cross-jurisdiction equivalences (why one ontology helps)
- **Gateway**: NNAS (Canada) ≈ CGFNS (US, many states) ≈ AHPRA self-check (AU) ≈ Anerkennung
  equivalency (DE). Same slot, different body.
- **Exam**: NCLEX-RN (Canada + US + AU-cognitive) vs NMC CBT+OSCE (UK) vs Kenntnisprüfung (DE, if
  deficits). Same slot, different instrument.
- **Language**: IELTS/CELBAN/OET/TOEFL (English jurisdictions) vs German B2 + Fachsprachprüfung (DE).
- **Bridging**: adaptation course / Anpassungslehrgang (DE), NCAS competence assessment (BC).

## Conflict types the reasoner detects
1. **Expiry collision** — an artifact's validity window closes before a `valid_at` moment it gates.
2. **Prerequisite inversion** — a step scheduled before a `depends_on` it requires.
3. **Rejection cascade** — a rejected early step blocks all its dependents (insert remediation).
4. **Template mismatch** — applying a licensing template to an unregulated profession (refuse; say so).

## Provenance & honesty
Every requirement carries `source`; every ruleset carries `harvest_method` (curated|agent|hybrid),
`confidence`, and `needs_review`. Agent-harvested rules are unverified until a human clears them.
