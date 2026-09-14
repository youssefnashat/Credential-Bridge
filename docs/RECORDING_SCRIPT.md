# Recording script — Credential Bridge (target 4:20, hard limit 5:00)

Devpost requires: a public YouTube/Vimeo video ≤ 5 min that shows the project **working** and pitches
**(1) the problem, (2) who it's for, (3) why it matters**. Every section below is tagged with what it covers.
Slides: `docs/slides.html` (open in Chrome → **F** full screen, **H** hide controls, **→ / ←** to move).
Detailed beat plan + command sheet: `docs/VIDEO_SCRIPT.md`.

## Before you hit record
- [ ] Backend running on **:8010** — `curl -s localhost:8010/health` → `{"status":"ok"}`
- [ ] App tab: `http://localhost:8765/AWS-HACKATHON-credential-bridge/?api=http://localhost:8010` (the `?api=` part is required)
- [ ] Session list empty: `ls backend/data/sessions` shows nothing (don't run the tests before recording — they add sessions)
- [ ] Do Not Disturb on · bookmarks bar hidden (Cmd+Shift+B) · unrelated tabs closed · browser zoom ~110%
- [ ] Record: **Cmd+Shift+5** → Options → Microphone. One clip per part; speed up agent waits in the edit.

**Rule:** where it says *[read from screen]*, say what the agent actually returned on that take — never a scripted date.

---

## Part 1 — Slides 1–5 (0:00–1:00)

**Slide 1 · Title** (0:00–0:08)
> "This is Credential Bridge — an AI agent that maps the licensing pathway for internationally trained professionals. Built with the Strands Agents SDK for the Agents for Humans hackathon, Good Neighbor track."

**Slide 2 · The licensing maze** (0:08–0:30) — **(1) the problem**
> "Before Aida, a nurse trained in the Philippines, can work in Ontario, she has nine steps to clear — a credential assessment, a language test, registration, a jurisprudence exam, the national NCLEX exam, and more. The order matters, the rules change by province and country, and documents expire. Her police check, for example, is only valid for six months. One expired document can send her back months."

**Slide 3 · Two people, one pathway** (0:30–0:45) — **(2) who it's for**
> "Credential Bridge is for two people: the skilled newcomer trying to get back to their profession, and the settlement caseworker — usually at a nonprofit — who guides dozens of these cases, mostly by hand."

**Slide 4 · Unlocking expertise** (0:45–0:55) — **(3) why it matters**
> "These are shortage professions. Every month a qualified nurse spends stuck in paperwork is a month she isn't working as a nurse — and a correct, conflict-checked pathway lets one caseworker help more people."

**Slide 5 · Live demo** (0:55–1:00)
> "Let's run a real case."

---

## Part 2 — The live app (1:00–3:40) · shows it **working**

**Build the pathway** (1:00–1:50) — *speed up the wait*
Fill in: Aida Torres · Registered Nurse · trained in Philippines · Canada · Ontario → **Build pathway**.
> "The agent first calls its grounding tool — a knowledge base of real regulator rules — and then builds her pathway in order."

When it loads: scroll the steps, hover or click one **source ↗** link, point at the **Regulator** line.
> "Every step links to the regulator's own page — here, the College of Nurses of Ontario. The agent reads the rules; it doesn't make them up."

*[read from screen]* the first sentence of the **Agent reasoning** entry (e.g. its timeline estimate).

**Simulate a schedule delay** (1:50–2:40) — *speed up the wait*
> "Now something goes wrong: her schedule slips."

Point at the steps marked **at-risk**.
> "The agent re-checks the pathway it built and finds what no longer lines up."

*[read from screen]* the conflict and the recommendation in the log. (In the dry run it was the six-month police check expiring before the College's registration decision.)
> "A checklist would show both of those as fine. The agent catches it, with the actual dates, and says what to do."

**Simulate a document rejection** (2:40–3:00)
> "If a document is rejected, the agent inserts a remediation step right after it and holds everything that depends on it."

**Unregulated profession** (3:00–3:30)
New case: Wei Chen · Software Engineer · trained in China · Canada · Ontario → **Build pathway**.
> "Now a software engineer. There's no licence to get for this in Ontario — and the agent says so instead of forcing a licensing template on him. It gives a short work-authorization path. That's judgment, not a form."

**Optional — many cases at once** (3:30–3:40), terminal:
`cd backend && CREDBRIDGE_URL=http://localhost:8010 .venv/bin/python demo_concurrent.py`
> "An agency runs many cases at once — here are five caseworker cases running in parallel, each saved separately."

---

## Part 3 — Slides 6, 8, 9 (3:40–4:20)

**Slide 6 · How it works** (3:40–4:00)
> "Under the hood: a Strands agent running Claude, with three tools — a knowledge base of real regulator rules across seven jurisdictions, and date math for expiry windows. Regulator names and source links are enforced in code, so the model can't invent them. The same agent is deployed on Amazon Bedrock AgentCore Runtime."

*(Slide 7 · Judgment is optional — skip it if you're over time.)*

**Slide 8 · Results** (4:00–4:15)
> "In our live evaluation on Amazon Bedrock it passed seven of seven scenarios, and ninety-five percent of steps cite the right regulator's own rules — with zero invented sources. For this recording it runs on the Claude API; the code is the same."

**Slide 9 · Close** (4:15–4:20)
> "Credential Bridge — restoring professional dignity to newcomers, and helping them get back to the work they trained for. The code is open source on GitHub."

---

## If you're over time — cut in this order
1. The concurrency segment (−10 s)
2. Slide 7 (if you used it)
3. The rejection segment (−20 s)

**Never cut the delay segment** — it's the moment that shows the agent reasoning.

## After recording
- Export 1080p → upload to YouTube with visibility **Public** (not Unlisted).
- Send the link — it goes into `README.md` and `docs/DEVPOST.md`.
