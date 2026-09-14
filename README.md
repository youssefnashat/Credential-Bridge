# Credential Bridge

A licensing pathway navigator for internationally trained professionals.

Someone qualifies as a nurse in Manila, a physician in Lagos, an engineer in
Mumbai — and then arrives somewhere new and finds that the route back to their
own profession is a sequence of regulators, examinations and documents that
nobody hands them as a list. Credential Bridge maps that route, and watches it
for the deadline and prerequisite collisions that usually surface too late to
fix cheaply.

Built for the Agents for Humans hackathon, Good Neighbor track.

**This repository is the frontend only.** See
[The agent](#the-agent-and-what-this-repo-simulates) below.

---

## Run it

No build step, no dependencies, no install.

```
open index.html
```

Double-clicking the file works. If you would rather serve it:

```
python -m http.server 8000     # then visit http://localhost:8000
```

The only network request the page makes is to Google Fonts. Everything else is
local, and there is no backend to start.

## Deploy it

The whole thing is static files at the repository root, so any static host
works with zero configuration:

- **Netlify** — drag the folder onto the Netlify drop zone, or connect the
  repo and leave the build command empty with the publish directory set to `/`.
- **Vercel** — `vercel` from this directory, or import the repo and accept the
  detected "Other" framework preset. No build command, output directory `.`.
- **GitHub Pages** — enable Pages on the branch root.

## What it does

**Intake.** Name, profession, country trained in, target country and region.
All fields are required; missing ones get an inline error and the form does not
proceed. Where you trained is recorded on the case file and displayed, but it
does not drive the pathway — with one exception: if you trained in a region the
product covers, that region is greyed out as a target, because you are already
there.

**Dashboard.** A sidebar holds the applicant summary, your documents, and the
scenario controls. The main area has two tabs:

- **Pathway** — a vertical timeline of the licensing steps for that profession
  and region, beside a sticky panel that logs the agent's reasoning as it
  happens.
- **Drafted applications** — two editable documents prepared from the case file,
  each with a submit button that raises a confirmation. Nothing is really sent.

**Documents drive the pathway.** Nothing is pre-filled: at intake the case is
empty and every step is visibly waiting. The sidebar asks only for the documents
that this pathway actually uses, so a physician in Ontario is not asked for a
language test that the College of Physicians and Surgeons never requests. Each
step names the documents it runs on, and a step whose requirements are missing
or returned shows as waiting until they are met. Uploading is a real file input;
the file's name and size are read and displayed, the file itself never leaves
the browser tab, and nothing is uploaded anywhere.

That relationship is a derivation, not a stored flag: a step's displayed status
is computed from the documents every time it renders, which is why the sidebar
and the timeline can never disagree.

**Scenarios.** The sidebar sends events to the agent:

- *Trigger a schedule conflict* — the agent finds two steps in that specific
  pathway standing in a prerequisite or expiry relationship, marks both at risk,
  and explains the collision with dates and a recommendation. A bracket is drawn
  in the timeline gutter tying the two steps together. Where the conflict is
  read off a document's dates, the agent declines until that document is on
  file rather than inventing an expiry; where it is purely an examination
  calendar collision, it fires regardless.
- *Trigger a document rejection* — choose any document you have uploaded. The
  agent returns it with a reason specific to that document type, inserts a
  remediation step in front of the first step that needed it, and every
  dependent step goes back to waiting.
- *Reset the case* — clears the simulated events. Your uploaded files are kept.

**Software engineering is handled differently on purpose.** It is not a
regulated profession in any of these regions, so instead of forcing a licensing
template onto it the agent says so outright and maps work authorisation instead.
It is the clearest demonstration in the demo that the agent is reasoning about
the case rather than filling in a form.

## Pathways covered

Five professions across two countries and six regions, with the actual
regulatory body named for the region selected. The step *structure* is shared
across regions within a country; the labels reflect the real body — College of
Nurses of Ontario, California Board of Registered Nursing, APEGA, the Texas
Education Agency, and so on.

| Profession | Canada | United States |
|---|---|---|
| Registered Nurse | WES/NNAS evaluation → IELTS → bridging program → NCLEX-RN → provincial registration | CGFNS evaluation → NCLEX-RN → state licensure → VisaScreen |
| Doctor / Physician | MCC source verification → MCCQE Part I → NAC exam → CaRMS → provincial licensure | ECFMG → USMLE Step 1 / 2 CK → Match → Step 3 → state licensure |
| Civil Engineer | credential assessment → association application → technical exams → NPPE → supervised experience → P.Eng | NCEES evaluation → FE → EIT → experience → PE → state licensure |
| Teacher | credential evaluation → certification application → language proficiency → practicum → certificate | transcript evaluation → certification exams → background clearance → credential |
| Software Engineer | *not regulated* — ECA, language test, work permit or PR | *not regulated* — degree evaluation, employer petition, visa filing |

Adding a target country is a data change in `pathways.js`: give it an entry in
`CB.REGIONS`, a regulator set per region in `CB.BODIES`, pathways in
`CB.PATHWAYS`, and document requirements in `CB.STEP_DOCS`. The intake dropdown
is built from `CB.REGIONS`, so it appears on its own.

## The agent, and what this repo simulates

All reasoning in this application goes through a single function,
`getAgentReasoning(profile, event)` in [`agent.js`](agent.js). **In production
that function is a network call to the Credential Bridge reasoning agent, which
is a separate build on the Strands Agents SDK deployed to AWS (Bedrock
AgentCore Runtime) and is not part of this repository.** The real agent holds
the regulatory knowledge base, reasons over the applicant's live document set
and the actual regulator calendars, and returns its conclusions. In this repo
the same function is synchronous and deterministic: it composes its reasoning
from templates driven by the current profile and pathway state, so the product
experience can be demonstrated end to end without live infrastructure. No model
is invoked and no request leaves the browser. Swapping the simulation for the
real agent means replacing the body of that one function with a `fetch` and
awaiting it at its two call sites in `app.js` — the response shape is already
what the agent returns, and nothing else in the codebase changes. That
separation is deliberate: no reasoning text and no status decision is written
anywhere else in the UI code.

## Files

```
index.html      intake screen and dashboard markup
styles.css      all styling
pathways.js     regulators, pathway step templates, draft document templates
agent.js        getAgentReasoning() — the seam with the real agent
app.js          state and rendering only
```

State is held in memory and nothing is persisted — no `localStorage`, no
`sessionStorage`, no cookies, no backend, no uploads. Files chosen in the
document panel are read for their name and size only and never leave the tab.
Reloading the page starts a new case.

## Notes

- Fraunces for headings, IBM Plex Sans for the interface, IBM Plex Mono for
  dates, references and anything that behaves like record data.
- Responsive to phone width, keyboard navigable with visible focus, and
  `prefers-reduced-motion` is respected.
- The regulatory bodies, examination names and sequences are real. The dates,
  queue lengths and sitting calendars generated in the scenarios are plausible
  fabrications for the demo, not published schedules. Nothing here is advice.
