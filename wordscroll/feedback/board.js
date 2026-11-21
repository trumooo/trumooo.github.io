/*
 * THE FEEDBACK BOARD (store/site, /feedback). It talks to four functions on the
 * app's own server (backend/supabase/migrations/…_wordscroll_feedback.sql) with
 * the public key, and to nothing else: no other script, no analytics, no
 * cookie. What it keeps in this browser is one made-up token, so a vote counts
 * once. Every word a visitor wrote is set as text, never as markup.
 *
 * Plain ES2017, one file, no build step.
 */
(function () {
  'use strict';
  let config = document.getElementById('board-config');
  let API = config.getAttribute('data-api');
  let KEY = config.getAttribute('data-key');
  let $ = function (id) { return document.getElementById(id); };
  let TELL = /(?:^|[?&])tell=1(?:&|$)/.test(window.location.search);

  // The browser's token: made here, kept here, 32 characters that name nobody.
  let memory = null;
  function device() {
    let NAME = 'wordscroll.feedback.device';
    try {
      let kept = window.localStorage.getItem(NAME);
      if (kept && /^[A-Za-z0-9_-]{16,64}$/.test(kept)) return kept;
    } catch (_e) { /* storage is off: a token for this visit */ }
    if (memory === null) {
      let bytes = new Uint8Array(24);
      window.crypto.getRandomValues(bytes);
      memory = Array.prototype.map.call(bytes, function (b) { return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b % 64]; }).join('');
      try { window.localStorage.setItem(NAME, memory); } catch (_e) { /* as above */ }
    }
    return memory;
  }

  /** One function of the server's. Resolves with its answer; rejects with 'refused' (a value it would not take) or 'offline'. */
  function rpc(name, args) {
    return fetch(API + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (res) {
      if (res.ok) return res.json();
      throw new Error(res.status >= 400 && res.status < 500 ? 'refused' : 'offline');
    }, function () { throw new Error('offline'); });
  }

  function say(el, text, tone) {
    el.textContent = text;
    el.className = 'said' + (tone ? ' ' + tone : '');
  }
  function el(tag, cls, text) {
    let n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  let LOOSE_EMAIL = /^[^@\s<>",;]{1,64}@[^@\s<>",;]{1,200}\.[^@\s<>",;.]{2,24}$/;
  let OFFLINE = 'That didn’t go through. Check your connection and try again.';

  // -------------------------------------------------------------------------
  // The board.
  // -------------------------------------------------------------------------
  let GROUPS = [
    ['open', 'Under review', 'We’ve read these and are thinking about them.'],
    ['planned', 'Planned', 'We mean to build these.'],
    ['building', 'In progress', 'Being built now.'],
    ['shipped', 'Shipped', 'In the app. Thank you for asking.']
  ];
  let ARROW = '<svg viewBox="0 0 20 12" aria-hidden="true"><path d="M2 10 L10 2 L18 10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function ideaNode(idea) {
    let row = el('article', 'idea');
    let vote = el('button', 'vote');
    vote.type = 'button';
    let count = el('span', '', String(idea.votes));
    function label() {
      vote.setAttribute('aria-pressed', idea.mine ? 'true' : 'false');
      vote.setAttribute('aria-label', (idea.mine ? 'Take back your vote for: ' : 'Vote for: ') + idea.title + '. ' + idea.votes + (idea.votes === 1 ? ' vote' : ' votes'));
      count.textContent = String(idea.votes);
    }
    vote.innerHTML = ARROW;
    vote.appendChild(count);
    label();
    vote.addEventListener('click', function () {
      if (vote.disabled) return;
      let want = !idea.mine;
      let before = { mine: idea.mine, votes: idea.votes };
      idea.mine = want;
      idea.votes = Math.max(0, idea.votes + (want ? 1 : -1));
      label();
      vote.disabled = true;
      rpc('feedback_vote', { p_idea: idea.id, p_device: device(), p_on: want }).then(function (votes) {
        if (typeof votes === 'number') idea.votes = votes;
        else { idea.mine = before.mine; idea.votes = before.votes; }
      }, function () {
        idea.mine = before.mine;
        idea.votes = before.votes;
        say($('board-said'), OFFLINE, 'bad');
      }).then(function () { vote.disabled = false; label(); });
    });
    row.appendChild(vote);
    row.appendChild(el('h4', '', idea.title));
    if (idea.body) row.appendChild(el('p', 'body', idea.body));
    if (idea.note || idea.shippedIn) {
      let note = el('p', 'note');
      note.appendChild(el('b', '', idea.status === 'shipped' && idea.shippedIn ? 'Shipped in version ' + idea.shippedIn : 'From us'));
      if (idea.note) note.appendChild(document.createTextNode(idea.note));
      row.appendChild(note);
    }
    if (idea.status !== 'shipped') row.appendChild(followNode(idea));
    return row;
  }

  function followNode(idea) {
    let more = el('div', 'more');
    let open = el('button', 'link', 'Tell me when this ships');
    open.type = 'button';
    open.setAttribute('aria-expanded', 'false');
    more.appendChild(open);
    open.addEventListener('click', function () {
      open.hidden = true;
      let form = el('form', 'follow');
      form.noValidate = true;
      let id = 'follow-' + idea.id;
      let lab = el('label', '', 'Your email');
      lab.htmlFor = id;
      let input = el('input');
      input.type = 'email'; input.id = id; input.maxLength = 254; input.autocomplete = 'email'; input.inputMode = 'email';
      let go = el('button', 'key', 'Tell me');
      go.type = 'submit';
      let said = el('p', 'said');
      said.setAttribute('role', 'status');
      said.style.flex = '1 0 100%';
      form.appendChild(lab); form.appendChild(input); form.appendChild(go); form.appendChild(said);
      more.appendChild(form);
      input.focus();
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        let email = input.value.trim();
        if (!LOOSE_EMAIL.test(email)) { say(said, 'That doesn’t look like an email address.', 'bad'); input.focus(); return; }
        go.disabled = true;
        rpc('feedback_follow', { p_idea: idea.id, p_email: email, p_device: device() }).then(function (kept) {
          if (kept === true) {
            form.textContent = '';
            form.appendChild(el('p', 'said good', 'We’ll write once, when it ships.'));
          } else { say(said, 'That’s plenty for today. Try again tomorrow.', 'bad'); go.disabled = false; }
        }, function (err) {
          say(said, err.message === 'refused' ? 'That doesn’t look like an email address.' : OFFLINE, 'bad');
          go.disabled = false;
        });
      });
    });
    return more;
  }

  function draw(ideas) {
    let lists = $('lists');
    lists.textContent = '';
    let any = false;
    GROUPS.forEach(function (g) {
      let mine = ideas.filter(function (i) { return i.status === g[0]; });
      if (mine.length === 0) return;
      any = true;
      let group = el('section', 'group');
      group.appendChild(el('h3', '', g[1]));
      group.appendChild(el('p', 'about', g[2]));
      mine.forEach(function (i) { group.appendChild(ideaNode(i)); });
      lists.appendChild(group);
    });
    if (!any) lists.appendChild(el('p', 'empty', 'Nothing is up yet. Yours could be the first.'));
  }

  function load() {
    say($('board-said'), 'Fetching the board…');
    return rpc('feedback_board', { p_device: device() }).then(function (ideas) {
      say($('board-said'), '');
      draw(Array.isArray(ideas) ? ideas : []);
    }, function () {
      $('lists').textContent = '';
      say($('board-said'), 'The board can’t be reached just now. You can still send us your idea below.', 'bad');
      let again = el('button', 'link', 'Try again');
      again.type = 'button';
      again.addEventListener('click', load);
      $('lists').appendChild(again);
    });
  }

  // -------------------------------------------------------------------------
  // The two forms.
  // -------------------------------------------------------------------------
  function wire(formId, saidId, read, thanks) {
    let form = $(formId);
    let said = $(saidId);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      let go = form.querySelector('button[type="submit"]');
      if (go.disabled) return;
      let v = read();
      if (v.problem) { say(said, v.problem, 'bad'); v.focus.focus(); return; }
      go.disabled = true;
      say(said, 'Sending…');
      rpc('feedback_submit', { p_kind: v.kind, p_mood: v.mood, p_title: v.title, p_body: v.body, p_email: v.email || null, p_device: device() }).then(function (answer) {
        if (answer === 'ok') {
          form.textContent = '';
          form.appendChild(el('p', 'said good', thanks(v)));
        } else {
          say(said, 'That’s five today, and we’ve got them all. Come back tomorrow with the next one.', 'bad');
          go.disabled = false;
        }
      }, function (err) {
        say(said, err.message === 'refused' ? 'Something in that couldn’t be sent. Check the email address, and keep it a little shorter.' : OFFLINE, 'bad');
        go.disabled = false;
      });
    });
  }

  function start() {
    $('fallback').hidden = true;
    $('suggest').hidden = false;
    if (TELL) {
      $('top').textContent = 'Tell us what went wrong';
      $('lede').textContent = 'Thank you for saying so. A few words here reach the people who make WordScroll.';
      $('tell').hidden = false;
      $('suggest').hidden = true;
      $('see-board').addEventListener('click', function () {
        $('board').hidden = false;
        $('suggest').hidden = false;
        load();
      });
    } else {
      $('board').hidden = false;
      load();
    }
    wire('tell-form', 'tell-said', function () {
      let body = $('tell-body').value.trim();
      let email = $('tell-email').value.trim();
      if (!body) return { problem: 'Write a few words first.', focus: $('tell-body') };
      if (email && !LOOSE_EMAIL.test(email)) return { problem: 'That doesn’t look like an email address.', focus: $('tell-email') };
      return { kind: 'note', mood: 'unhappy', title: null, body: body, email: email };
    }, function (v) { return v.email ? 'Thank you. We’ve got it, and we’ll write back.' : 'Thank you. We’ve got it, and we’ll read it.'; });
    wire('suggest-form', 'suggest-said', function () {
      let title = $('suggest-title').value.trim();
      let email = $('suggest-email').value.trim();
      if (!title) return { problem: 'Give your idea a line first.', focus: $('suggest-title') };
      if (email && !LOOSE_EMAIL.test(email)) return { problem: 'That doesn’t look like an email address.', focus: $('suggest-email') };
      return { kind: 'idea', mood: null, title: title, body: $('suggest-body').value.trim(), email: email };
    }, function () { return 'Thank you. It appears here once we’ve read it.'; });
  }

  start();
})();
