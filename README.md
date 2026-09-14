# Credential Bridge

A licensing pathway navigator for internationally trained professionals.

Someone qualifies as a nurse in Manila, a physician in Lagos, an engineer in
Mumbai — and then arrives somewhere new and finds that the route back to their
own profession is a sequence of regulators, examinations and documents that
nobody hands them as a list. Credential Bridge maps that route, tracks the
documents it depends on, and watches for the deadline and prerequisite
collisions that usually surface too late to fix cheaply.

Built for the Agents for Humans hackathon, Good Neighbor track.

**This repository is the frontend only.** The reasoning agent is a separate
build on the Strands Agents SDK deployed to AWS — see
[Connecting the backend](#connecting-the-backend).

---

## Run it

No build step, no dependencies, no install.

```
start index.html          # Windows
open index.html           # macOS
```

Double-clicking the file works. If you would rather serve it:

```
python -m http.server 8000     # then visit http://localhost:8000
npx serve .                    # or this
```

The only network request the page makes is to Google Fonts. There is no backend
to start.

## Deploy it

Static files at the repository root, so any static host works with zero
configuration:

- **Netlify** — drag the folder onto the drop zone, or connect the repo with an
  empty build command and the publish directory set to `/`.
- **Vercel** — `vercel` from this directory, or import the repo and accept the
  detected "Other" preset. No build command, output directory `.`.
- **GitHub Pages** — enable Pages on the branch root.

---

## What it does

### Intake

Applicant name, profession, country trained in, target country, target region.
Every field is required; a missing one gets an inline error and the form does
not proceed.

Country trained in is a dropdown of all 238 ISO 3166 countries and territories.
If you trained somewhere the product covers regions for, a **region trained in**
field appears — a nurse moving Ontario → British Columbia is a real case, not
just people arriving from abroad. Where you trained is recorded and displayed
but does not drive the pathway, with one exception: the region you trained in is
greyed out as a target, because you are already there.

Target country and region are dropdowns built from the pathway data, so adding a
country is a data change (see [Pathways covered](#pathways-covered)).

### Documents drive everything

Nothing is pre-filled. At intake the case is empty and every step is visibly
waiting.

The sidebar asks only for the documents **this** pathway actually uses, derived
from its steps — a physician in Ontario is never asked for a language test,
because the College of Physicians and Surgeons does not request one. Uploading
uses a real file input: the file's name and size are read and displayed, and the
file itself never leaves the browser tab.

Each step in the timeline names the documents it runs on, and a step whose
requirements are missing or returned shows as waiting until they are met. This
is a derivation, not a stored flag — a step's displayed status is recomputed
from the documents on every render, which is why the sidebar and the timeline
can never disagree.

### Pathway tab

A vertical timeline of licensing steps for that profession and region, each
naming the real regulator, beside a sticky panel that logs the agent's reasoning
as it happens. The log is not commentary bolted on: the entries and the step
changes are the same response from the agent, which is why they always agree.

When a conflict fires, a bracket is drawn in the timeline gutter physically
tying the two colliding steps together, labelled with the relationship.

### Drafted applications tab

Two editable documents prepared from the case file — a statement addressed to
the actual regulator, and a cover letter to whoever the applicant needs next (a
bridging program, a residency director, a supervising engineer). Submitting
raises a confirmation; nothing is sent.

### Scenarios

- **Trigger a schedule conflict** — the agent finds two steps standing in a
  prerequisite or expiry relationship, marks both at risk, and explains the
  collision with dates and a recommendation. Where the conflict is read off a
  document's dates, it declines until that document is on file rather than
  inventing an expiry. Where it is purely an examination calendar collision
  (NAC vs CaRMS, USMLE Step 2 CK vs the Match), it fires regardless.
- **Trigger a document rejection** — choose any document you have uploaded. The
  agent returns it with a reason specific to that document type, inserts a
  remediation step in front of the first step that needed it, and every
  dependent step goes back to waiting.
- **Reset the case** — clears simulated events. Uploaded files are kept.

### Software engineering is handled differently, on purpose

It is not a regulated profession in any of these regions, so rather than forcing
a licensing template onto it the agent says so outright and maps work
authorisation instead. It is the clearest demonstration that the agent reasons
about the case rather than filling in a form.

---

## Pathways covered

Five professions across two countries and six regions, naming the real
regulatory body for the region selected. Step *structure* is shared across
regions within a country; labels reflect the actual body — College of Nurses of
Ontario, California Board of Registered Nursing, APEGA, the Texas Education
Agency.

| Profession | Canada | United States |
|---|---|---|
| Registered Nurse | WES/NNAS evaluation → IELTS → bridging program → NCLEX-RN → provincial registration | CGFNS evaluation → NCLEX-RN → state licensure → VisaScreen |
| Doctor / Physician | MCC source verification → MCCQE Part I → NAC exam → CaRMS → provincial licensure | ECFMG → USMLE Step 1 / 2 CK → Match → Step 3 → state licensure |
| Civil Engineer | credential assessment → association application → technical exams → NPPE → supervised experience → P.Eng | NCEES evaluation → FE → EIT → experience → PE → state licensure |
| Teacher | credential evaluation → certification application → language proficiency → practicum → certificate | transcript evaluation → certification exams → background clearance → credential |
| Software Engineer | *not regulated* — ECA, language test, work permit or PR | *not regulated* — degree evaluation, employer petition, visa filing |

Adding a target country is a data change in `pathways.js`: an entry in
`CB.REGIONS`, a regulator set per region in `CB.BODIES`, pathways in
`CB.PATHWAYS`, and document requirements in `CB.STEP_DOCS`. The intake dropdown
is built from `CB.REGIONS`, so it appears on its own.

---

## Files

```
index.html      intake screen and dashboard markup
styles.css      all styling
pathways.js     regulators, step templates, document requirements, drafts
agent.js        getAgentReasoning() — the seam with the real agent
app.js          state and rendering only
```

`app.js` never writes reasoning text and never decides a step's status. It
collects the profile, records uploads, asks the agent, applies the response, and
draws the result.

State is held in memory: no `localStorage`, no `sessionStorage`, no cookies, no
backend, no uploads. Reloading starts a new case.

---

## Connecting the backend

All reasoning goes through **one function**, `getAgentReasoning(profile, event)`
in `agent.js`. In this repo it is synchronous and composes templated text from
the current state — no model is called and no request leaves the browser. In
production it is a call to the Credential Bridge agent, a separate build on the
**Strands Agents SDK** deployed to AWS (Bedrock AgentCore Runtime), which holds
the regulatory knowledge base and reasons over the applicant's real document set
and live regulator calendars.

Swapping the simulation for the real agent means replacing the body of that one
function. Nothing else changes, because nothing else knows the agent exists.

### 1. Replace the function body

```js
const AGENT_ENDPOINT = 'https://<your-agent>.execute-api.<region>.amazonaws.com';

async function getAgentReasoning(profile, event) {
  const res = await fetch(`${AGENT_ENDPOINT}/reason`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ profile, event })
  });
  if (!res.ok) throw new Error(`agent ${res.status}`);
  return res.json();     // the response shape below
}
```

### 2. Await it at the four call sites in `app.js`

They are the only places the agent is invoked: `openCase()`, `attachFile()`,
`detachFile()` and `simulate()`. Each currently reads:

```js
applyReasoning(CB.getAgentReasoning(state.profile, event));
renderSidebar(); renderPathway(); renderLog();
```

and becomes:

```js
const result = await CB.getAgentReasoning(state.profile, event);
applyReasoning(result);
renderSidebar(); renderPathway(); renderLog();
```

Add a pending state while the request is in flight — the reasoning panel is the
natural place for it, since that is what the user is waiting on.

### 3. Request

```jsonc
{
  "profile": {
    "name": "Ana Reyes",
    "profession": "Registered Nurse",       // one of the five
    "trainedIn": "Philippines",             // ISO 3166 name
    "trainedInRegion": "",                  // set only for covered countries
    "country": "Canada",                    // target
    "region": "Ontario",                    // target
    "caseRef": "CB-2026-8537"
  },
  "event": {
    "type": "document.uploaded",
    "steps": [ /* the current pathway */ ],
    "documents": [ /* the current document set */ ],
    "document": {
      "id": "transcripts",
      "name": "Academic transcripts",
      "file": { "name": "transcripts.pdf", "size": "57 B", "added": "20:43:57" }
    },
    "targetDocId": "transcripts"            // rejection.simulate only
  }
}
```

| `event.type` | Sent when | Extra fields |
|---|---|---|
| `pathway.build` | intake completed | — |
| `document.uploaded` | a file is attached | `document` |
| `document.removed` | a file is withdrawn | `document` |
| `conflict.simulate` | conflict button | — |
| `rejection.simulate` | rejection button | `targetDocId` |
| `pathway.reset` | reset button | — |

Every event carries `steps` and `documents`, so the agent is always handed the
full current state and needs no server-side session.

A **step**:

```jsonc
{
  "id": "nclex",
  "title": "NCLEX-RN examination",
  "authority": "NCSBN, seat booked through College of Nurses of Ontario",
  "detail": "Computer-adaptive licensure exam. The college issues the authorisation to test.",
  "months": 3,
  "status": "not-started",       // complete | in-progress | upcoming | not-started | at-risk
  "requires": ["eval", "language", "identity"],
  "completeOnDocs": false,
  "flag": null
}
```

A **document**:

```jsonc
{
  "id": "language",
  "name": "Language proficiency test",
  "status": "on-file",           // missing | on-file | flagged | rejected
  "file": { "name": "ielts.pdf", "size": "33 B", "added": "20:43:58" }
}
```

### 4. Response

```jsonc
{
  "entries": [                             // log entries, in reading order
    {
      "kind": "conflict",                  // plan | watch | document | conflict | rejection | reset
      "title": "Language result expires before registration",
      "body": [
        "Your IELTS result was issued `12 November 2024` and lapses `12 November 2026`.",
        "**Recommendation.** Book a retest between `12 December 2026` and `10 February 2027`."
      ]
    }
  ],
  "stepUpdates":  [ { "id": "language", "status": "at-risk", "flag": "Conflicts with …" } ],
  "insertBefore": { "beforeId": "eval", "step": { /* a full step object */ } },
  "docUpdates":   [ { "id": "language", "state": "flagged", "status": "Expiring", "tone": "amber" } ],
  "tie":          { "fromId": "language", "toId": "registration", "label": "language result expires" },
  "rebuild":      false
}
```

| Field | Effect |
|---|---|
| `entries[]` | Appended to the reasoning panel. Newest response on top, order within a response preserved |
| `stepUpdates[]` | Sets `status` and `flag` on matching steps. In practice only `at-risk` is worth sending — see below |
| `insertBefore` | Splices a remediation step in front of `beforeId`. Ignored if a step with that `id` already exists |
| `docUpdates[]` | `state` is the machine state, `status` is the badge text, `tone` is `teal` / `amber` / `rust` / `mute` |
| `tie` | Draws the bracket in the timeline gutter between two steps |
| `rebuild` | Regenerates the pathway from the profile and clears flags, keeping uploaded files |

Every field is optional. Returning `{ "entries": [...] }` alone is valid and
just writes to the log.

`entries[].body` is an array of plain-text paragraphs with two markers, applied
**after** HTML escaping, so the agent can never inject markup:

- `**bold**` → emphasis
- `` `mono` `` → dates, counts and references in the monospace face

### What the agent must not send

Steps blocked by a missing or rejected document are **not** part of the
response. That is derived at render time from `documents` plus `step.requires`,
so the timeline cannot drift out of sync with the sidebar. Send `docUpdates` to
mark a document returned and the affected steps follow automatically.

Likewise, do not send `status: "complete"` for a step whose completion is
already implied by its documents — `completeOnDocs` handles that.

### Notes for the AWS side

- **CORS** — the page is static and same-origin with nothing, so the endpoint
  needs `Access-Control-Allow-Origin` for the deploy domain and must answer the
  preflight `OPTIONS`.
- **Auth** — there is no login in this build. A short-lived token minted per
  session, or an API Gateway authorizer, is the smallest thing that works.
- **Latency** — every event round-trips, including each document upload. If the
  agent is slow, `document.uploaded` is the one worth answering optimistically:
  the upload is a fact the frontend has already recorded, and only the
  commentary needs the model.
- **File contents** — nothing is uploaded today, only names and sizes. If the
  real agent should read the documents, that is a second endpoint (presigned S3
  PUT, then pass the key in `event.document`), not a change to this contract.
- **Determinism** — the demo returns the same reasoning for the same state. A
  real model will not, which is fine, but responses must stay schema-valid: the
  frontend applies known fields and ignores unknown ones.

---

## Notes

- Fraunces for headings, IBM Plex Sans for the interface, IBM Plex Mono for
  dates, references and anything that behaves like record data.
- Responsive to phone width, keyboard navigable with visible focus, and
  `prefers-reduced-motion` respected.
- All user input is HTML-escaped before rendering.
- The regulatory bodies, examination names and sequences are real. The dates,
  queue lengths and sitting calendars generated in the scenarios are plausible
  fabrications for the demo, not published schedules. Nothing here is advice.
