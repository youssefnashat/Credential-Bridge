/* ═══════════════════════════════════════════════════════════════════════
   app.js — state and rendering.

   This file never writes reasoning text and never decides on its own what
   a step's status should be. It collects the profile, asks the agent
   (CB.getAgentReasoning, see agent.js), applies what comes back, and draws
   the result. All state is in memory; nothing is persisted anywhere.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CB = window.CB;
  var $ = function (id) { return document.getElementById(id); };

  /* ── In-memory state. Cleared on reload, by design. ─────────────────── */
  var state = {
    profile: null,
    steps: [],
    docs: [],
    log: [],
    tie: null,
    drafts: []
  };

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

  var STATUS = {
    'complete':    { label: 'Complete',    tone: 'teal'  },
    'in-progress': { label: 'In progress', tone: 'amber' },
    'upcoming':    { label: 'Upcoming',    tone: 'mute'  },
    'not-started': { label: 'Not started', tone: 'mute'  },
    'waiting':     { label: 'Waiting',     tone: 'mute'  },
    'at-risk':     { label: 'At risk',     tone: 'rust'  }
  };

  var DOC_TONES = {
    'missing':  { label: 'Not uploaded', tone: 'mute' },
    'on-file':  { label: 'On file',      tone: 'teal' }
  };

  var ENTRY_KINDS = {
    plan:      { label: 'Plan',       tone: 'teal'  },
    watch:     { label: 'Monitoring', tone: 'mute'  },
    conflict:  { label: 'Conflict',   tone: 'amber' },
    rejection: { label: 'Rejection',  tone: 'rust'  },
    document:  { label: 'Document',   tone: 'teal'  },
    reset:     { label: 'Reset',      tone: 'mute'  }
  };

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* Agent paragraphs support **bold** and `mono`, applied after escaping. */
  function inline(text) {
    return escapeHtml(text)
      .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+?)`/g, '<span class="num">$1</span>');
  }
  function fmtDate(date) {
    return date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
  }
  function clockTime() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function fileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
  function docFor(id) {
    return state.docs.filter(function (d) { return d.id === id; })[0];
  }
  /* A requirement counts as unmet when the file is absent or has been
     returned. This is the one rule that ties the sidebar to the timeline. */
  function missingFor(step) {
    return (step.requires || []).filter(function (id) {
      var d = docFor(id);
      return !d || d.status === 'missing' || d.status === 'rejected';
    });
  }
  /* A step's displayed status is derived, never stored: the agent owns
     'at-risk', the documents own everything else. */
  function derivedStatus(step) {
    if (step.status === 'at-risk') return 'at-risk';
    if (missingFor(step).length) return 'waiting';
    if (step.completeOnDocs) return 'complete';
    return step.status;
  }
  function listOf(items) {
    if (items.length <= 1) return items[0] || '';
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  function chip(label, tone) {
    return '<span class="chip chip--' + tone + '">' + escapeHtml(label) + '</span>';
  }

  /* ═══ Intake ═════════════════════════════════════════════════════════ */
  var form = $('intake-form');
  var elCountry = $('in-country');
  var elTrained = $('in-trained');
  var elTrainedRegion = $('in-trained-region');
  var elRegion = $('in-region');

  var FIELD_ERRORS = {
    name: 'Enter the applicant name.',
    profession: 'Choose a profession.',
    trainedIn: 'Choose the country you trained in.',
    trainedInRegion: 'Choose the region you trained in.',
    country: 'Choose a target country.',
    region: 'Choose a target region.'
  };

  function readForm() {
    return {
      name: $('in-name').value.trim(),
      profession: $('in-profession').value,
      trainedIn: elTrained.value,
      trainedInRegion: trainedRegionShown() ? elTrainedRegion.value : '',
      country: elCountry.value,
      region: elRegion.value
    };
  }

  function setFieldError(field, message) {
    var wrap = form.querySelector('[data-field="' + field + '"]');
    var err = $('err-' + field);
    if (message) {
      wrap.classList.add('field--invalid');
      err.textContent = message;
      err.hidden = false;
    } else {
      wrap.classList.remove('field--invalid');
      err.textContent = '';
      err.hidden = true;
    }
  }

  function populateTrainedIn() {
    CB.COUNTRIES.forEach(function (c) { elTrained.appendChild(new Option(c, c)); });
  }

  /* Driven by CB.REGIONS, so a new target country appears here as soon as
     it has regions, a regulator set and pathways in pathways.js. */
  function populateTargetCountries() {
    Object.keys(CB.REGIONS).forEach(function (c) {
      elCountry.appendChild(new Option(c, c));
    });
  }

  function trainedRegionShown() {
    return !form.querySelector('[data-field="trainedInRegion"]').hidden;
  }

  /* Someone who trained in Canada or the US may well be moving between
     regions rather than into the country, so ask which region they trained
     in. Only offered for countries we hold regions for. Like the training
     country itself, it is recorded and displayed but drives no logic —
     except that it rules out the one region they are already in. */
  function populateTrainedRegion() {
    var regions = CB.REGIONS[elTrained.value];
    var wrap = form.querySelector('[data-field="trainedInRegion"]');
    var previous = elTrainedRegion.value;

    elTrainedRegion.innerHTML = '';

    if (!regions) {
      wrap.hidden = true;
      setFieldError('trainedInRegion', null);
      return;
    }

    wrap.hidden = false;
    elTrainedRegion.appendChild(new Option('Choose a region', ''));
    regions.forEach(function (r) {
      var opt = new Option(r, r);
      opt.selected = (r === previous);
      elTrainedRegion.appendChild(opt);
    });
  }

  function populateRegions() {
    var country = elCountry.value;
    var previous = elRegion.value;
    elRegion.innerHTML = '';

    if (!country) {
      elRegion.disabled = true;
      elRegion.appendChild(new Option('Choose a target country first', ''));
      return;
    }

    /* You cannot target the region you trained in — you are already there. */
    var alreadyThere = (elTrained.value === country && trainedRegionShown())
      ? elTrainedRegion.value : '';

    elRegion.disabled = false;
    elRegion.appendChild(new Option('Choose a region', ''));
    CB.REGIONS[country].forEach(function (r) {
      var blocked = (r !== '' && r === alreadyThere);
      var opt = new Option(blocked ? r + ' — where you trained' : r, r);
      opt.disabled = blocked;
      opt.selected = (!blocked && r === previous);
      elRegion.appendChild(opt);
    });
  }

  function renderCaseSlip() {
    var v = readForm();
    var slot = function (value) {
      return value ? '<b>' + escapeHtml(value) + '</b>' : '—';
    };
    var target = (v.region || v.country)
      ? slot([v.region, v.country].filter(Boolean).join(', '))
      : '—';
    var trained = v.trainedInRegion ? v.trainedInRegion + ', ' + v.trainedIn : v.trainedIn;
    $('caseslip').innerHTML =
      'Case file &nbsp;·&nbsp; ' + slot(v.name) +
      ' &nbsp;·&nbsp; ' + slot(v.profession) +
      ' &nbsp;·&nbsp; trained in ' + slot(trained) +
      ' &nbsp;·&nbsp; seeking ' + target;
  }

  /* Clear a field's error as soon as the user types in it, not on blur.
     Clearing on blur removes a line of text at the moment the pointer is
     going down on the next control, and the resulting layout shift makes
     the browser drop that click entirely. */
  function onFormActivity(e) {
    if (e.type === 'change') {
      if (e.target.name === 'trainedIn') populateTrainedRegion();
      /* Any of these three can change which target regions are reachable. */
      if (['trainedIn', 'trainedInRegion', 'country'].indexOf(e.target.name) >= 0) {
        populateRegions();
      }
    }
    renderCaseSlip();
    if (e.target.name && FIELD_ERRORS[e.target.name]) setFieldError(e.target.name, null);
  }
  form.addEventListener('input', onFormActivity);
  form.addEventListener('change', onFormActivity);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = readForm();
    var firstBad = null;
    var required = ['name', 'profession', 'trainedIn', 'country', 'region'];
    if (trainedRegionShown()) required.splice(3, 0, 'trainedInRegion');

    required.forEach(function (field) {
      if (!v[field]) {
        setFieldError(field, FIELD_ERRORS[field]);
        if (!firstBad) firstBad = field;
      } else {
        setFieldError(field, null);
      }
    });

    if (firstBad) {
      var wrap = form.querySelector('[data-field="' + firstBad + '"]');
      var focusable = wrap.querySelector('input, select');
      if (focusable) focusable.focus();
      return;
    }

    openCase(v);
  });

  /* ═══ Case lifecycle ═════════════════════════════════════════════════ */
  function makeCaseRef() {
    var n = String(Math.floor(1000 + Math.random() * 9000));
    return 'CB-' + new Date().getFullYear() + '-' + n;
  }

  /* Only the documents this pathway actually uses, all empty to begin
     with. Nothing is pre-filled, because nothing has been uploaded. */
  function freshDocs(steps) {
    return CB.requiredDocsFor(steps).map(function (d) {
      return { id: d.id, name: d.name, hint: d.hint, file: null, status: 'missing',
               label: DOC_TONES.missing.label, tone: DOC_TONES.missing.tone };
    });
  }

  /* Clear agent-applied flags but keep the files the user uploaded. */
  function relabelDocs() {
    state.docs.forEach(function (d) {
      d.status = d.file ? 'on-file' : 'missing';
      var meta = DOC_TONES[d.status];
      d.label = meta.label;
      d.tone = meta.tone;
    });
  }

  function openCase(values) {
    state.profile = Object.assign({}, values, { caseRef: makeCaseRef() });
    state.steps = CB.buildPathway(state.profile);
    state.docs = freshDocs(state.steps);
    state.log = [];
    state.tie = null;
    state.drafts = CB.getDrafts(state.profile, fmtDate(new Date()));

    /* Ask the agent for its opening read on the case. */
    applyReasoning(CB.getAgentReasoning(state.profile, {
      type: 'pathway.build',
      steps: state.steps,
      documents: state.docs
    }));

    $('intake').hidden = true;
    $('dashboard').hidden = false;
    renderAll();
    window.scrollTo(0, 0);
  }

  function startOver() {
    state = { profile: null, steps: [], docs: [], log: [], tie: null, drafts: [] };
    form.reset();
    populateTrainedRegion();
    populateRegions();
    Object.keys(FIELD_ERRORS).forEach(function (f) { setFieldError(f, null); });
    renderCaseSlip();
    $('dashboard').hidden = true;
    $('intake').hidden = false;
    window.scrollTo(0, 0);
    $('in-name').focus();
  }

  /* ── Apply an agent response to state ───────────────────────────────── */
  function applyReasoning(result) {
    if (!result) return;

    if (result.rebuild) {
      state.steps = CB.buildPathway(state.profile);
      relabelDocs();
      state.tie = null;
    }

    (result.stepUpdates || []).forEach(function (u) {
      var step = state.steps.filter(function (s) { return s.id === u.id; })[0];
      if (!step) return;
      if (u.status) step.status = u.status;
      if (u.flag) step.flag = u.flag;
    });

    /* The remediation step goes in front of the first step it unblocks. */
    if (result.insertBefore) {
      var at = -1;
      state.steps.forEach(function (s, i) { if (s.id === result.insertBefore.beforeId) at = i; });
      var already = state.steps.some(function (s) { return s.id === result.insertBefore.step.id; });
      if (at >= 0 && !already) {
        state.steps.splice(at, 0, Object.assign({ flag: null }, result.insertBefore.step));
      }
    }

    (result.docUpdates || []).forEach(function (u) {
      var doc = docFor(u.id);
      if (!doc) return;
      if (u.state) doc.status = u.state;
      doc.label = u.status;
      doc.tone = u.tone;
    });

    if (result.tie) state.tie = result.tie;

    /* The log reads newest first, but entries within one response are
       authored in reading order, so reverse before unshifting to keep the
       agent's own ordering intact at the top of the panel. */
    (result.entries || []).slice().reverse().forEach(function (entry) {
      state.log.unshift(Object.assign({ time: clockTime(), isNew: true }, entry));
    });
  }

  /* ═══ Rendering ══════════════════════════════════════════════════════ */
  function renderAll() {
    renderHeader();
    renderSidebar();
    renderPathway();
    renderLog();
    renderDrafts();
  }

  function renderHeader() {
    $('case-ref').textContent = 'Case ' + state.profile.caseRef + ' · opened ' + fmtDate(new Date());
  }

  function renderSidebar() {
    var p = state.profile;
    $('side-name').textContent = p.name;
    $('side-profession').textContent = p.profession;
    $('side-trained').textContent = CB.trainedInLabel(p);
    $('side-target').textContent = p.region + ', ' + p.country;

    $('docs').innerHTML = state.docs.map(function (d) {
      var body;
      if (d.file) {
        body = '<p class="doc__file">' +
            '<span class="doc__filename">' + escapeHtml(d.file.name) + '</span>' +
            '<span class="doc__filemeta">' + escapeHtml(d.file.size) + ' \u00b7 added ' + escapeHtml(d.file.added) + '</span>' +
          '</p>' +
          '<button class="doc__remove" type="button" data-remove="' + escapeHtml(d.id) + '">Remove</button>';
      } else {
        body = '<p class="doc__hint">' + escapeHtml(d.hint) + '</p>' +
          '<label class="doc__upload">Choose file' +
            '<input type="file" data-upload="' + escapeHtml(d.id) + '">' +
          '</label>';
      }
      return '<li class="doc doc--' + escapeHtml(d.status) + '">' +
        '<div class="doc__row">' +
          '<span class="doc__name">' + escapeHtml(d.name) + '</span>' +
          chip(d.label, d.tone) +
        '</div>' + body +
      '</li>';
    }).join('');

    var onFile = state.docs.filter(function (d) { return d.file; });
    var usable = state.docs.filter(function (d) { return d.status === 'on-file'; });
    $('docs-tally').textContent =
      usable.length + ' of ' + state.docs.length + ' ready' +
      (onFile.length > usable.length ? ' \u00b7 ' + (onFile.length - usable.length) + ' needs attention' : '');

    /* You can only return a document that has actually been submitted. */
    var pick = $('sim-reject-doc');
    var previous = pick.value;
    pick.innerHTML = '';
    if (!onFile.length) {
      pick.appendChild(new Option('Upload a document first', ''));
      pick.disabled = true;
      $('sim-rejection').disabled = true;
    } else {
      onFile.forEach(function (d) {
        var opt = new Option(d.name, d.id);
        opt.selected = (d.id === previous);
        pick.appendChild(opt);
      });
      pick.disabled = false;
      $('sim-rejection').disabled = false;
    }
  }

  var MARKER_CHECK = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.2l2.4 2.4L8.6 2.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var MARKER_BANG  = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 2.2v3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="5" cy="7.8" r="1" fill="currentColor"/></svg>';

  function renderPathway() {
    var p = state.profile;
    var regulated = CB.isRegulated(p);

    $('pathway-title').textContent = regulated
      ? 'Licensing pathway — ' + p.region
      : 'Work authorisation pathway — ' + p.region;

    $('pathway-sub').textContent = regulated
      ? 'Generated for a ' + p.profession + ' trained outside ' + p.country +
        '. Statuses update as the agent reasons over the case.'
      : p.profession + ' is not a regulated profession in ' + p.region +
        '. This pathway covers work authorisation only.';

    var tl = $('timeline');
    tl.innerHTML = state.steps.map(function (step, i) {
      var status = derivedStatus(step);
      var meta = STATUS[status] || STATUS['not-started'];
      var missing = missingFor(step);
      var classes = ['step', 'step--' + status];
      if (step.isRemedy && status !== 'at-risk') classes.push('step--remedy');

      var glyph = '';
      if (status === 'complete') glyph = MARKER_CHECK;
      else if (status === 'at-risk' || step.isRemedy) glyph = MARKER_BANG;

      /* Every step names the documents it runs on, so the sidebar and the
         timeline read as one thing rather than two unrelated panels. */
      var needs = (step.requires || []).map(function (id) {
        var d = docFor(id);
        if (!d) return '';
        return '<span class="need need--' + escapeHtml(d.status) + '">' + escapeHtml(d.name) + '</span>';
      }).join('');

      return '<li class="' + classes.join(' ') + '" data-step="' + escapeHtml(step.id) + '">' +
        '<span class="step__num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="step__rail"><span class="marker">' + glyph + '</span></span>' +
        '<div class="card">' +
          '<div class="card__head">' +
            '<div>' +
              '<h3 class="card__title">' + escapeHtml(step.title) + '</h3>' +
              '<p class="card__authority">' + escapeHtml(step.authority) + '</p>' +
            '</div>' +
            chip(meta.label, meta.tone) +
          '</div>' +
          '<p class="card__detail">' + escapeHtml(step.detail) + '</p>' +
          (needs ? '<p class="card__needs"><span class="card__needslabel">Runs on</span>' + needs + '</p>' : '') +
          (missing.length
            ? '<p class="card__waiting">Waiting on ' + escapeHtml(listOf(missing.map(function (id) {
                var d = docFor(id); return d ? d.name.toLowerCase() : id;
              }))) + '</p>'
            : '') +
          (step.flag ? '<p class="card__flag">' + escapeHtml(step.flag) + '</p>' : '') +
        '</div>' +
      '</li>';
    }).join('');

    drawTie();
  }

  /* The signature element: a bracket in the rail gutter that physically
     ties the two conflicting steps together. Measured after layout. */
  var drawing = false;
  function drawTie() {
    if (drawing) return;
    drawing = true;
    try { paintTie(); } finally { drawing = false; }
  }

  function paintTie() {
    var tl = $('timeline');
    var old = tl.querySelector('.tie');
    if (old) old.remove();
    if (!state.tie) return;

    var a = tl.querySelector('[data-step="' + state.tie.fromId + '"] .marker');
    var b = tl.querySelector('[data-step="' + state.tie.toId + '"] .marker');
    if (!a || !b) return;

    var base = tl.getBoundingClientRect();
    var top = a.getBoundingClientRect().top - base.top + 7;
    var bottom = b.getBoundingClientRect().top - base.top + 7;
    if (bottom - top < 8) return;

    var el = document.createElement('div');
    el.className = 'tie';
    el.style.top = top + 'px';
    el.style.height = (bottom - top) + 'px';
    el.innerHTML = '<span class="tie__label">' + escapeHtml(state.tie.label) + '</span>';
    tl.appendChild(el);
  }

  function renderLog() {
    $('log').innerHTML = state.log.map(function (entry) {
      var kind = ENTRY_KINDS[entry.kind] || ENTRY_KINDS.plan;
      var html = '<li class="entry' + (entry.isNew ? ' entry--enter' : '') + '">' +
        '<div class="entry__head">' +
          chip(kind.label, kind.tone) +
          '<span class="entry__time">' + escapeHtml(entry.time) + '</span>' +
        '</div>' +
        '<h3 class="entry__title">' + escapeHtml(entry.title) + '</h3>' +
        '<div class="entry__body">' +
          entry.body.map(function (para) { return '<p>' + inline(para) + '</p>'; }).join('') +
        '</div>' +
      '</li>';
      entry.isNew = false;
      return html;
    }).join('');
    $('log').scrollTop = 0;
  }

  function renderDrafts() {
    $('drafts').innerHTML = state.drafts.map(function (d) {
      return '<article class="draft">' +
        '<header class="draft__head">' +
          '<h3 class="draft__title">' + escapeHtml(d.title) + '</h3>' +
          '<p class="draft__meta">' + escapeHtml(d.meta) + '</p>' +
        '</header>' +
        '<div class="draft__body">' +
          '<label class="field__label" for="draft-' + escapeHtml(d.id) + '">Document text</label>' +
          '<textarea class="draft__textarea" id="draft-' + escapeHtml(d.id) + '" spellcheck="false"></textarea>' +
        '</div>' +
        '<div class="draft__foot">' +
          '<p class="draft__note">Nothing leaves this browser.</p>' +
          '<button class="btn btn--primary" type="button" data-submit-draft="' + escapeHtml(d.title) + '">Looks good, submit</button>' +
        '</div>' +
      '</article>';
    }).join('');

    /* Set textarea content as text, never as markup. */
    state.drafts.forEach(function (d) {
      $('draft-' + d.id).value = d.body;
    });
  }

  /* ═══ Toasts ═════════════════════════════════════════════════════════ */
  var TOAST_LIMIT = 3;

  function dismiss(el) {
    if (!el.parentNode || el.classList.contains('toast--out')) return;
    el.classList.add('toast--out');
    setTimeout(function () { el.remove(); }, 260);
  }

  function toast(message) {
    var stack = $('toaster');
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    stack.appendChild(el);

    /* Uploading several documents in a row must not bury the page behind
       a column of toasts. Oldest out first. */
    var live = stack.querySelectorAll('.toast:not(.toast--out)');
    for (var i = 0; i < live.length - TOAST_LIMIT; i++) dismiss(live[i]);

    setTimeout(function () { dismiss(el); }, 3600);
  }

  /* ═══ Documents ══════════════════════════════════════════════════════
     Uploading is a fact, not a judgement, so the file is recorded here.
     What it means for the pathway still comes from the agent.
     The File never leaves the tab: only its name and size are read.
     ═══════════════════════════════════════════════════════════════════ */
  function attachFile(docId, file) {
    var doc = docFor(docId);
    if (!doc || !file) return;

    doc.file = { name: file.name, size: fileSize(file.size), added: clockTime() };
    doc.status = 'on-file';
    doc.label = DOC_TONES['on-file'].label;
    doc.tone = DOC_TONES['on-file'].tone;

    applyReasoning(CB.getAgentReasoning(state.profile, {
      type: 'document.uploaded',
      steps: state.steps,
      documents: state.docs,
      document: doc
    }));

    renderSidebar();
    renderPathway();
    renderLog();
    toast(doc.name + ' added to the case file.');
  }

  function detachFile(docId) {
    var doc = docFor(docId);
    if (!doc || !doc.file) return;
    var removed = { id: doc.id, name: doc.name };

    doc.file = null;
    doc.status = 'missing';
    doc.label = DOC_TONES.missing.label;
    doc.tone = DOC_TONES.missing.tone;

    applyReasoning(CB.getAgentReasoning(state.profile, {
      type: 'document.removed',
      steps: state.steps,
      documents: state.docs,
      document: removed
    }));

    renderSidebar();
    renderPathway();
    renderLog();
    toast(removed.name + ' removed.');
  }

  $('docs').addEventListener('change', function (e) {
    var input = e.target.closest('[data-upload]');
    if (!input || !input.files || !input.files.length) return;
    attachFile(input.getAttribute('data-upload'), input.files[0]);
  });

  $('docs').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-remove]');
    if (!btn) return;
    detachFile(btn.getAttribute('data-remove'));
  });

  /* ═══ Wiring ═════════════════════════════════════════════════════════ */
  function simulate(type, note, extra) {
    var event = Object.assign({
      type: type, steps: state.steps, documents: state.docs
    }, extra || {});
    applyReasoning(CB.getAgentReasoning(state.profile, event));
    renderSidebar();
    renderPathway();
    renderLog();
    if (note) toast(note);
  }

  $('sim-conflict').addEventListener('click', function () {
    var before = state.log.length;
    simulate('conflict.simulate', null);
    if (state.log.length === before) { toast('No conflict rule for this pathway.'); return; }
    /* The agent declines when the document it would read is not on file. */
    toast(state.log[0].kind === 'conflict'
      ? 'Conflict detected. The agent has flagged two steps.'
      : 'The agent needs that document on file before it can check.');
  });

  $('sim-rejection').addEventListener('click', function () {
    var docId = $('sim-reject-doc').value;
    if (!docId) return;
    simulate('rejection.simulate', null, { targetDocId: docId });
    var doc = docFor(docId);
    toast((doc ? doc.name : 'Document') + ' returned. A remediation step has been added.');
  });
  $('sim-reset').addEventListener('click', function () {
    simulate('pathway.reset', 'Case reset to the original pathway.');
  });
  $('start-over').addEventListener('click', startOver);

  $('drafts').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-submit-draft]');
    if (!btn) return;
    toast('Submitted for review — ' + btn.getAttribute('data-submit-draft'));
  });

  /* ── Tabs ───────────────────────────────────────────────────────────── */
  var tabs = [$('tab-pathway'), $('tab-drafts')];
  var panels = { 'tab-pathway': $('panel-pathway'), 'tab-drafts': $('panel-drafts') };

  function selectTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      panels[t.id].hidden = !on;
    });
    if (tab.id === 'tab-pathway') requestAnimationFrame(drawTie);
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab); });
    tab.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });

  /* Keep the conflict bracket aligned when the layout reflows. */
  var reflow;
  window.addEventListener('resize', function () {
    clearTimeout(reflow);
    reflow = setTimeout(drawTie, 120);
  });
  if (window.ResizeObserver) {
    new ResizeObserver(function () { drawTie(); }).observe($('timeline'));
  }

  /* ── First paint ────────────────────────────────────────────────────── */
  populateTrainedIn();
  populateTargetCountries();
  populateTrainedRegion();
  populateRegions();
  renderCaseSlip();
})();
