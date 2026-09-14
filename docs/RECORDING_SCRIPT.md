# Recording script — Credential Bridge (target 4:40, hard limit 5:00)

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
**Delivery:** read each part once, then say it in your own words. It should sound like you explaining your project to a friend, not reading. Small stumbles are fine.

---

## Part 1 — Slides 1–5 (0:00–1:20)

Devpost asks the pitch to cover three things. Each one is said out loud below, plainly, so judges can't miss it:
**(1) the problem** → slide 2 · **(2) who it's for** → slide 3 · **(3) why it matters** → slide 4.

**Slide 1 · Title** (0:00–0:10)
> "Hi, we're Kanwar and Youssef, and this is Credential Bridge. We built it for the Agents for Humans hackathon, in the Good Neighbor track. It's an AI agent, built with Strands, that helps people who trained in another country work out how to get licensed again."

**Slide 2 · The licensing maze** (0:10–0:45) — **(1) the problem**
> "So here's the problem. If you're a nurse, a doctor, an engineer or a teacher and you move to a new country, you usually can't just start working. You have to get licensed again by the local regulator. That means a lot of steps: getting your education assessed, a language test, an application, exams, a background check. They have to happen in a certain order, and that order is different depending on your job and where you're moving to.
>
> The part that really hurts people is timing, because some of these documents expire. For a nurse in Ontario, the police check is only good for six months, and the language test still has to be valid when the College makes its decision. So if one step gets delayed, something else can expire, and you end up paying for it again and waiting months longer. This slide is one example: a nurse moving to Ontario. That's nine steps."

**Slide 3 · Two groups, one pathway** (0:45–1:02) — **(2) who it's for**
> "We built this for two groups. First, the people going through it. Second, the caseworkers at settlement agencies and nonprofits who help them. A caseworker can have dozens of clients, all in different jobs and different provinces, and they're mostly working from checklists. A checklist tells you what the steps are, but it won't warn you when two of them are about to clash."

**Slide 4 · Unlocking expertise** (1:02–1:15) — **(3) why it matters**
> "Why does this matter? A lot of these are jobs we're short of people for, like nurses and engineers. When the process is this hard, qualified people end up waiting a long time, or working jobs well below what they trained for. Getting the pathway right saves them time and money, and it means one caseworker can help more people."

**Slide 5 · Live demo** (1:15–1:20)
> "So let me show you how it works with a real case."

---

## Part 2 — The live app (1:20–4:00) · shows it **working**

**Build the pathway** (1:20–2:10) — *speed up the wait*
Fill in: Aida Torres · Registered Nurse · trained in Philippines · Canada · Ontario → **Build pathway**.
> "Aida trained as a nurse in the Philippines and wants to practise in Ontario. The agent first calls its grounding tool — a knowledge base of real regulator rules — and then builds her pathway in order."

When it loads: scroll the steps, hover or click one **source ↗** link, point at the **Regulator** line.
> "Every step links to the regulator's own page — here, the College of Nurses of Ontario. The agent reads the rules; it doesn't make them up."

*[read from screen]* the first sentence of the **Agent reasoning** entry (e.g. its timeline estimate).

**Simulate a schedule delay** (2:10–3:00) — *speed up the wait*
> "Now the thing we talked about happens: her schedule slips."

Point at the steps marked **at-risk**.
> "The agent re-checks the pathway it built and finds what no longer lines up."

*[read from screen]* the conflict and the recommendation in the log. (In the dry run it was the six-month police check expiring before the College's registration decision.)
> "A checklist would show both of those as fine. The agent catches the collision, with the actual dates, and says what to do."

**Simulate a document rejection** (3:00–3:20)
> "If a document is rejected, the agent inserts a remediation step right after it and holds everything that depends on it."

**Unregulated profession** (3:20–3:50)
New case: Wei Chen · Software Engineer · trained in China · Canada · Ontario → **Build pathway**.
> "Now a software engineer. There's no licence to get for this in Ontario — and the agent says so instead of forcing a licensing template on him. It gives a short work-authorization path. That's judgment, not a form."

**Optional — many cases at once** (3:50–4:00), terminal:
`cd backend && CREDBRIDGE_URL=http://localhost:8010 .venv/bin/python demo_concurrent.py`
> "A caseworker never has just one case — here are five running in parallel, each saved separately."

---

## Part 3 — Slides 6, 8, 9 (4:00–4:40)

**Slide 6 · How it works** (4:00–4:20)
> "Under the hood: a Strands agent running Claude, with three tools — a knowledge base of real regulator rules across seven jurisdictions, and date math for expiry windows. Regulator names and source links are enforced in code, so the model can't invent them. The same agent is deployed on Amazon Bedrock AgentCore Runtime."

*(Slide 7 · Judgment is optional — skip it if you're over time.)*

**Slide 8 · Results** (4:20–4:35)
> "In our live evaluation on Amazon Bedrock it passed seven of seven scenarios, and ninety-five percent of steps cite the right regulator's own rules — with zero invented sources. For this recording it runs on the Claude API; the code is the same."

**Slide 9 · Close** (4:35–4:40)
> "Credential Bridge — restoring professional dignity to newcomers, and helping them get back to the work they trained for. The code is open source on GitHub."

---

## If you're over time — cut in this order
1. The concurrency segment (−10 s)
2. Slide 7 (if you used it)
3. The rejection segment (−20 s)

**Never cut the delay segment** — it's the payoff for the problem you set up in Part 1.

## After recording
- Export 1080p → upload to YouTube with visibility **Public** (not Unlisted).
- Send the link — it goes into `README.md` and `docs/DEVPOST.md`.
