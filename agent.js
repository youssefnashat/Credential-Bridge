/* ═══════════════════════════════════════════════════════════════════════
   agent.js — THE SEAM.

   `getAgentReasoning(profile, event)` is the single boundary between this
   frontend and the reasoning agent. Nothing else in this codebase writes
   reasoning text or decides what a step's status should become.

   ── In production ────────────────────────────────────────────────────
   This function is an async call to the Credential Bridge agent, which is
   a separate deployment built on the Strands Agents SDK and hosted on AWS
   (Bedrock AgentCore Runtime). It is not part of this repository. The real
   implementation is roughly:

       async function getAgentReasoning(profile, event) {
         const res = await fetch(`${AGENT_ENDPOINT}/reason`, {
           method: 'POST',
           headers: { 'content-type': 'application/json', ...auth },
           body: JSON.stringify({ profile, event })
         });
         return res.json();   // same shape as below
       }

   The agent there holds the regulatory knowledge base, reasons over the
   applicant's live document set and the real regulator calendars, and
   returns the same response shape this file returns.

   ── In this demo ─────────────────────────────────────────────────────
   The function is synchronous and deterministic. It composes templated
   reasoning from the current profile and pathway state. No model is
   called and no network request is made. Swapping in the real agent means
   replacing the body of this one function and awaiting it at the two call
   sites in app.js — nothing else changes.

   ── Response shape ───────────────────────────────────────────────────
   {
     entries:   [ { kind, title, body: [paragraph, ...] } ]   log entries
     stepUpdates: [ { id, status, flag } ]        status changes to apply
     insertAfter: { afterId, step } | null        a remediation step
     blockFrom:   stepId | null                   block everything after it
     docUpdates:  [ { id, status, tone } ]        sidebar document changes
     tie:         { fromId, toId, label } | null  the conflict bracket
     rebuild:     boolean                         regenerate the pathway
   }

   Paragraph text supports two markers, applied after HTML escaping:
     **bold**   emphasis        `mono`   dates, counts, references
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CB = window.CB;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

  var DAY = 86400000;

  function shift(days) {
    return new Date(Date.now() + days * DAY);
  }
  function fmt(date) {
    return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }
  function monthYear(date) {
    return MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }
  /* Days between two dates, as a positive whole number. */
  function gap(a, b) {
    return Math.abs(Math.round((b - a) / DAY));
  }
  function formatSpan(months) {
    var hi = Math.round(months * 1.3);
    if (months < 24) return 'about ' + months + ' to ' + hi + ' months';
    var lo = (months / 12).toFixed(1).replace(/\.0$/, '');
    var hiY = (hi / 12).toFixed(1).replace(/\.0$/, '');
    return 'about ' + lo + ' to ' + hiY + ' years';
  }
  function titleOf(steps, id) {
    for (var i = 0; i < steps.length; i++) if (steps[i].id === id) return steps[i].title;
    return id;
  }
  function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function listNames(names) {
    if (!names.length) return 'nothing';
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /* ── Conflict rules ───────────────────────────────────────────────────
     One per profession + country. Each names two real steps in that
     pathway that stand in a prerequisite or expiry relationship, and
     builds a dated explanation of how they collide.
     ─────────────────────────────────────────────────────────────────── */
  var CONFLICTS = {

    'Registered Nurse|Canada': function (p, b) {
      var issued = shift(-670), expiry = shift(60);
      var bridgeEnd = shift(240), decision = shift(330);
      return {
        from: 'language', to: 'registration', tie: 'language result expires',
        doc: { id: 'language', status: 'Expiring', tone: 'amber' },
        title: 'Language result expires before registration',
        body: [
          'Your IELTS Academic result was issued `' + fmt(issued) + '` and lapses `' + fmt(expiry) +
          '`, two years from the test date. That is **' + gap(new Date(), expiry) + ' days** from today.',

          'On the current schedule your bridging program finishes `' + fmt(bridgeEnd) + '` and ' + b.nursing +
          ' would not reach a registration decision until `' + fmt(decision) + '` — **' + gap(expiry, decision) +
          ' days after the result has lapsed**. The college will not adjudicate a file on an expired language ' +
          'test, so the pathway stalls at the final step with everything else in order.',

          '**Recommendation.** Book a retest for a date between `' + fmt(shift(90)) + '` and `' + fmt(shift(150)) +
          '`, while the bridging program is running. A result issued in that window stays valid through the ' +
          'registration decision. Sitting it now costs you a test fee. Sitting it late costs you the year.'
        ]
      };
    },

    'Registered Nurse|United States': function (p, b) {
      var att = shift(-18), attExp = shift(72), decision = shift(118);
      return {
        from: 'nclex', to: 'licensure', tie: 'test window closes',
        doc: { id: 'eval', status: 'In review', tone: 'amber' },
        title: 'Test window closes before the board decides',
        body: [
          'Your authorisation to test was issued `' + fmt(att) + '` and expires `' + fmt(attExp) +
          '`, ninety days later.',

          'The ' + b.nursing + ' still has your CGFNS evaluation in review. At the queue length it is currently ' +
          'running, that decision lands around `' + fmt(decision) + '` — **' + gap(attExp, decision) +
          ' days after the authorisation lapses**. There is a common misreading here worth naming: the ' +
          'authorisation is not waiting on the licence decision. It is running down on its own clock.',

          '**Recommendation.** Book NCLEX-RN for `' + fmt(shift(38)) + '` or sooner. A pass sits on your record ' +
          'and waits for the board. A lapsed authorisation means a new application, a new fee, and roughly ' +
          '**six weeks** added to the pathway for nothing.'
        ]
      };
    },

    'Doctor / Physician|Canada': function (p, b) {
      var exam = shift(95), result = shift(158), carms = shift(126);
      return {
        from: 'nac', to: 'carms', tie: 'result lands after file review',
        doc: null,
        title: 'NAC result lands after CaRMS file review',
        body: [
          'The NAC Examination sitting you are currently eligible for runs `' + fmt(exam) +
          '`, with results released `' + fmt(result) + '`.',

          'CaRMS R-1 file review closes `' + fmt(carms) + '` — **' + gap(carms, result) +
          ' days before your result would exist**. Programs in ' + b.short + ' that weight the NAC result at ' +
          'file review would assess your application without one, and there is no mechanism to add it after ' +
          'the deadline.',

          '**Recommendation.** Two routes, in order of preference. First, check for remaining seats in the ' +
          monthYear(shift(20)) + ' sitting — results from that administration release `' + fmt(shift(83)) +
          '`, clear of the deadline. If no seat is available, target the following match cycle and use the ' +
          'intervening months for ' + b.medical + ' pre-registration requirements, which are not tied to ' +
          'the match calendar.'
        ]
      };
    },

    'Doctor / Physician|United States': function (p, b) {
      var exam = shift(70), score = shift(112), eras = shift(88), invites = shift(104);
      return {
        from: 'step2', to: 'match', tie: 'score arrives mid-season',
        doc: null,
        title: 'Step 2 CK score arrives mid-season',
        body: [
          'Your Step 2 CK date of `' + fmt(exam) + '` falls in a reporting window that releases scores on `' +
          fmt(score) + '`, roughly six weeks later.',

          'ERAS applications reach programs `' + fmt(eras) + '` and most interview invitations are out by `' +
          fmt(invites) + '`. Your score would arrive **' + gap(eras, score) +
          ' days into the season**, after the reviews that decide invitations. For an international graduate ' +
          'without a U.S. clinical record, that score is usually the strongest thing in the file, and it would ' +
          'be missing from it.',

          '**Recommendation.** Move the exam to `' + fmt(shift(28)) + '`. The reporting calendar puts that ' +
          'score in front of programs on `' + fmt(shift(70)) + '`, **' + gap(shift(70), invites) +
          ' days before invitations start going out**. Your ECFMG certification is already on track and does ' +
          'not constrain the earlier date.'
        ]
      };
    },

    'Civil Engineer|Canada': function (p, b) {
      var opened = shift(-268), expiry = shift(97);
      var exam = shift(142), result = shift(190);
      return {
        from: 'application', to: 'exams', tie: 'file lapses before exam',
        doc: { id: 'eval', status: 'Time-limited', tone: 'amber' },
        title: 'Licensure file lapses before the exam sitting',
        body: [
          'Your file with ' + b.engineering + ' was opened `' + fmt(opened) +
          '` and stays active for twelve months, to `' + fmt(expiry) + '`.',

          'The confirmatory technical examinations run twice a year. The next sitting you can register for is `' +
          fmt(exam) + '`, with results `' + fmt(result) + '` — **' + gap(expiry, exam) +
          ' days after your file expires**. A lapsed file is not paused, it is closed: the academic assessment ' +
          'is redone, references are re-collected, and the fee is paid again.',

          '**Recommendation.** File an extension request before `' + fmt(shift(83)) +
          '`, two weeks clear of the expiry. Extensions requested against a live file are administrative. ' +
          'Reinstatements after expiry are a fresh assessment and typically add **four to six months**. If ' +
          'seats remain in the ' + monthYear(shift(40)) + ' sitting, take that instead and the question does ' +
          'not arise.'
        ]
      };
    },

    'Civil Engineer|United States': function (p, b) {
      var start = shift(-1332), anniversary = shift(128), regClose = shift(46), admin = shift(139);
      return {
        from: 'experience', to: 'pe', tie: 'experience short at cut-off',
        doc: { id: 'practice', status: 'Short', tone: 'amber' },
        title: 'Experience falls short at the registration cut-off',
        body: [
          'The ' + b.engineering + ' credits your supervised experience from `' + fmt(start) +
          '`, which reaches the required forty-eight months on `' + fmt(anniversary) + '`.',

          'Registration for the ' + monthYear(admin) + ' PE Civil administration closes `' + fmt(regClose) +
          '` — **' + gap(regClose, anniversary) +
          ' days before you meet the requirement**. Boards return applications filed short rather than holding ' +
          'them, so this would cost you the sitting and the application fee, and push licensure to the ' +
          'following cycle.',

          '**Recommendation.** Have your supervising engineer file verification for the qualifying experience ' +
          'you completed before arriving. Where the board credits prior overseas experience under a licensed ' +
          'engineer, the anniversary moves to roughly `' + fmt(shift(-14)) + '` and the ' + monthYear(admin) +
          ' window opens up. Submit that verification before `' + fmt(shift(25)) + '` so it is on file ahead ' +
          'of the cut-off.'
        ]
      };
    },

    'Teacher|Canada': function (p, b) {
      var issued = shift(-655), expiry = shift(75);
      var start = shift(120), end = shift(268), assess = shift(300);
      return {
        from: 'language', to: 'practicum', tie: 'language result expires',
        doc: { id: 'language', status: 'Expiring', tone: 'amber' },
        title: 'Language result expires during the practicum',
        body: [
          'Your language test was sat `' + fmt(issued) + '` and lapses `' + fmt(expiry) +
          '`, two years on. That is **' + gap(new Date(), expiry) + ' days** from today.',

          b.teaching + ' assigns practicum placements on the school-year intake. The next placement you can ' +
          'be assigned to starts `' + fmt(start) + '` and runs to `' + fmt(end) +
          '`, with the supervising report assessed `' + fmt(assess) + '` — **' + gap(expiry, assess) +
          ' days after the language result has lapsed**. The certificate cannot be issued against an expired ' +
          'result, so a completed practicum would sit unusable.',

          '**Recommendation.** Retest before `' + fmt(shift(60)) +
          '`. Do it now rather than during the placement: practicum terms leave very little room to sit a test, ' +
          'and a result issued before the placement starts carries the whole file through certification.'
        ]
      };
    },

    'Teacher|United States': function (p, b) {
      var printed = shift(-380), clearanceExp = shift(65);
      var examResult = shift(52), decision = shift(122);
      return {
        from: 'background', to: 'licensure', tie: 'clearance expires in queue',
        doc: { id: 'practice', status: 'Expiring', tone: 'amber' },
        title: 'Clearance expires while the credential is in queue',
        body: [
          'Your fingerprint clearance was processed `' + fmt(printed) + '` and the ' + b.teaching +
          ' treats it as current for eighteen months, to `' + fmt(clearanceExp) + '`.',

          'Your remaining ' + (b.teacherExam || 'certification') + ' result posts `' + fmt(examResult) +
          '`, and credential adjudication is currently running about ten weeks behind, putting the decision at `' +
          fmt(decision) + '` — **' + gap(clearanceExp, decision) +
          ' days past the clearance expiry**. The file would be returned for re-fingerprinting at the last ' +
          'stage, after the wait rather than before it.',

          '**Recommendation.** Sit the remaining subtest at the `' + fmt(shift(19)) +
          '` administration. That posts results `' + fmt(shift(38)) +
          '` and puts the file into adjudication with **' + gap(shift(38), clearanceExp) +
          ' days of clearance left**, which the queue can absorb. If the earlier seat is gone, re-fingerprint ' +
          'now rather than waiting to be asked.'
        ]
      };
    },

    'Software Engineer|Canada': function (p, b) {
      var expiry = shift(88), eca = shift(880), ita = shift(160);
      return {
        from: 'language', to: 'workauth', tie: 'profile goes stale',
        doc: { id: 'language', status: 'Expiring', tone: 'amber' },
        title: 'Express Entry profile goes stale',
        body: [
          'Worth stating plainly: there is no regulator anywhere in this pathway, so nothing here is a ' +
          'licensing conflict. The timing problem is entirely in the immigration file.',

          'Your language test lapses `' + fmt(expiry) + '` and your Educational Credential Assessment runs ' +
          'to `' + fmt(eca) + '`. An Express Entry profile is invalidated the day the language result expires, ' +
          'not the day the assessment does. At the current draw cadence for your score band, an invitation ' +
          'would land around `' + fmt(ita) + '` — **' + gap(expiry, ita) +
          ' days after the profile has dropped out of the pool**.',

          '**Recommendation.** Retest by `' + fmt(shift(70)) +
          '`. It is the cheaper of the two documents to refresh and the one that expires first, and a fresh ' +
          'result usually moves the score as well. Leave the assessment alone; it has **' +
          Math.round(gap(new Date(), eca) / 30) + ' months** left on it.'
        ]
      };
    },

    'Software Engineer|United States': function (p, b) {
      var open = shift(58), close = shift(72), wd = shift(-40), ready = shift(96);
      return {
        from: 'employer', to: 'workauth', tie: 'filing window closes',
        doc: { id: 'eval', status: 'In review', tone: 'amber' },
        title: 'Filing window closes before the package is ready',
        body: [
          'Worth stating plainly: no state board licenses software engineers, so there is no licensing conflict ' +
          'to resolve. This is a filing-window problem.',

          'The H-1B registration window opens `' + fmt(open) + '` and closes `' + fmt(close) +
          '`, fourteen days wide and not extended. Your employer’s prevailing wage determination is dated `' +
          fmt(wd) + '`, but the specialty-occupation evidence is not scheduled to be complete until `' +
          fmt(ready) + '` — **' + gap(close, ready) +
          ' days after registration closes**. Missing a fourteen-day window costs a full year.',

          '**Recommendation.** Registration needs far less than the full petition: the employer registers, and ' +
          'the package is only filed if you are selected. Confirm with them by `' + fmt(shift(45)) +
          '` that they will register regardless of package readiness. In parallel, check TN or O-1 eligibility ' +
          '— neither has an annual cap window, and both would remove this constraint entirely.'
        ]
      };
    }
  };

  /* ── Rejection rules ──────────────────────────────────────────────────
     Every pathway in this product opens with a credential evaluation, so
     that is the step the rejection lands on.
     ─────────────────────────────────────────────────────────────────── */
  function rejectionRule(profile, b, steps) {
    var first = steps[0] || {};
    var agency = first.authority || 'the assessing service';
    var received = shift(-11);
    var replacement = shift(58);
    return {
      targetId: first.id || 'eval',
      stepName: (first.title || 'credential evaluation').toLowerCase(),
      agency: agency,
      received: received,
      replacement: replacement,
      remedy: {
        id: 'remedy',
        title: 'Resubmit sealed transcripts',
        authority: agency,
        detail: 'Institution sends transcripts directly, unopened, quoting the existing file reference.',
        months: 2,
        status: 'in-progress',
        isRemedy: true
      }
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     getAgentReasoning(profile, event)

     profile  { name, profession, trainedIn, country, region, caseRef }
     event    { type, steps }
       type ∈ 'pathway.build' | 'conflict.simulate'
            | 'rejection.simulate' | 'pathway.reset'
     ═══════════════════════════════════════════════════════════════════ */
  function getAgentReasoning(profile, event) {
    var b = CB.BODIES[profile.region];
    var steps = event.steps || [];
    var key = profile.profession + '|' + profile.country;

    var empty = {
      entries: [], stepUpdates: [], insertAfter: null,
      blockFrom: null, docUpdates: [], tie: null, rebuild: false
    };

    /* ── Opening plan ──────────────────────────────────────────────── */
    if (event.type === 'pathway.build') {
      var total = steps.reduce(function (sum, s) { return sum + s.months; }, 0);
      var regulated = CB.isRegulated(profile);
      var terminal = steps[steps.length - 1];
      var out = Object.assign({}, empty, { entries: [] });

      if (!regulated) {
        out.entries.push({
          kind: 'plan',
          title: 'No licensing pathway required',
          body: [
            'Software engineering is **not a regulated profession in ' + profile.region +
            '**. There is no college, no board, and no examination standing between you and practice. ' +
            'I am not going to build a licensing pathway, because none exists to build.',

            'What actually gates the work is authorisation to hold the job. I have mapped that instead: **' +
            steps.length + ' steps**, ' + formatSpan(total) + ', ending at ' + terminal.title.toLowerCase() +
            '. Everything here is an immigration requirement, not a professional one.',

            '**Recommendation.** Put your effort into work-authorisation documentation and into employer ' +
            'evidence. Time spent chasing a credential recognition you do not need is time not spent on the ' +
            'filing that you do.'
          ]
        });
        out.entries.push({
          kind: 'watch',
          title: 'What I am watching',
          body: [
            'Document expiry dates on the immigration file, and the filing windows that do not move. ' +
            'Those are the only two things that can cost you a year in this pathway.'
          ]
        });
        return out;
      }

      var terminalAuthority = terminal.authority;
      var liveStep = steps[2] ? '`' + steps[2].title + '`' : 'the next step';
      out.entries.push({
        kind: 'plan',
        title: 'Pathway mapped',
        body: [
          'You trained as a ' + profile.profession.toLowerCase().replace(' / physician', '') +
          ' in ' + CB.trainedInLabel(profile) + ' and you are seeking recognition in ' + profile.region + ', ' +
          profile.country + '. That route runs through **' + terminalAuthority + '**, and I have mapped it ' +
          'as **' + steps.length + ' steps**.',

          'Start to finish, ' + formatSpan(total) + ', assuming no re-sits and no document returns. ' +
          'Step one is complete and step two is underway, so the live question is ' + liveStep + '.',

          'The steps are not independent. Several of them carry documents that expire, and several can only be ' +
          'taken in fixed sittings. That combination is where internationally educated applicants most often ' +
          'lose a year, and it is what I check the file against.'
        ]
      });
      out.entries.push({
        kind: 'watch',
        title: 'What I am watching',
        body: [
          'Expiry dates on your evaluation and language results, examination sitting calendars, and any step ' +
          'that cannot start until an earlier one closes. I will flag a collision here as soon as the dates ' +
          'make one unavoidable, not once it has happened.'
        ]
      });
      return out;
    }

    /* ── Schedule / prerequisite conflict ──────────────────────────── */
    if (event.type === 'conflict.simulate') {
      var rule = CONFLICTS[key];
      if (!rule) return empty;
      var c = rule(profile, b);

      var fromTitle = titleOf(steps, c.from);
      var toTitle = titleOf(steps, c.to);

      return {
        entries: [{ kind: 'conflict', title: c.title, body: c.body }],
        stepUpdates: [
          { id: c.from, status: 'at-risk', flag: 'Conflicts with “' + toTitle + '”. See the agent log.' },
          { id: c.to,   status: 'at-risk', flag: 'Depends on “' + fromTitle + '” staying valid.' }
        ],
        insertAfter: null,
        blockFrom: null,
        docUpdates: c.doc ? [c.doc] : [],
        tie: { fromId: c.from, toId: c.to, label: c.tie },
        rebuild: false
      };
    }

    /* ── Document rejection ────────────────────────────────────────── */
    if (event.type === 'rejection.simulate') {
      var r = rejectionRule(profile, b, steps);

      var held = steps.filter(function (s) {
        return s.status !== 'complete' && s.id !== r.targetId;
      }).map(function (s) { return s.title; });

      return {
        entries: [{
          kind: 'rejection',
          title: capitalize(r.stepName) + ' returned',
          body: [
            capitalize(r.agency) + ' has returned your ' + r.stepName + '. The transcripts supporting it arrived `' +
            fmt(r.received) + '` in an envelope that had been opened before delivery, so they cannot be ' +
            'treated as institution-issued. **The report is void. The file is not.**',

            'Every step after this one depends on a verified credential record, so I have held **' + held.length +
            ' downstream ' + (held.length === 1 ? 'step' : 'steps') + '** — ' + listNames(held) +
            '. They are waiting, not lost. Nothing you have already paid for has been forfeited.',

            '**Recommendation.** Ask your institution to send transcripts directly to ' + r.agency +
            ', sealed and unopened, quoting file reference `' + profile.caseRef +
            '`. On their stated turnaround that puts a replacement report at `' + fmt(r.replacement) +
            '`. Do not send copies from your own set, including certified copies — that is exactly what ' +
            'caused the return.',

            'I have inserted the resubmission as a step of its own so the delay is visible in the timeline ' +
            'rather than hidden inside step one.'
          ]
        }],
        stepUpdates: [
          { id: r.targetId, status: 'at-risk',
            flag: 'Returned ' + fmt(r.received) + ' — transcripts were not institution-sealed.' }
        ],
        insertAfter: { afterId: r.targetId, step: r.remedy },
        blockFrom: 'remedy',
        docUpdates: [
          { id: 'eval', status: 'Rejected', tone: 'rust' },
          { id: 'transcripts', status: 'Resend', tone: 'amber' }
        ],
        tie: null,
        rebuild: false
      };
    }

    /* ── Reset ─────────────────────────────────────────────────────── */
    if (event.type === 'pathway.reset') {
      return {
        entries: [{
          kind: 'reset',
          title: 'Case reset',
          body: [
            'Simulated events cleared. The pathway is back to the plan I generated for ' + profile.name +
            ' at intake, and all documents are showing as verified again.'
          ]
        }],
        stepUpdates: [], insertAfter: null, blockFrom: null,
        docUpdates: [], tie: null, rebuild: true
      };
    }

    return empty;
  }

  CB.getAgentReasoning = getAgentReasoning;
})();
