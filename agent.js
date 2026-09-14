/* ═══════════════════════════════════════════════════════════════════════
   agent.js — THE SEAM.

   `getAgentReasoning(profile, event)` is the single boundary between this
   frontend and the reasoning agent. Nothing else in this codebase writes
   reasoning text or decides what a step's status should become.

   It always returns a promise. Two modes, chosen by the page URL:

   ── Live (default) ───────────────────────────────────────────────────
   POST {api}/reason on the Credential Bridge backend (FastAPI locally, or
   AgentCore Runtime), a Strands agent on Amazon Bedrock grounded in the
   compliance knowledge base. `?api=` sets the base URL; the default is
   http://localhost:8000. The live adapter at the bottom of this file maps
   the intake profile and event onto the backend contract and maps the
   reply back. The reply's steps replace the pathway wholesale:
   {
     steps:     [ { id, title, authority, detail, status, sourceUrl } ]
     entries:   [ { kind, title, body: [paragraph, ...] } ]
     tie:       { fromId, toId, label } | null   first..last at-risk step
     flag:      boolean                          the agent's logEntry.flag
     regulator: { name, url } | null
   }

   ── Mock (?mock=1) ───────────────────────────────────────────────────
   The original offline demo: synchronous, deterministic, templated from
   the profile and pathway state. No model is called, no request is made,
   and its dates are illustrative. The page labels itself as a demo in
   this mode. It patches the locally built pathway instead:
   {
     entries:   [ { kind, title, body: [paragraph, ...] } ]   log entries
     stepUpdates:  [ { id, status, flag } ]       status changes to apply
     insertBefore: { beforeId, step } | null      a remediation step
     docUpdates:   [ { id, status, tone } ]       sidebar document changes
     tie:          { fromId, toId, label } | null the conflict bracket
     rebuild:      boolean                        regenerate the pathway
   }

   Steps blocked by a missing or rejected document are NOT listed here.
   That follows from the documents themselves and is derived at render
   time, so the timeline can never disagree with the sidebar.

   Event types (document.* are mock-only: the /reason contract has no event
   or field for documents, so live mode never sends them):
     pathway.build       intake finished
     document.uploaded   event.document, event.pathwayDocs
     document.removed    event.document, event.pathwayDocs
     conflict.simulate   event.documents
     rejection.simulate  event.documents, event.targetDocId
     pathway.reset

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
  /* Documents a step needs that are not usable right now. */
  function missingFor(step, documents) {
    return (step.requires || []).filter(function (id) {
      var d = documents.filter(function (x) { return x.id === id; })[0];
      return !d || d.status === 'missing' || d.status === 'rejected';
    });
  }
  /* Never surface a raw document id: fall back to the catalogue name. */
  function docName(documents, id) {
    var d = (documents || []).filter(function (x) { return x.id === id; })[0];
    if (d && d.name) return d.name;
    var def = CB.DOCUMENTS.filter(function (x) { return x.id === id; })[0];
    return def ? def.name : id;
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
        doc: { id: 'language', state: 'flagged', status: 'Expiring', tone: 'amber' },
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
        doc: { id: 'eval', state: 'flagged', status: 'In review', tone: 'amber' },
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
        doc: { id: 'eval', state: 'flagged', status: 'Time-limited', tone: 'amber' },
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
        doc: { id: 'practice', state: 'flagged', status: 'Short', tone: 'amber' },
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
        doc: { id: 'language', state: 'flagged', status: 'Expiring', tone: 'amber' },
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
        doc: { id: 'practice', state: 'flagged', status: 'Expiring', tone: 'amber' },
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
        doc: { id: 'language', state: 'flagged', status: 'Expiring', tone: 'amber' },
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
        doc: { id: 'eval', state: 'flagged', status: 'In review', tone: 'amber' },
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
  /* Why a given document came back, and what fixes it. Keyed by document
     type, because any of them can be the one that is returned. */
  var REJECTIONS = {
    transcripts: {
      reason: 'they arrived in an envelope that had been opened before delivery, so they cannot be ' +
              'treated as institution-issued',
      remedyTitle: 'Resubmit sealed transcripts',
      remedyDetail: 'Institution sends transcripts directly, unopened, quoting the existing file reference.',
      fix: 'Ask your institution to send them directly to the assessing service, sealed and unopened. ' +
           'Do not send copies from your own set, including certified copies — that is what caused the return.',
      weeks: 8
    },
    eval: {
      reason: 'the report was issued against transcripts the service has since been unable to verify at source',
      remedyTitle: 'Reissue credential evaluation',
      remedyDetail: 'Assessing service re-runs the evaluation once verified transcripts are on file.',
      fix: 'The evaluation cannot be repaired on its own — the transcripts underneath it have to be ' +
           'verified first, and the report is then reissued against them at no new assessment fee.',
      weeks: 9
    },
    language: {
      reason: 'the test centre reported an identity mismatch at the session and the board has cancelled the score',
      remedyTitle: 'Re-sit the language test',
      remedyDetail: 'New sitting booked, with identity documents matching the name on the application.',
      fix: 'Book a new sitting and bring the same identity document your application is filed under. ' +
           'Cancelled scores are not reinstated on appeal, so treat this as a retest, not a dispute.',
      weeks: 6
    },
    practice: {
      reason: 'the employer letters are unsigned and not on institutional letterhead, so the hours cannot be counted',
      remedyTitle: 'Re-obtain practice verification',
      remedyDetail: 'Signed letters on letterhead, plus a certificate of standing from your current regulator.',
      fix: 'Ask each employer for a signed letter on letterhead stating your role, dates and hours, and ' +
           'request a certificate of standing directly from your current regulator.',
      weeks: 7
    },
    identity: {
      reason: 'the passport had expired at the date of filing and the scan of the photo page was illegible',
      remedyTitle: 'Resubmit identity document',
      remedyDetail: 'Current passport, full photo page, scanned in colour at full size.',
      fix: 'Submit a currently valid passport, scanned in colour at full page size. If the name differs ' +
           'from your other documents, include the deed poll or marriage certificate that explains it.',
      weeks: 3
    }
  };

  /* ═══════════════════════════════════════════════════════════════════
     mockReasoning(profile, event) — the offline demo, used only with ?mock=1.

     profile  { name, profession, trainedIn, country, region, caseRef }
     event    { type, steps }
       type ∈ 'pathway.build' | 'conflict.simulate'
            | 'rejection.simulate' | 'pathway.reset'
     ═══════════════════════════════════════════════════════════════════ */
  function mockReasoning(profile, event) {
    var b = CB.BODIES[profile.region];
    var steps = event.steps || [];
    var key = profile.profession + '|' + profile.country;

    var documents = event.documents || [];
    var empty = {
      entries: [], stepUpdates: [], insertBefore: null,
      docUpdates: [], tie: null, rebuild: false
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
      var needed = CB.requiredDocsFor(steps);
      var firstNeeds = (steps[0].requires || []).map(function (id) {
        return docName(needed, id);
      });

      out.entries.push({
        kind: 'plan',
        title: 'Pathway mapped',
        body: [
          'You trained as a ' + profile.profession.toLowerCase().replace(' / physician', '') +
          ' in ' + CB.trainedInLabel(profile) + ' and you are seeking recognition in ' + profile.region + ', ' +
          profile.country + '. That route runs through **' + terminalAuthority + '**, and I have mapped it ' +
          'as **' + steps.length + ' steps**, ' + formatSpan(total) +
          ' start to finish, assuming no re-sits and no document returns.',

          'This pathway needs **' + needed.length + ' documents**, and nothing is on file yet. Every step is ' +
          'waiting on at least one of them, which is why the timeline is greyed out. Start with ' +
          listNames(firstNeeds) + ' — that is what step one is blocked on, and most of what follows is ' +
          'blocked on step one.',

          'The steps are not independent. Several of them carry documents that expire, and several can only ' +
          'be taken in fixed sittings. That combination is where internationally educated applicants most ' +
          'often lose a year, and it is what I check the file against as documents arrive.'
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

    /* ── A document arrived ────────────────────────────────────────── */
    if (event.type === 'document.uploaded') {
      var up = event.document;
      var freed = steps.filter(function (st) {
        return (st.requires || []).indexOf(up.id) >= 0 && !missingFor(st, documents).length;
      });
      var stillWaiting = steps.filter(function (st) { return missingFor(st, documents).length; });
      var outstanding = CB.requiredDocsFor(steps).filter(function (d) {
        var live = documents.filter(function (x) { return x.id === d.id; })[0];
        return !live || live.status === 'missing' || live.status === 'rejected';
      });

      var lines = ['I have logged `' + up.file.name + '` against **' + up.name + '**.'];

      if (freed.length) {
        lines.push('That clears ' + listNames(freed.map(function (st) { return st.title; })) +
          '. ' + (freed.length === 1 ? 'It has' : 'They have') +
          ' everything ' + (freed.length === 1 ? 'it' : 'they') + ' needs from you.');
      } else {
        lines.push('No step clears on this alone — every step that uses it still needs something else too.');
      }

      if (outstanding.length) {
        lines.push('**Still outstanding:** ' + listNames(outstanding.map(function (d) { return d.name; })) +
          '. ' + stillWaiting.length + ' of ' + steps.length + ' steps are waiting on those.');
      } else {
        lines.push('**That is the full set.** Nothing in this pathway is waiting on paperwork any more. ' +
          'From here the constraints are examination calendars and regulator queues, not your file.');
      }

      return Object.assign({}, empty, {
        entries: [{ kind: 'document', title: up.name + ' received', body: lines }]
      });
    }

    /* ── A document was withdrawn ──────────────────────────────────── */
    if (event.type === 'document.removed') {
      var gone = event.document;
      var reblocked = steps.filter(function (st) {
        return (st.requires || []).indexOf(gone.id) >= 0;
      });
      return Object.assign({}, empty, {
        entries: [{
          kind: 'document',
          title: gone.name + ' removed',
          body: [
            'Removed from the case file. ' + (reblocked.length
              ? listNames(reblocked.map(function (st) { return st.title; })) +
                ' ' + (reblocked.length === 1 ? 'is' : 'are') + ' waiting again.'
              : 'No step in this pathway depended on it.')
          ]
        }]
      });
    }

    /* ── Schedule / prerequisite conflict ──────────────────────────── */
    if (event.type === 'conflict.simulate') {
      var rule = CONFLICTS[key];
      if (!rule) return empty;
      var c = rule(profile, b);

      /* Most of these conflicts are read off a document's dates. Without
         the document there is nothing to read, and inventing an expiry
         would be worse than saying so. */
      if (c.doc) {
        var basis = documents.filter(function (d) { return d.id === c.doc.id; })[0];
        if (!basis || basis.status === 'missing' || basis.status === 'rejected') {
          return Object.assign({}, empty, {
            entries: [{
              kind: 'watch',
              title: 'Nothing to check yet',
              body: [
                'The collision I would be watching for on this pathway turns on the dates inside your **' +
                docName(documents, c.doc.id).toLowerCase() + '**, and that is not on file.',

                'Upload it and I will check it against ' + titleOf(steps, c.to) +
                ' straight away. I am not going to guess at an expiry date.'
              ]
            }]
          });
        }
      }

      var fromTitle = titleOf(steps, c.from);
      var toTitle = titleOf(steps, c.to);

      return {
        entries: [{ kind: 'conflict', title: c.title, body: c.body }],
        stepUpdates: [
          { id: c.from, status: 'at-risk', flag: 'Conflicts with “' + toTitle + '”. See the agent log.' },
          { id: c.to,   status: 'at-risk', flag: 'Depends on “' + fromTitle + '” staying valid.' }
        ],
        insertBefore: null,
        docUpdates: c.doc ? [c.doc] : [],
        tie: { fromId: c.from, toId: c.to, label: c.tie },
        rebuild: false
      };
    }

    /* ── Document rejection ────────────────────────────────────────── */
    if (event.type === 'rejection.simulate') {
      var target = documents.filter(function (d) { return d.id === event.targetDocId; })[0];
      if (!target || target.status === 'missing') return empty;

      var rj = REJECTIONS[target.id] || REJECTIONS.transcripts;
      var received = shift(-11);
      var replacement = shift(rj.weeks * 7);

      /* Which steps this actually costs, in pathway order. */
      var affected = steps.filter(function (st) {
        return (st.requires || []).indexOf(target.id) >= 0;
      });
      var assessor = affected[0] ? affected[0].authority : 'the assessing service';

      var remedy = {
        id: 'remedy',
        title: rj.remedyTitle,
        authority: assessor,
        detail: rj.remedyDetail,
        months: Math.max(1, Math.round(rj.weeks / 4)),
        status: 'in-progress',
        requires: [],
        completeOnDocs: false,
        isRemedy: true
      };

      return {
        entries: [{
          kind: 'rejection',
          title: target.name + ' returned',
          body: [
            capitalize(assessor) + ' has returned your ' + target.name.toLowerCase() + ' — `' +
            target.file.name + '`, filed `' + target.file.added + '`. On review `' + fmt(received) +
            '`, ' + rj.reason + '. **The document is void. The file is not.**',

            affected.length
              ? 'That puts **' + affected.length + ' ' + (affected.length === 1 ? 'step' : 'steps') +
                '** back to waiting — ' + listNames(affected.map(function (st) { return st.title; })) +
                '. They are waiting, not lost, and nothing you have already paid for has been forfeited.'
              : 'No step in this pathway lists it as a requirement, so nothing downstream stalls. Replace ' +
                'it at your own pace.',

            '**Recommendation.** ' + rj.fix + ' Quote file reference `' + profile.caseRef +
            '`. On the stated turnaround that puts a replacement at `' + fmt(replacement) + '`, about **' +
            rj.weeks + ' weeks** from now.',

            'I have put the resubmission in the timeline as a step of its own, so the delay is visible ' +
            'rather than hidden inside whatever it is holding up.'
          ]
        }],
        stepUpdates: [],
        insertBefore: affected.length ? { beforeId: affected[0].id, step: remedy } : null,
        docUpdates: [{ id: target.id, state: 'rejected', status: 'Returned', tone: 'rust' }],
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
            ' at intake. Your uploaded documents are untouched — any that were returned are back on file.'
          ]
        }],
        stepUpdates: [], insertBefore: null,
        docUpdates: [], tie: null, rebuild: true
      };
    }

    return empty;
  }

  /* ═══════════════════════════════════════════════════════════════════
     Live adapter — POST {api}/reason.

     Request and response follow the backend contract in README.md:
       { profile{name,profession,countryTrained,targetCountry,targetRegion},
         event, currentSteps[] }
       -> { steps[]{id,title,status,detail,source,sourceUrl},
            logEntry{text,flag}, regulator?, regulatorUrl? }
     The reply is translated into the same shape app.js already applies.
     Nothing is added to it: every step, status and sentence on screen
     comes from the agent.
     ═══════════════════════════════════════════════════════════════════ */
  var params = new URLSearchParams(window.location.search);
  CB.MOCK = params.get('mock') === '1';
  CB.API = (params.get('api') || 'http://localhost:8000').replace(/\/+$/, '');

  var TIMEOUT_MS = 240000;  // live Claude calls on delay/rejection can take ~100s

  var EVENTS = {
    'pathway.build':      'build_pathway',
    'conflict.simulate':  'simulate_delay',
    'rejection.simulate': 'simulate_rejection',
    'pathway.reset':      'reset'
  };
  /* Intake labels that differ from the backend's profession names. */
  var PROFESSIONS = { 'Doctor / Physician': 'Physician' };
  var STATUSES = ['complete', 'in-progress', 'upcoming', 'not-started', 'at-risk'];

  function toRequest(profile, event) {
    return {
      profile: {
        name: profile.name,
        profession: PROFESSIONS[profile.profession] || profile.profession,
        countryTrained: profile.trainedIn,
        targetCountry: profile.country,
        targetRegion: profile.region
      },
      event: EVENTS[event.type],
      currentSteps: (event.steps || []).map(function (s, i) {
        return {
          id: i + 1,
          title: s.title,
          status: s.status,
          detail: s.detail,
          source: s.authority || null,
          sourceUrl: s.sourceUrl || null
        };
      })
    };
  }

  function safeUrl(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
  }

  /* Plain text in; paragraphs out. Stray backticks are neutralised so they
     cannot open a mono span, and ISO dates are set in mono like the rest of
     the record data. */
  function toParagraphs(text) {
    return String(text).split(/\n\s*\n/)
      .map(function (p) { return p.trim(); })
      .filter(Boolean)
      .map(function (p) {
        return p.replace(/`/g, '\'').replace(/\b(\d{4}-\d{2}-\d{2})\b/g, '`$1`');
      });
  }

  /* The entry's kind and title restate the event and the agent's flag.
     They never add a claim of their own. */
  function entryFor(type, flag) {
    if (type === 'pathway.reset') return { kind: 'reset', title: 'Case reset' };
    if (type === 'rejection.simulate') {
      return flag ? { kind: 'rejection', title: 'Document rejection' }
                  : { kind: 'plan', title: 'Rejection assessed' };
    }
    if (type === 'conflict.simulate') {
      return flag ? { kind: 'conflict', title: 'Conflict detected' }
                  : { kind: 'plan', title: 'Delay assessed, no conflict flagged' };
    }
    return flag ? { kind: 'conflict', title: 'Pathway mapped, conflict flagged' }
                : { kind: 'plan', title: 'Pathway mapped' };
  }

  /* Bracket the first and last at-risk steps when the agent flagged it. */
  function tieFor(type, steps, flag) {
    if (!flag) return null;
    var risky = steps.filter(function (s) { return s.status === 'at-risk'; });
    if (risky.length < 2) return null;
    return {
      fromId: risky[0].id,
      toId: risky[risky.length - 1].id,
      label: type === 'conflict.simulate' ? 'conflict' : 'at risk'
    };
  }

  function fromResponse(type, data) {
    if (!data || !Array.isArray(data.steps) || !data.logEntry ||
        typeof data.logEntry.text !== 'string') {
      throw new Error('The agent replied, but not in the /reason contract shape.');
    }
    var flag = !!data.logEntry.flag;
    var steps = data.steps.map(function (s, i) {
      return {
        id: typeof s.id === 'number' ? s.id : i + 1,
        title: String(s.title || ''),
        authority: s.source ? String(s.source) : '',
        detail: String(s.detail || ''),
        status: STATUSES.indexOf(s.status) >= 0 ? s.status : 'not-started',
        sourceUrl: safeUrl(s.sourceUrl),
        blockedBy: null,
        flag: null
      };
    });
    var entry = entryFor(type, flag);
    return {
      steps: steps,
      tie: tieFor(type, steps, flag),
      flag: flag,
      regulator: data.regulator
        ? { name: String(data.regulator), url: safeUrl(data.regulatorUrl) }
        : null,
      entries: [{ kind: entry.kind, title: entry.title, body: toParagraphs(data.logEntry.text) }]
    };
  }

  function describeError(body) {
    try {
      var detail = JSON.parse(body).detail;
      if (!detail) return '.';
      return ': ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 240);
    } catch (e) {
      return '.';
    }
  }

  function liveReasoning(profile, event) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;

    return fetch(CB.API + '/reason', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toRequest(profile, event)),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.text().then(function (body) {
        if (!res.ok) throw new Error('The agent returned HTTP ' + res.status + describeError(body));
        var data;
        try { data = JSON.parse(body); } catch (e) {
          throw new Error('The agent replied with something that is not JSON.');
        }
        return fromResponse(event.type, data);
      });
    }, function (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('The agent took longer than ' + (TIMEOUT_MS / 1000) + ' seconds to answer.');
      }
      throw new Error('Could not reach the agent at ' + CB.API + '. Is the backend running?');
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  /* The one seam. Always returns a promise, in either mode. */
  CB.getAgentReasoning = function (profile, event) {
    if (CB.MOCK) {
      try { return Promise.resolve(mockReasoning(profile, event)); } catch (e) { return Promise.reject(e); }
    }
    if (!EVENTS[event.type]) {
      return Promise.reject(new Error('The /reason contract has no event for ' + event.type + '.'));
    }
    return liveReasoning(profile, event);
  };

  /* Exposed for the offline adapter test. */
  CB.adapter = { toRequest: toRequest, fromResponse: fromResponse };
})();
