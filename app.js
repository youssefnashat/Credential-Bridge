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
    'at-risk':     { label: 'At risk',     tone: 'rust'  }
  };

  var ENTRY_KINDS = {
    plan:      { label: 'Plan',       tone: 'teal'  },
    watch:     { label: 'Monitoring', tone: 'mute'  },
    conflict:  { label: 'Conflict',   tone: 'amber' },
    rejection: { label: 'Rejection',  tone: 'rust'  },
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
  function daysAgo(n) { return new Date(Date.now() - n * 86400000); }
  function clockTime() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function chip(label, tone) {
    return '<span class="chip chip--' + tone + '">' + escapeHtml(label) + '</span>';
  }

  /* ═══ Intake ═════════════════════════════════════════════════════════ */
  var form = $('intake-form');
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
    var checked = form.querySelector('input[name="country"]:checked');
    return {
      name: $('in-name').value.trim(),
      profession: $('in-profession').value,
      trainedIn: elTrained.value,
      trainedInRegion: trainedRegionShown() ? elTrainedRegion.value : '',
      country: checked ? checked.value : '',
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
    var checked = form.querySelector('input[name="country"]:checked');
    var previous = elRegion.value;
    elRegion.innerHTML = '';

    if (!checked) {
      elRegion.disabled = true;
      elRegion.appendChild(new Option('Choose a target country first', ''));
      return;
    }

    /* You cannot target the region you trained in — you are already there. */
    var alreadyThere = (elTrained.value === checked.value && trainedRegionShown())
      ? elTrainedRegion.value : '';

    elRegion.disabled = false;
    elRegion.appendChild(new Option('Choose a region', ''));
    CB.REGIONS[checked.value].forEach(function (r) {
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

  function freshDocs() {
    var ages = [126, 84, 141, 62];
    return CB.DOCUMENTS.map(function (d, i) {
      return {
        id: d.id,
        name: d.name,
        status: 'Verified',
        tone: 'teal',
        received: fmtDate(daysAgo(ages[i % ages.length]))
      };
    });
  }

  function openCase(values) {
    state.profile = Object.assign({}, values, { caseRef: makeCaseRef() });
    state.steps = CB.buildPathway(state.profile);
    state.docs = freshDocs();
    state.log = [];
    state.tie = null;
    state.drafts = CB.getDrafts(state.profile, fmtDate(new Date()));

    /* Ask the agent for its opening read on the case. */
    applyReasoning(CB.getAgentReasoning(state.profile, {
      type: 'pathway.build',
      steps: state.steps
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
      state.docs = freshDocs();
      state.tie = null;
    }

    (result.stepUpdates || []).forEach(function (u) {
      var step = state.steps.filter(function (s) { return s.id === u.id; })[0];
      if (!step) return;
      if (u.status) step.status = u.status;
      if (u.flag) step.flag = u.flag;
    });

    if (result.insertAfter) {
      var at = -1;
      state.steps.forEach(function (s, i) { if (s.id === result.insertAfter.afterId) at = i; });
      var already = state.steps.some(function (s) { return s.id === result.insertAfter.step.id; });
      if (at >= 0 && !already) {
        state.steps.splice(at + 1, 0, Object.assign(
          { blockedBy: null, flag: null }, result.insertAfter.step
        ));
      }
    }

    if (result.blockFrom) {
      var pivot = -1;
      state.steps.forEach(function (s, i) { if (s.id === result.blockFrom) pivot = i; });
      if (pivot >= 0) {
        for (var i = pivot + 1; i < state.steps.length; i++) {
          if (state.steps[i].status === 'complete') continue;
          state.steps[i].blockedBy = pivot + 1;
        }
      }
    }

    (result.docUpdates || []).forEach(function (u) {
      var doc = state.docs.filter(function (d) { return d.id === u.id; })[0];
      if (!doc) return;
      doc.status = u.status;
      doc.tone = u.tone;
    });

    if (result.tie) state.tie = result.tie;

    (result.entries || []).forEach(function (entry) {
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
      return '<li class="doc">' +
        '<span><span class="doc__name">' + escapeHtml(d.name) + '</span>' +
        '<span class="doc__date">Received ' + escapeHtml(d.received) + '</span></span>' +
        chip(d.status, d.tone) +
      '</li>';
    }).join('');
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
      var meta = STATUS[step.status] || STATUS['not-started'];
      var blocked = !!step.blockedBy;
      var classes = ['step', 'step--' + step.status];
      if (blocked) classes.push('step--blocked');
      if (step.isRemedy && step.status !== 'at-risk') classes.push('step--remedy');

      var glyph = '';
      if (step.status === 'complete') glyph = MARKER_CHECK;
      else if (step.status === 'at-risk') glyph = MARKER_BANG;
      else if (step.isRemedy) glyph = MARKER_BANG;

      return '<li class="' + classes.join(' ') + '" data-step="' + escapeHtml(step.id) + '">' +
        '<span class="step__num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="step__rail"><span class="marker">' + glyph + '</span></span>' +
        '<div class="card">' +
          '<div class="card__head">' +
            '<div>' +
              '<h3 class="card__title">' + escapeHtml(step.title) + '</h3>' +
              '<p class="card__authority">' + escapeHtml(step.authority) + '</p>' +
            '</div>' +
            (blocked && step.status !== 'at-risk'
              ? chip('Blocked', 'mute') : chip(meta.label, meta.tone)) +
          '</div>' +
          '<p class="card__detail">' + escapeHtml(step.detail) + '</p>' +
          (step.flag ? '<p class="card__flag">' + escapeHtml(step.flag) + '</p>' : '') +
          (blocked ? '<p class="card__blocked">Held until step ' +
              String(step.blockedBy).padStart(2, '0') + ' clears</p>' : '') +
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
  function toast(message) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    $('toaster').appendChild(el);
    setTimeout(function () {
      el.classList.add('toast--out');
      setTimeout(function () { el.remove(); }, 260);
    }, 3600);
  }

  /* ═══ Wiring ═════════════════════════════════════════════════════════ */
  function simulate(type, note) {
    applyReasoning(CB.getAgentReasoning(state.profile, { type: type, steps: state.steps }));
    renderSidebar();
    renderPathway();
    renderLog();
    toast(note);
  }

  $('sim-conflict').addEventListener('click', function () {
    simulate('conflict.simulate', 'Conflict detected. The agent has flagged two steps.');
  });
  $('sim-rejection').addEventListener('click', function () {
    simulate('rejection.simulate', 'Document rejected. A remediation step has been added.');
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
  populateTrainedRegion();
  populateRegions();
  renderCaseSlip();
})();
