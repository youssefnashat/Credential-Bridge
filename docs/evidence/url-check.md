# Source URL check (T7)

Checked 2026-09-13. Scope: every URL in `kb/store/**/*.json` (ruleset `source` and each requirement `source`), `kb/sources/*.jsonl`, and `backend/reference/regulators.json` (report only, not edited).

Method: `curl -sSL -o /dev/null -w '%{http_code} %{url_effective}' --max-time 20 -A 'Mozilla/5.0'` on every unique URL. Every 403, 404, timeout and cross-domain redirect was then re-checked with WebFetch and/or a same-domain web search. A replacement was made only when the new page is on the same organisation's domain, returned 200, and its content was fetched and confirmed to cover the same requirement.

**Summary: 39 unique URLs, with 21 OK, 5 REDIRECT-OK, 3 BOT-BLOCKED, 10 DEAD, 0 REDIRECT-GENERIC and 0 WRONG-TOPIC. 7 of the 10 DEAD URLs were replaced with verified pages on the same domain. 3 remain dead: 1 in `kb/sources` with no safe replacement, and 2 in `regulators.json`, which this task reports on but does not edit.**

Key to "where used": `store/X/y#source` is a ruleset source; `#reqN` is a requirement source; `queue:Ln` is `kb/sources/harvest_queue.jsonl`; `registry:Ln` is `kb/sources/registry.jsonl`; `regs` is `backend/reference/regulators.json`.

| URL | Where used | Status | Final URL | Action |
|---|---|---|---|---|
| https://www.ncsbn.org/exams.htm | store/CA-ON/registered-nurse#req4, CA-BC#req4, US-CA#req4, US-NY#req3 | DEAD (404) | — | Replaced with https://www.ncsbn.org/exams.page (200; page heading "NCLEX: The Premier Licensure Exam") |
| https://www.cno.org/en/become-a-nurse/registration-requirements/internationally-educated-nurses/ | store/CA-ON/registered-nurse#source, #req2; regs | DEAD (404) | — | `#source` changed to https://www.cno.org/become-a-nurse/registration-guides/outside-canada (200; CNO "registration guide for nurses educated outside Canada", which lists the registration requirements). `#req2` changed to https://cno.org/become-a-nurse/registration-requirements/proficiency-in-english-or-french/accepted-language-proficiency-tests (200; lists CELBAN, IELTS, OET, PTE, TEF and TCF, with results valid "within two years" of registering). `needs_review` set to true and a note added. |
| https://www.nmc.org.uk/registration/joining-the-register/trained-outside-the-uk/ | store/GB/registered-nurse#source, #req1; regs | DEAD (404) | — | Replaced with https://www.nmc.org.uk/registration/joining-the-register/register-nurse-midwife/trained-outside-uk/ (200; NMC "Register as a nurse or midwife if you trained outside the UK", which covers the eligibility checklist, Test of Competence and English language). Note added. |
| https://www.rn.ca.gov/applicants/lic-intl.shtml | store/US-CA/registered-nurse#source, #req1, #req2; regs | DEAD (404) | — | `#source` and `#req1` changed to https://www.rn.ca.gov/applicants/lic-exam.shtml (200; BRN Licensure by Examination, covering international transcripts, the "Breakdown of International Nursing Educational Program" form and NCLEX-RN). `#req2` changed to https://www.rn.ca.gov/pdfs/education/edp-i-35.pdf (200; BRN guideline "CA RN Licensure Qualifications for Graduates of International Nursing Program", CCR 1413 English comprehension). Note added. |
| https://nurses.ab.ca/apply-here/internationally-educated-nurses/ | queue:L1; regs | DEAD (404) | — | Replaced in queue with https://www.nurses.ab.ca/nursing-in-alberta/international-applicants/ (200; CRNA "International Applicants") |
| https://www.bon.texas.gov/licensure_endorsement.asp | queue:L2; regs | DEAD (404) | — | Replaced in queue with https://www.bon.texas.gov/licensure_endorsement.asp.html (200; Texas BON Licensure by Endorsement, with separate internationally educated RN instructions) |
| https://www.nmbi.ie/Registration/Trained-outside-Ireland | queue:L3 | DEAD (404) | — | Replaced in queue with https://www.nmbi.ie/Registration/Qualified-outside-the-EU (200; NMBI "Qualified Outside the EU", covering recognition then registration) |
| https://cpq.ecctis.com/ | registry:L6 | DEAD (DNS NXDOMAIN) | — | Not replaced: no page on ecctis.com mentions CPQ (checked https://ecctis.com/uk-gov/). A `note` was added to the registry line. The successor is on another domain, so a human must decide (see below). |
| https://www.op.nysed.gov/professions/professional-engineering | regs | DEAD (404) | — | Report only. Same-domain candidate: https://www.op.nysed.gov/professions/engineering/license-requirements (200) |
| https://www.nysed.gov/educator-integrity/teacher-certification | regs | DEAD (404) | — | Report only. Same-domain candidate: https://www.nysed.gov/teaching-initiatives (200; Office of Teaching Initiatives) |
| https://www.peo.on.ca/apply/become-professional-engineer | store/CA-ON/civil-engineer#source, #req1; regs | BOT-BLOCKED (Cloudflare 403 challenge) | same | None. The exact URL is indexed as "Become a Professional Engineer \| Professional Engineers Ontario". |
| https://www.peo.on.ca/ | store/CA-ON/civil-engineer#req2, #req3, #req4 | BOT-BLOCKED (Cloudflare 403) | same | None. Homepage. A nonexistent path on this domain also returns 403. |
| https://www.egbc.ca/Registration | queue:L4; regs | BOT-BLOCKED (Cloudflare 403) | same | None. Not fetchable: every egbc.ca path, including nonexistent ones, returns 403. The Wayback Machine recorded a 302 in Jan 2024, and pages under `/registration/` are still indexed. It is a section hub, not the page for applicants trained abroad. |
| https://www.cgfns.org/services/ | store/US-NY/registered-nurse#req1 | REDIRECT-OK | https://www.trumerit.org/services/ | None. The same organisation rebranded as TruMerit (the page shows "Our New Name" and "CGFNS CONNECT"), and it covers credential evaluation for foreign-educated nurses. Noted in the US-NY ruleset. |
| https://www.op.nysed.gov/professions/registered-professional-nursing | store/US-NY/registered-nurse#source, #req2; regs | REDIRECT-OK | https://www.op.nysed.gov/registered-professional-nursing | None |
| https://www.cpso.on.ca/en/Physicians/Registration | queue:L6; regs | REDIRECT-OK | https://www.cpso.on.ca/Physicians/Registration | None |
| https://www.oct.ca/becoming-a-teacher/internationally-educated-teachers | queue:L7; regs | REDIRECT-OK | https://www.oct.ca/en-ca/becoming-a-teacher/requirements/internationally-educated-teachers/overview | None |
| https://www.op.nysed.gov/professions/medicine | regs | REDIRECT-OK | https://www.op.nysed.gov/professions-index/medicine | None |
| https://www.nursingmidwiferyboard.gov.au/Registration-Standards.aspx | store/AU/registered-nurse#source, #req2; regs | OK | same | None |
| https://www.ahpra.gov.au/ | store/AU#req1, #req5; registry:L7 | OK (homepage) | same | None |
| https://www.nursingmidwiferyboard.gov.au/ | store/AU#req3, #req4 | OK (homepage) | same | None |
| https://www.bccnm.ca/RN/applications_registration/Pages/Default.aspx | store/CA-BC#source, #req2; regs | OK | same | None |
| https://www.bccnm.ca/ | store/CA-BC#req3 | OK (homepage) | https://www.bccnm.ca/Pages/Default.aspx | None |
| https://www.nnas.ca/ | store/CA-BC#req1, CA-ON#req1 | OK (homepage) | same | None |
| https://www.cno.org/ | store/CA-ON#req3, #req5 | OK (homepage) | same | None |
| https://www.anerkennung-in-deutschland.de/en/interest/finder/profession | store/DE#source, #req1; regs | OK | same | None |
| https://www.anerkennung-in-deutschland.de/ | store/DE#req2–#req5 | OK (homepage) | https://www.anerkennung-in-deutschland.de/html/de/index.php | None |
| https://www.nmc.org.uk/ | store/GB#req2–#req5 | OK (homepage) | same | None |
| https://www.rn.ca.gov/ | store/US-CA#req3 | OK (homepage) | same | None |
| https://www.op.nysed.gov/ | store/US-NY#req4 | OK (homepage) | same | None |
| https://www.apega.ca/apply | queue:L5; regs | OK | same | None |
| https://www.ontario.ca/page/work-your-profession-or-trade | registry:L1 | OK | same | None |
| https://www.alberta.ca/regulatory-bodies | registry:L2 | OK | same | None |
| https://www2.gov.bc.ca/gov/content/governments/organizational-structure/ministries-organizations/regulatory-authorities/list | registry:L3 | OK | same | None |
| https://www.cicic.ca/902/explorez_le_repertoire_des_profils_des_professions.canada | registry:L4 | OK | same | None |
| https://ec.europa.eu/growth/tools-databases/regprof/ | registry:L5 | OK | same | None |
| https://www.bpelsg.ca.gov/applicants/ | regs | OK | same | None |
| https://pels.texas.gov/ | regs | OK | same | None |
| https://www2.gov.bc.ca/gov/content/education-training/k-12/teach/teacher-regulation | regs | OK | same | None |

## Post-fix verification
- A re-curl of every URL now in `kb/store` and `kb/sources` returns 200, except the three Cloudflare-blocked pages (PEO ×2, EGBC) and `cpq.ecctis.com`.
- `backend/.venv/bin/python kb/pipeline/build_kb_index.py` passes (8 rulesets, 7 jurisdictions).
- `backend/tests_smoke.py` passes.

## For a human to check
1. **`regulators.json` still holds 7 dead URLs**: CNO IEN, NMC, BRN lic-intl, CRNA, Texas BON, NYSED PE and NYSED teacher. If the backend fills `regulatorUrl` from this file, the demo can still show a 404. The same-domain replacements verified above can be swapped in by the backend owner.
2. **CA-ON nurse, NNAS step**: CNO's current outside-Canada guide names approved education credential assessment (ECA) providers, not NNAS. Re-verify `gateway: "NNAS"` and req1.
3. **US-CA nurse, language step**: the BRN guideline (CCR 1413) requires an English exam only when the Board has "reasonable doubt" and does not name TOEFL. Re-verify req2's name and `validity_months`.
4. **CA-ON civil engineer**: the PEO pages can't be fetched past Cloudflare. A search snippet from peo.on.ca says the minimum experience changed from four years to two on July 1, 2026, while req3 says "48 months". Check this in a browser.
5. **GB registry source**: `cpq.ecctis.com` no longer resolves. Search says the UK CPQ "is no longer able to support users of the Regulated Professions Register"; the official successor is https://www.regulated-professions.service.gov.uk/ (200). That is a GOV.UK domain, not Ecctis, so it was left for a human decision.
6. **EGBC `/Registration`** (harvest queue) couldn't be confirmed past Cloudflare. A likely better target, found in search but also blocked: https://www.egbc.ca/how-to-apply/register-as-an-engineer/professional-engineer/apply-to-be-a-professional-engineer-in-bc
7. **Homepage citations**: ten KB step sources are bare homepages. They load, but a judge who clicks one lands on the front page, not the requirement.
