/* Daily5 — five cards a day for long-distance friends.
   Cards are picked deterministically from the date, so both friends
   always see the same set. Games travel through Messages as links
   that carry the game state in the URL hash. */

(function () {
  "use strict";

  const BASE_URL = location.origin + location.pathname;
  const IMSG_MODE = new URLSearchParams(location.search).get("imsg") === "1";
  const IN_IMESSAGE =
    IMSG_MODE &&
    window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.daily5;

  // Inside the Messages drawer vertical space is tight — trim the chrome.
  if (IMSG_MODE) document.body.classList.add("imsg");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------- seeded randomness ----------

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function todayKey() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  // Each pool cycles through a fixed seeded shuffle, one item per day —
  // guaranteed different from yesterday, and nothing repeats until the whole
  // pool has been used. Day number is computed from the dateKey via UTC so
  // every timezone agrees on which item a given date gets.
  const permCache = {};

  function poolIndex(poolName, poolLen, dateKey) {
    let perm = permCache[poolName];
    if (!perm || perm.length !== poolLen) {
      const rand = mulberry32(hashString("rot:" + poolName));
      perm = [...Array(poolLen).keys()];
      for (let i = poolLen - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      permCache[poolName] = perm;
    }
    const [y, m, d] = dateKey.split("-").map(Number);
    const dayNum = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    return perm[((dayNum % poolLen) + poolLen) % poolLen];
  }

  function dailyPicks(dateKey) {
    return {
      trivia: poolIndex("trivia", CONTENT.trivia.length, dateKey),
      qotd: poolIndex("qotd", CONTENT.qotd.length, dateKey),
      challenge: poolIndex("challenge", CONTENT.challenge.length, dateKey),
      thisOrThat: poolIndex("thisOrThat", CONTENT.thisOrThat.length, dateKey),
      wildcard: poolIndex("wildcard", CONTENT.wildcard.length, dateKey),
    };
  }

  // 5 distinct trivia questions for the day's battle (never the daily card's one)
  function battleSet(dateKey) {
    const rand = mulberry32(hashString("battle:" + dateKey));
    const skip = dailyPicks(dateKey).trivia;
    const picked = [];
    let guard = 0;
    while (picked.length < 5 && guard++ < 1000) {
      const i = Math.floor(rand() * CONTENT.trivia.length);
      if (i !== skip && !picked.includes(i)) picked.push(i);
    }
    return picked.map((i) => CONTENT.trivia[i]);
  }

  // ---------- URL-safe base64 (emoji-proof) ----------

  function enc(str) {
    return btoa(encodeURIComponent(str)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function dec(str) {
    try {
      return decodeURIComponent(atob(str.replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
      return null;
    }
  }

  function clearHash() {
    if (location.hash) history.replaceState(null, "", BASE_URL + location.search);
  }

  // localStorage can throw (private mode, disabled) — never let that break the app.
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* best effort */ } },
  };

  function sentSet(dateKey) {
    try { return new Set(JSON.parse(store.get("daily5-sent-" + dateKey) || "[]")); }
    catch { return new Set(); }
  }

  function markSent(type, idx, dateKey) {
    const set = sentSet(dateKey);
    set.add(type + "." + idx);
    store.set("daily5-sent-" + dateKey, JSON.stringify([...set]));
  }

  function isSent(type, idx, dateKey) {
    return sentSet(dateKey).has(type + "." + idx);
  }

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function dateKeyToDate(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // Is this dateKey within N days of the local today? Used to decide whether
  // a link from a friend should pin the deck to their day (timezones put
  // friends at most one calendar day apart; anything further is a stale link).
  function withinDays(dateKey, days) {
    if (!DATE_RE.test(dateKey)) return false;
    const t = dateKeyToDate(dateKey).getTime();
    if (isNaN(t)) return false;
    return Math.abs(t - dateKeyToDate(todayKey()).getTime()) <= days * 86400000;
  }

  function formatDateKey(dateKey) {
    return dateKeyToDate(dateKey).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  // A tiny haptic tick on devices that support it (no-op elsewhere).
  function tick() {
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch { /* ignore */ } }
  }

  // ---------- sending ----------

  const toastEl = document.getElementById("toast");
  let toastTimer;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers / non-secure contexts
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("copy failed"));
    });
  }

  let sendInFlight = false;

  // Resolves to "sent" | "copied" | "aborted" | "failed" | "busy".
  async function send(text, url, image) {
    if (sendInFlight) return "busy";
    sendInFlight = true;
    try {
      const full = url ? `${text}\n\n${url}` : text;

      // Inside the iMessage extension the native side inserts an MSMessage;
      // `image` (a PNG data URL of the live game state) becomes the bubble art.
      if (IN_IMESSAGE) {
        const payload = { text, url: url || BASE_URL };
        if (image) payload.image = image;
        window.webkit.messageHandlers.daily5.postMessage(payload);
        return "sent";
      }
      if (navigator.share) {
        try {
          await navigator.share({ text: full });
          toast("Off it goes 📨");
          return "sent";
        } catch (e) {
          if (e.name === "AbortError") return "aborted"; // user closed the sheet
        }
      }
      try {
        await copyText(full);
        toast("Copied! Paste it into Messages 💬");
        return "copied";
      } catch {
        toast("Couldn't copy — select and copy manually");
        return "failed";
      }
    } finally {
      sendInFlight = false;
    }
  }

  // Send + flash "Sent ✓" on the button, then restore (or swap) its label.
  async function sendFromButton(btn, text, url, restoreLabel, image) {
    const outcome = await send(text, url, image);
    if (outcome === "sent" || outcome === "copied") {
      const orig = restoreLabel || btn.textContent;
      btn.textContent = "Sent ✓";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = orig;
        btn.disabled = false;
      }, 1600);
    }
    return outcome;
  }

  // ---------- bubble images (iMessage extension) ----------
  // Rendered previews of the live state, so the Messages bubble shows the
  // actual board / drawing / score before anyone taps it (GamePigeon-style).
  // Only generated inside the extension; browsers use the share sheet.

  function bubbleBase() {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 400;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 600, 400);
    g.addColorStop(0, "#fff6f1");
    g.addColorStop(1, "#ffe1d6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 600, 400);
    ctx.font = "30px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("🪸", 16, 388);
    return [c, ctx];
  }

  // JPEG keeps the gradient backgrounds ~5-10x smaller than PNG would be.
  function bubbleExport(c) {
    return c.toDataURL("image/jpeg", 0.85);
  }

  function bubbleRoundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
    }
  }

  function bubbleWrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text).split(" ");
    let line = "";
    let lines = 0;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        lines++;
        if (lines === maxLines) {
          ctx.fillText(line + "…", x, y);
          return;
        }
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }

  function bubbleForCard(type, idx) {
    const meta = CARD_META[type];
    const [c, ctx] = bubbleBase();
    ctx.textAlign = "center";
    ctx.font = "60px sans-serif";
    ctx.fillText(meta.emoji, 300, 92);
    ctx.fillStyle = "#c73e2b";
    ctx.font = '700 26px "Baloo 2", "Nunito", sans-serif';
    ctx.fillText(meta.label.toUpperCase(), 300, 136);
    ctx.fillStyle = "#43241b";
    ctx.font = '700 32px "Nunito", sans-serif';
    let text;
    if (type === "trivia") text = CONTENT.trivia[idx].q;
    else if (type === "thisOrThat") text = CONTENT.thisOrThat[idx].join("  vs  ");
    else text = CONTENT[type][idx];
    bubbleWrapText(ctx, text, 300, 194, 520, 42, 5);
    return bubbleExport(c);
  }

  function bubbleForTtt(board) {
    const [c, ctx] = bubbleBase();
    const cell = 104, gap = 12;
    const bs = cell * 3 + gap * 2;
    const ox = (600 - bs) / 2, oy = (400 - bs) / 2;
    for (let i = 0; i < 9; i++) {
      const x = ox + (i % 3) * (cell + gap);
      const y = oy + Math.floor(i / 3) * (cell + gap);
      ctx.fillStyle = "#ffffff";
      bubbleRoundRect(ctx, x, y, cell, cell, 18);
      ctx.fill();
      ctx.strokeStyle = "#ffd9cc";
      ctx.lineWidth = 3;
      ctx.stroke();
      if (board[i] !== "-") {
        ctx.font = "62px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(board[i] === "x" ? "❌" : "⭕", x + cell / 2, y + cell / 2 + 4);
      }
    }
    return bubbleExport(c);
  }

  function bubbleForEmoji(puzzle) {
    const [c, ctx] = bubbleBase();
    ctx.textAlign = "center";
    ctx.fillStyle = "#43241b";
    let px = 96;
    ctx.font = `${px}px sans-serif`;
    while (px > 34 && ctx.measureText(puzzle).width > 540) {
      px -= 6;
      ctx.font = `${px}px sans-serif`;
    }
    ctx.fillText(puzzle, 300, 210);
    ctx.fillStyle = "#c73e2b";
    ctx.font = '700 28px "Baloo 2", "Nunito", sans-serif';
    ctx.fillText("EMOJI RIDDLE — GUESS IT!", 300, 330);
    return bubbleExport(c);
  }

  function bubbleForBattle(score) {
    const [c, ctx] = bubbleBase();
    ctx.textAlign = "center";
    ctx.font = "64px sans-serif";
    ctx.fillText("⚔️", 300, 104);
    ctx.fillStyle = "#e8553f";
    ctx.font = '800 104px "Baloo 2", "Nunito", sans-serif';
    ctx.fillText(`${score}/5`, 300, 244);
    ctx.fillStyle = "#7a4a3d";
    ctx.font = '700 30px "Nunito", sans-serif';
    ctx.fillText("Trivia Battle — your turn!", 300, 320);
    return bubbleExport(c);
  }

  function bubbleForInvite(g) {
    const [c, ctx] = bubbleBase();
    ctx.textAlign = "center";
    ctx.font = "88px sans-serif";
    ctx.fillText(g.emoji, 300, 128);
    ctx.fillStyle = "#e8553f";
    ctx.font = '800 52px "Baloo 2", "Nunito", sans-serif';
    ctx.fillText(g.name, 300, 220);
    ctx.fillStyle = "#7a4a3d";
    ctx.font = '700 30px "Nunito", sans-serif';
    ctx.fillText(`Let's play! 👥 ${g.players} players`, 300, 290);
    return bubbleExport(c);
  }

  function bubbleForPict(strokes) {
    const [c, ctx] = bubbleBase();
    const size = 360;
    const ox = (600 - size) / 2, oy = (400 - size) / 2;
    ctx.fillStyle = "#fffdfb";
    bubbleRoundRect(ctx, ox, oy, size, size, 24);
    ctx.fill();
    ctx.strokeStyle = "#ffd9cc";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "#e8553f";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const k = size / 256;
    for (const s of strokes) {
      ctx.beginPath();
      ctx.moveTo(ox + s[0][0] * k, oy + s[0][1] * k);
      for (let i = 1; i < s.length; i++) ctx.lineTo(ox + s[i][0] * k, oy + s[i][1] * k);
      if (s.length === 1) ctx.lineTo(ox + s[0][0] * k + 0.001, oy + s[0][1] * k);
      ctx.stroke();
    }
    return bubbleExport(c);
  }

  // ---------- views ----------

  const views = ["today", "games", "card", "ttt", "emoji", "pict", "battle"];

  const VIEW_TITLES = {
    today: "Daily5 🪸 — today's five",
    games: "Daily5 🪸 — games",
    card: "Daily5 🪸 — a card for you",
    ttt: "Daily5 🪸 — Tic-Tac-Toe",
    emoji: "Daily5 🪸 — Emoji Riddle",
    pict: "Daily5 🪸 — Pictionary",
    battle: "Daily5 🪸 — Trivia Battle",
  };

  function show(name) {
    views.forEach((v) => document.getElementById("view-" + v).classList.toggle("hidden", v !== name));
    document.getElementById("tabs").classList.toggle("hidden", name === "card");
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.title = VIEW_TITLES[name] || "Daily5 🪸";
    const viewEl = document.getElementById("view-" + name);
    viewEl.setAttribute("tabindex", "-1");
    viewEl.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      clearHash();
      show(t.dataset.tab);
    })
  );

  document.querySelectorAll("[data-back]").forEach((b) =>
    b.addEventListener("click", () => {
      clearHash();
      show("today");
    })
  );

  // ---------- card rendering ----------

  const CARD_META = {
    trivia: { badge: "badge-trivia", label: "Trivia", emoji: "🧠" },
    qotd: { badge: "badge-qotd", label: "Question of the day", emoji: "💬" },
    challenge: { badge: "badge-challenge", label: "Challenge", emoji: "📸" },
    thisOrThat: { badge: "badge-thisOrThat", label: "This or that", emoji: "🤔" },
    wildcard: { badge: "badge-wildcard", label: "Wildcard", emoji: "🎲" },
  };

  // A response travels back through the link as a 4th segment:
  // #c=type.idx.date.resp — a/b for this-or-that, g/m for trivia,
  // y for challenge-accepted, base64 text for answers.
  function validResp(type, resp) {
    if (!resp) return null;
    if (type === "thisOrThat") return resp === "a" || resp === "b" ? resp : null;
    if (type === "trivia") return resp === "g" || resp === "m" ? resp : null;
    if (type === "challenge") return resp === "y" ? resp : null;
    const text = dec(resp);
    return text && text.trim() && text.length <= 300 ? text.trim() : null;
  }

  // mode "deck": today's list, plain send. mode "receive": opened from a
  // friend's link — the card is answerable in-app, and friendResp (if the
  // link carried one) renders their response.
  function buildCard(type, idx, forDate, mode = "deck", friendResp = null) {
    const meta = CARD_META[type];
    const card = document.createElement("div");
    card.className = "card";

    const cardDate = forDate || todayKey();
    const wasSent = mode === "deck" && isSent(type, idx, cardDate);
    const top = document.createElement("div");
    top.className = "card-top";
    top.innerHTML =
      `<span class="card-top-left">
         <span class="badge ${meta.badge}">${meta.label}</span>
         <span class="sent-chip${wasSent ? "" : " hidden"}">Sent ✓</span>
       </span>
       <span class="card-emoji" aria-hidden="true">${meta.emoji}</span>`;
    card.appendChild(top);

    const respUrl = (r) => `${BASE_URL}#c=${type}.${idx}.${cardDate}.${r}`;
    const cardImage = () => (IN_IMESSAGE ? bubbleForCard(type, idx) : null);

    function addPrimary(label) {
      const actions = document.createElement("div");
      actions.className = "card-actions";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary";
      btn.textContent = label;
      actions.appendChild(btn);
      card.appendChild(actions);
      return btn;
    }

    // ---- card body + interactions per type ----

    if (type === "trivia") {
      const item = CONTENT.trivia[idx];
      if (mode === "receive" && friendResp) {
        card.insertAdjacentHTML(
          "beforeend",
          `<div class="resp-banner">${friendResp === "g" ? "⭐ They got this one! Can you?" : "⭐ They missed this one! Redemption time?"}</div>`
        );
      }
      card.insertAdjacentHTML(
        "beforeend",
        `<p class="card-text">${esc(item.q)}</p>
         <div class="reveal-wrap">
           <button type="button" class="btn btn-reveal">Tap to reveal 👀</button>
           <p class="answer hidden" aria-live="polite">${esc(item.a)}</p>
         </div>` +
          (mode === "receive"
            ? `<div class="score-row hidden">
                 <button type="button" class="btn btn-yes">I got it ✅</button>
                 <button type="button" class="btn btn-no">Missed it ❌</button>
               </div>`
            : "")
      );
      const revealBtn = card.querySelector(".btn-reveal");
      revealBtn.addEventListener("click", () => {
        tick();
        revealBtn.classList.add("hidden");
        card.querySelector(".answer").classList.remove("hidden");
        const row = card.querySelector(".score-row");
        if (row) row.classList.remove("hidden");
      });

      if (mode === "receive") {
        const sendBtn = addPrimary("Send my result 📨");
        sendBtn.classList.add("hidden");
        let mine = null;
        const yes = card.querySelector(".btn-yes");
        const no = card.querySelector(".btn-no");
        function pick(result, btn) {
          mine = result;
          tick();
          yes.classList.toggle("picked", btn === yes);
          no.classList.toggle("picked", btn === no);
          sendBtn.classList.remove("hidden");
        }
        yes.addEventListener("click", () => pick("g", yes));
        no.addEventListener("click", () => pick("m", no));
        sendBtn.addEventListener("click", () => {
          if (!mine) return;
          let text;
          if (friendResp === "g") text = mine === "g" ? "🧠 Got it too — big brain club ✨" : "🧠 Missed it... you win this round 😭";
          else if (friendResp === "m") text = mine === "g" ? "🧠 Got it! You'll get the next one 😏" : "🧠 Missed it too — doomed together 🤝";
          else text = mine === "g" ? "🧠 I got it! ✅ Did you?" : "🧠 That one stumped me 😅 Did you get it?";
          sendFromButton(sendBtn, `${text}\n\nTap to see 👇`, respUrl(mine), null, cardImage());
        });
      }
    } else if (type === "thisOrThat") {
      const pair = CONTENT.thisOrThat[idx];
      const theirs = friendResp === "a" ? 0 : friendResp === "b" ? 1 : -1;
      if (mode === "receive") {
        card.insertAdjacentHTML(
          "beforeend",
          `<div class="tot-row">
             <button type="button" class="tot-option${theirs === 0 ? " theirs" : ""}" data-pick="a">${esc(pair[0])}</button>
             <span class="tot-vs" aria-label="versus">VS</span>
             <button type="button" class="tot-option${theirs === 1 ? " theirs" : ""}" data-pick="b">${esc(pair[1])}</button>
           </div>` +
            (theirs >= 0 ? `<p class="tot-legend">⭐ their pick — tap yours!</p>` : `<p class="tot-legend">Tap your pick 👇</p>`) +
            `<p class="resp-verdict hidden" aria-live="polite"></p>`
        );
        const sendBtn = addPrimary("Send my pick 📨");
        sendBtn.classList.add("hidden");
        let mine = null;
        card.querySelectorAll(".tot-option").forEach((opt) => {
          opt.addEventListener("click", () => {
            tick();
            mine = opt.dataset.pick;
            card.querySelectorAll(".tot-option").forEach((o) => o.classList.toggle("mine", o === opt));
            const verdict = card.querySelector(".resp-verdict");
            if (theirs >= 0) {
              const match = (mine === "a" ? 0 : 1) === theirs;
              verdict.textContent = match ? "Twins! 🎉 Same pick." : "Team clash 😤 You two need to talk.";
              verdict.classList.remove("hidden");
            }
            sendBtn.classList.remove("hidden");
          });
        });
        sendBtn.addEventListener("click", () => {
          if (!mine) return;
          const choice = mine === "a" ? pair[0] : pair[1];
          let text;
          if (theirs < 0) text = `🤔 I'm team ${choice}! What about you? 👇`;
          else if ((mine === "a" ? 0 : 1) === theirs) text = `🤔 Team ${choice} too — twins! 🎉`;
          else text = `🤔 I'm team ${choice}... we are NOT the same 😤👇`;
          sendFromButton(sendBtn, text, respUrl(mine), null, cardImage());
        });
      } else {
        card.insertAdjacentHTML(
          "beforeend",
          `<div class="tot-row">
             <div class="tot-option">${esc(pair[0])}</div>
             <span class="tot-vs" aria-label="versus">VS</span>
             <div class="tot-option">${esc(pair[1])}</div>
           </div>`
        );
      }
    } else if (type === "challenge") {
      const text = CONTENT.challenge[idx];
      if (mode === "receive" && friendResp === "y") {
        card.insertAdjacentHTML("beforeend", `<div class="resp-banner">✅ They accepted the challenge — photo incoming!</div>`);
      }
      card.insertAdjacentHTML("beforeend", `<p class="card-text">${esc(text)}</p>`);
      if (mode === "receive" && friendResp !== "y") {
        card.insertAdjacentHTML("beforeend", `<p class="tot-legend">Accept, then drop your photo right in the chat 📎</p>`);
        const sendBtn = addPrimary("Accept the challenge ✅");
        sendBtn.addEventListener("click", () => {
          sendFromButton(sendBtn, "📸 Challenge accepted! Incoming...", respUrl("y"), null, cardImage());
        });
      }
    } else {
      // qotd + wildcard: free-text answers
      const text = CONTENT[type][idx];
      card.insertAdjacentHTML("beforeend", `<p class="card-text">${esc(text)}</p>`);
      if (mode === "receive") {
        if (friendResp) {
          const quote = document.createElement("div");
          quote.className = "resp-quote";
          const label = document.createElement("span");
          label.textContent = "Their answer";
          const body = document.createElement("p");
          body.textContent = friendResp;
          quote.appendChild(label);
          quote.appendChild(body);
          card.appendChild(quote);
        }
        const ta = document.createElement("textarea");
        ta.className = "answer-box";
        ta.maxLength = 240;
        ta.rows = 3;
        ta.placeholder = friendResp ? "Your answer back..." : "Type your answer...";
        ta.setAttribute("aria-label", "Your answer");
        card.appendChild(ta);
        const sendBtn = addPrimary("Send my answer 📨");
        sendBtn.addEventListener("click", () => {
          const ans = ta.value.trim();
          if (!ans) {
            toast("Write your answer first! ✍️");
            return;
          }
          sendFromButton(sendBtn, `${meta.emoji} My answer: ${ans}\n\nYour turn 👇`, respUrl(enc(ans)), null, cardImage());
        });
      }
    }

    // ---- deck mode: the plain "send this card" action ----

    if (mode === "deck") {
      let shareText;
      if (type === "trivia") shareText = `🧠 Trivia time! ${CONTENT.trivia[idx].q}\n\nTap to reveal the answer 👇`;
      else if (type === "thisOrThat") shareText = `🤔 This or that: ${CONTENT.thisOrThat[idx][0]} or ${CONTENT.thisOrThat[idx][1]}?? Choose wisely...`;
      else shareText = `${meta.emoji} ${meta.label}: ${CONTENT[type][idx]}`;
      const shareUrl = `${BASE_URL}#c=${type}.${idx}.${cardDate}`;
      const sendBtn = addPrimary(wasSent ? "Send again 📨" : "Send this one 📨");
      sendBtn.addEventListener("click", async () => {
        const outcome = await sendFromButton(sendBtn, shareText, shareUrl, "Send again 📨", cardImage());
        if (outcome === "sent" || outcome === "copied") {
          markSent(type, idx, cardDate);
          card.querySelector(".sent-chip").classList.remove("hidden");
        }
      });
    }

    return card;
  }

  let deckKey = null;      // the date whose five cards are on screen
  let deckPinned = false;  // true when a friend's link pinned us to their day

  function renderDeck(overrideKey) {
    const key = overrideKey && withinDays(overrideKey, 2) ? overrideKey : todayKey();
    deckKey = key;
    deckPinned = key !== todayKey();
    const picks = dailyPicks(key);
    const deck = document.getElementById("deck");
    deck.innerHTML = "";
    deck.appendChild(buildCard("trivia", picks.trivia, key));
    deck.appendChild(buildCard("qotd", picks.qotd, key));
    deck.appendChild(buildCard("challenge", picks.challenge, key));
    deck.appendChild(buildCard("thisOrThat", picks.thisOrThat, key));
    deck.appendChild(buildCard("wildcard", picks.wildcard, key));

    document.getElementById("date-chip").textContent = formatDateKey(key);

    // Cross-timezone pairs: when a friend's link pinned us to their calendar
    // day, say so and offer the way back.
    document.getElementById("deck-notice").classList.toggle("hidden", !deckPinned);
    if (deckPinned) {
      document.getElementById("deck-notice-date").textContent = formatDateKey(key);
    }
  }

  document.getElementById("deck-today-btn").addEventListener("click", () => {
    clearHash();
    renderDeck();
  });

  // A tab left open overnight gets fresh cards when it wakes up
  // (unless a friend's link pinned the deck to their day).
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !deckPinned && deckKey !== todayKey()) renderDeck();
  });

  // ---------- games list ----------

  // "Let's play!" without composing first — the GamePigeon move. The link
  // drops the recipient straight into the game (their turn / their canvas).
  function sendInvite(g, btn) {
    let url = `${BASE_URL}#g=${g.id}`;
    if (g.id === "battle") url += "." + (deckKey || todayKey()); // same question set for both
    sendFromButton(btn, g.invite, url, null, IN_IMESSAGE ? bubbleForInvite(g) : null);
  }

  function renderGames() {
    const list = document.getElementById("game-list");
    list.innerHTML = "";
    GAMES.forEach((g) => {
      const el = document.createElement("div");
      el.className = "game-card";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-label", `Play ${g.name}`);
      el.innerHTML = `
        <div class="game-emoji" aria-hidden="true">${g.emoji}</div>
        <div class="game-info">
          <h3>${esc(g.name)}</h3>
          <p>${esc(g.desc)}</p>
        </div>
        <div class="game-side">
          <span class="players-badge">👥 ${g.players} players</span>
          <button type="button" class="btn-invite">Invite 📨</button>
        </div>`;
      el.addEventListener("click", () => openGame(g.id));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openGame(g.id);
        }
      });
      const inviteBtn = el.querySelector(".btn-invite");
      inviteBtn.setAttribute("aria-label", `Invite a friend to ${g.name}`);
      inviteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        sendInvite(g, inviteBtn);
      });
      list.appendChild(el);
    });
  }

  function openGame(id) {
    if (id === "ttt") { tttInit("---------"); show("ttt"); }
    else if (id === "emoji") { emojiShowCompose(); show("emoji"); }
    else if (id === "pict") { show("pict"); pictShowCompose(); }
    else if (id === "battle") { battleInit(todayKey(), null); show("battle"); }
  }

  // ---------- tic-tac-toe ----------

  const WINS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  let tttBoard, tttMoved, tttMyMove;

  function tttWinner(b) {
    for (const line of WINS) {
      const [x, y, z] = line;
      if (b[x] !== "-" && b[x] === b[y] && b[y] === b[z]) return { mark: b[x], line };
    }
    return null;
  }

  function tttTurn(b) {
    let xs = 0, os = 0;
    for (const c of b) {
      if (c === "x") xs++;
      else if (c === "o") os++;
    }
    return xs <= os ? "x" : "o";
  }

  // A board is only accepted from a link if it could occur in a real game:
  // sane mark counts, no double winner, and the winner's count matching
  // whose move completed the game.
  function tttPlausible(state) {
    let xs = 0, os = 0;
    for (const c of state) {
      if (c === "x") xs++;
      else if (c === "o") os++;
    }
    if (os > xs || xs > os + 1) return false;
    let xWin = false, oWin = false;
    for (const [a, b, c] of WINS) {
      if (state[a] !== "-" && state[a] === state[b] && state[b] === state[c]) {
        if (state[a] === "x") xWin = true;
        else oWin = true;
      }
    }
    if (xWin && oWin) return false;
    if (xWin && xs !== os + 1) return false;
    if (oWin && xs !== os) return false;
    return true;
  }

  function tttInit(state) {
    tttBoard = state.split("");
    tttMoved = false;
    tttMyMove = -1;
    tttRender();
  }

  function tttRender() {
    const boardEl = document.getElementById("ttt-board");
    const statusEl = document.getElementById("ttt-status");
    const sendBtn = document.getElementById("ttt-send");
    const win = tttWinner(tttBoard);
    const full = !tttBoard.includes("-");
    const turn = tttTurn(tttBoard);
    const glyph = { x: "❌", o: "⭕", "-": "" };
    const spoken = { x: "X", o: "O", "-": "empty" };

    // The mark a tap would place: the current turn, or (when repositioning
    // an unsent move) the mark already placed.
    const myMark = tttMoved ? tttBoard[tttMyMove] : turn;

    boardEl.innerHTML = "";
    tttBoard.forEach((cell, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ttt-cell";
      btn.textContent = glyph[cell];
      btn.setAttribute(
        "aria-label",
        `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${spoken[cell]}`
      );
      if (win && win.line.includes(i)) btn.classList.add("win");
      btn.disabled = cell !== "-" || !!win;
      if (!btn.disabled) btn.dataset.preview = glyph[myMark];
      btn.addEventListener("click", () => {
        if (tttMoved) tttBoard[tttMyMove] = "-"; // reposition the unsent move
        tttBoard[i] = myMark;
        tttMyMove = i;
        tttMoved = true;
        tick();
        tttRender();
      });
      boardEl.appendChild(btn);
    });

    if (win) {
      statusEl.textContent = `${glyph[win.mark]} wins! ${tttMoved ? "Send it so they can witness the defeat." : "GG — rematch?"}`;
      sendBtn.classList.toggle("hidden", !tttMoved);
    } else if (full) {
      statusEl.textContent = `It's a draw 🤝 ${tttMoved ? "Send it back to make it official." : "Rematch?"}`;
      sendBtn.classList.toggle("hidden", !tttMoved);
    } else if (tttMoved) {
      statusEl.textContent = "Nice move! Send it — or tap another square to change your mind.";
      sendBtn.classList.remove("hidden");
    } else {
      statusEl.textContent = `You're ${glyph[turn]} — tap a square to make your move.`;
      sendBtn.classList.add("hidden");
    }
  }

  document.getElementById("ttt-send").addEventListener("click", (e) => {
    const state = tttBoard.join("");
    const win = tttWinner(state);
    const url = `${BASE_URL}#ttt=${state}`;
    let text;
    if (win) text = "⭕ Tic-Tac-Toe: that's game!! Tap to see the final board 🏆";
    else if (!state.includes("-")) text = "⭕ Tic-Tac-Toe: it's a draw. We're too evenly matched 🤝";
    else text = "⭕ Tic-Tac-Toe: your move! Tap to play 👇";
    sendFromButton(e.currentTarget, text, url, null, IN_IMESSAGE ? bubbleForTtt(state) : null);
  });

  document.getElementById("ttt-reset").addEventListener("click", () => {
    clearHash();
    tttInit("---------");
  });

  // ---------- emoji riddle ----------

  const emojiPuzzleInput = document.getElementById("emoji-puzzle");
  const emojiAnswerInput = document.getElementById("emoji-answer");

  function emojiShowCompose() {
    document.getElementById("emoji-compose").classList.remove("hidden");
    document.getElementById("emoji-solve").classList.add("hidden");
    emojiPuzzleInput.value = "";
    emojiAnswerInput.value = "";
  }

  function emojiSubmit() {
    const puzzle = emojiPuzzleInput.value.trim();
    const answer = emojiAnswerInput.value.trim();
    if (!puzzle || !answer) {
      toast("Fill in both the riddle and the answer!");
      return;
    }
    const url = `${BASE_URL}#emoji=${enc(puzzle)}.${enc(answer)}`;
    sendFromButton(
      document.getElementById("emoji-send"),
      `🧩 Emoji Riddle: ${puzzle}\n\nThink you know it? Tap to check 👇`,
      url,
      null,
      IN_IMESSAGE ? bubbleForEmoji(puzzle) : null
    );
  }

  document.getElementById("emoji-send").addEventListener("click", emojiSubmit);

  emojiPuzzleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") emojiAnswerInput.focus();
  });
  emojiAnswerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") emojiSubmit();
  });

  function emojiShowSolve(puzzle, answer) {
    document.getElementById("emoji-compose").classList.add("hidden");
    document.getElementById("emoji-solve").classList.remove("hidden");
    document.getElementById("emoji-display").textContent = puzzle;
    const revealBtn = document.getElementById("emoji-reveal");
    const answerEl = document.getElementById("emoji-answer-text");
    const backBtn = document.getElementById("emoji-back-atcha");
    revealBtn.classList.remove("hidden");
    answerEl.classList.add("hidden");
    answerEl.textContent = answer;
    backBtn.classList.add("hidden");
    revealBtn.onclick = () => {
      tick();
      revealBtn.classList.add("hidden");
      answerEl.classList.remove("hidden");
      backBtn.classList.remove("hidden");
    };
    backBtn.onclick = () => {
      clearHash();
      emojiShowCompose();
    };
    show("emoji");
  }

  // ---------- pictionary ----------
  // Strokes are captured on a 256x256 normalized grid and packed into
  // bytes ([count-hi, count-lo, x, y, x, y, ...] per stroke), then
  // base64url'd into the link — so the whole drawing travels in the URL.

  const PICT_MAX_POINTS = 1200; // keeps the link a sane length for Messages
  const PICT_INK = "#e8553f";
  const PICT_PAPER = "#fffdfb";

  let pictStrokes = [];       // finished strokes: arrays of [x, y] in 0-255
  let pictLive = null;        // stroke currently being drawn
  let pictPoints = 0;
  let pictInkWarned = false;
  let pictSolveStrokes = null;
  let pictReplayToken = 0;    // invalidates an in-flight replay animation

  const pictCanvas = document.getElementById("pict-canvas");
  const pictCanvas2 = document.getElementById("pict-canvas2");
  const pictWordInput = document.getElementById("pict-word");

  function bytesToB64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64ToBytes(str) {
    try {
      const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      return null;
    }
  }

  function encodeStrokes(strokes) {
    const bytes = [];
    for (const s of strokes) {
      bytes.push((s.length >> 8) & 255, s.length & 255);
      for (const [x, y] of s) bytes.push(x, y);
    }
    return bytesToB64(Uint8Array.from(bytes));
  }

  function decodeStrokes(str) {
    const bytes = b64ToBytes(str);
    if (!bytes || !bytes.length) return null;
    const strokes = [];
    let i = 0;
    let total = 0;
    while (i < bytes.length) {
      if (i + 2 > bytes.length) return null;
      const n = (bytes[i] << 8) | bytes[i + 1];
      i += 2;
      if (n < 1 || i + n * 2 > bytes.length) return null;
      total += n;
      if (total > PICT_MAX_POINTS * 2) return null;
      const s = [];
      for (let k = 0; k < n; k++) {
        s.push([bytes[i], bytes[i + 1]]);
        i += 2;
      }
      strokes.push(s);
    }
    return strokes.length ? strokes : null;
  }

  // Match the canvas backing store to its on-screen size (and dpr).
  function pictFitCanvas(canvas) {
    const cssSize = canvas.clientWidth;
    if (!cssSize) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(cssSize * dpr);
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
  }

  function pictPaint(canvas, strokes, upToPoints) {
    pictFitCanvas(canvas);
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    ctx.fillStyle = PICT_PAPER;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = PICT_INK;
    ctx.lineWidth = Math.max(3, size / 90);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const k = size / 256;
    let budget = upToPoints === undefined ? Infinity : upToPoints;
    for (const s of strokes) {
      if (budget <= 0) break;
      ctx.beginPath();
      ctx.moveTo(s[0][0] * k, s[0][1] * k);
      const nPts = Math.min(s.length, Math.max(1, budget));
      for (let i = 1; i < nPts; i++) ctx.lineTo(s[i][0] * k, s[i][1] * k);
      if (nPts === 1) ctx.lineTo(s[0][0] * k + 0.001, s[0][1] * k); // a dot
      ctx.stroke();
      budget -= s.length;
    }
  }

  function pictComposeRepaint() {
    const all = pictLive ? pictStrokes.concat([pictLive]) : pictStrokes;
    pictPaint(pictCanvas, all);
    if (!all.length) {
      // Empty canvas: show a gentle affordance where the drawing goes.
      const ctx = pictCanvas.getContext("2d");
      const size = pictCanvas.width;
      if (!size) return;
      ctx.fillStyle = "#d9c0b6";
      ctx.font = `600 ${Math.round(size / 16)}px Nunito, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✏️ draw your word here", size / 2, size / 2);
    }
  }

  function pictRandomWord() {
    return PICT_WORDS[Math.floor(Math.random() * PICT_WORDS.length)];
  }

  function pictShowCompose() {
    document.getElementById("pict-compose").classList.remove("hidden");
    document.getElementById("pict-solve").classList.add("hidden");
    pictStrokes = [];
    pictLive = null;
    pictPoints = 0;
    pictInkWarned = false;
    pictReplayToken++;
    if (!pictWordInput.value.trim()) pictWordInput.value = pictRandomWord();
    requestAnimationFrame(pictComposeRepaint);
  }

  function pictPointFromEvent(e) {
    const rect = pictCanvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, Math.round(((e.clientX - rect.left) / rect.width) * 255)));
    const y = Math.max(0, Math.min(255, Math.round(((e.clientY - rect.top) / rect.height) * 255)));
    return [x, y];
  }

  pictCanvas.addEventListener("pointerdown", (e) => {
    if (pictPoints >= PICT_MAX_POINTS) return;
    e.preventDefault();
    pictCanvas.setPointerCapture(e.pointerId);
    pictLive = [pictPointFromEvent(e)];
    pictPoints++;
    pictComposeRepaint();
  });

  pictCanvas.addEventListener("pointermove", (e) => {
    if (!pictLive) return;
    e.preventDefault();
    if (pictPoints >= PICT_MAX_POINTS) {
      if (!pictInkWarned) {
        pictInkWarned = true;
        toast("That's a masterpiece — you're out of ink! 🖌️");
      }
      return;
    }
    const [x, y] = pictPointFromEvent(e);
    const last = pictLive[pictLive.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) < 3) return; // thin dense points
    pictLive.push([x, y]);
    pictPoints++;
    pictComposeRepaint();
  });

  function pictEndStroke() {
    if (!pictLive) return;
    pictStrokes.push(pictLive);
    pictLive = null;
    pictComposeRepaint();
  }

  pictCanvas.addEventListener("pointerup", pictEndStroke);
  pictCanvas.addEventListener("pointercancel", pictEndStroke);

  document.getElementById("pict-dice").addEventListener("click", () => {
    pictWordInput.value = pictRandomWord();
  });

  document.getElementById("pict-undo").addEventListener("click", () => {
    const gone = pictStrokes.pop();
    if (gone) pictPoints -= gone.length;
    if (pictPoints < PICT_MAX_POINTS) pictInkWarned = false;
    pictComposeRepaint();
  });

  document.getElementById("pict-clear").addEventListener("click", () => {
    pictStrokes = [];
    pictLive = null;
    pictPoints = 0;
    pictInkWarned = false;
    pictComposeRepaint();
  });

  document.getElementById("pict-send").addEventListener("click", () => {
    const word = pictWordInput.value.trim();
    if (!word) {
      toast("Give your drawing a secret word first!");
      return;
    }
    if (!pictStrokes.length) {
      toast("Draw something first! 🖌️");
      return;
    }
    const url = `${BASE_URL}#draw=${enc(word)}.${encodeStrokes(pictStrokes)}`;
    sendFromButton(
      document.getElementById("pict-send"),
      "🎨 Pictionary! I drew something for you... watch it, guess it, then tap to reveal 👇",
      url,
      null,
      IN_IMESSAGE ? bubbleForPict(pictStrokes) : null
    );
  });

  function pictReplay() {
    if (!pictSolveStrokes) return;
    const token = ++pictReplayToken;
    const total = pictSolveStrokes.reduce((n, s) => n + s.length, 0);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || total < 2) {
      pictPaint(pictCanvas2, pictSolveStrokes);
      return;
    }
    const frames = 90; // ~1.5s at 60fps
    const step = Math.max(1, Math.ceil(total / frames));
    let shown = 0;
    (function tick() {
      if (token !== pictReplayToken) return; // superseded
      shown = Math.min(total, shown + step);
      pictPaint(pictCanvas2, pictSolveStrokes, shown);
      if (shown < total) requestAnimationFrame(tick);
    })();
  }

  function pictShowSolve(word, strokes) {
    show("pict");
    document.getElementById("pict-compose").classList.add("hidden");
    document.getElementById("pict-solve").classList.remove("hidden");
    pictSolveStrokes = strokes;
    const revealBtn = document.getElementById("pict-reveal");
    const wordEl = document.getElementById("pict-word-text");
    const backBtn = document.getElementById("pict-back-atcha");
    revealBtn.classList.remove("hidden");
    wordEl.classList.add("hidden");
    wordEl.textContent = `It's... ${word}!`;
    backBtn.classList.add("hidden");
    revealBtn.onclick = () => {
      tick();
      revealBtn.classList.add("hidden");
      wordEl.classList.remove("hidden");
      backBtn.classList.remove("hidden");
    };
    backBtn.onclick = () => {
      clearHash();
      pictWordInput.value = "";
      pictShowCompose();
    };
    requestAnimationFrame(pictReplay);
  }

  document.getElementById("pict-replay").addEventListener("click", pictReplay);

  window.addEventListener("resize", () => {
    if (document.getElementById("view-pict").classList.contains("hidden")) return;
    if (pictSolveStrokes && !document.getElementById("pict-solve").classList.contains("hidden")) {
      pictPaint(pictCanvas2, pictSolveStrokes);
    } else {
      pictComposeRepaint();
    }
  });

  // ---------- trivia battle ----------

  let battleKey, battleScore, battleAnswered, battleTheirScore;

  function battleInit(dateKey, theirScore) {
    battleKey = dateKey;
    battleTheirScore = theirScore;
    battleScore = 0;
    battleAnswered = 0;

    const statusEl = document.getElementById("battle-status");
    if (theirScore !== null) {
      const when = dateKey === todayKey() ? "today's" : `the ${dateKey}`;
      statusEl.textContent = `Your friend scored ${theirScore}/5 on ${when} battle. Same 5 questions — beat it or eat it. 🔥`;
    } else {
      statusEl.textContent = "Five questions, same for both of you today. Answer honestly — friendship court is in session.";
    }

    const arena = document.getElementById("battle-arena");
    arena.innerHTML = "";
    document.getElementById("battle-send").classList.add("hidden");
    document.getElementById("battle-again").classList.add("hidden");
    document.getElementById("battle-invite").classList.remove("hidden");
    const progressEl = document.getElementById("battle-progress");
    progressEl.classList.add("hidden");
    progressEl.textContent = "";

    battleSet(dateKey).forEach((item, n) => {
      const el = document.createElement("div");
      el.className = "battle-q";
      el.innerHTML = `
        <p class="qnum">Question ${n + 1} of 5</p>
        <p class="qtext">${esc(item.q)}</p>
        <div class="reveal-wrap">
          <button type="button" class="btn btn-reveal">Reveal answer 👀</button>
          <p class="answer hidden" aria-live="polite">${esc(item.a)}</p>
        </div>
        <div class="score-row hidden">
          <button type="button" class="btn btn-yes">I got it ✅</button>
          <button type="button" class="btn btn-no">Missed it ❌</button>
        </div>`;
      const revealBtn = el.querySelector(".btn-reveal");
      revealBtn.addEventListener("click", () => {
        tick();
        revealBtn.classList.add("hidden");
        el.querySelector(".answer").classList.remove("hidden");
        el.querySelector(".score-row").classList.remove("hidden");
      });
      const yes = el.querySelector(".btn-yes");
      const no = el.querySelector(".btn-no");
      function pick(gotIt, btn) {
        if (yes.disabled) return;
        yes.disabled = no.disabled = true;
        btn.classList.add("picked");
        el.dataset.done = "1";
        if (gotIt) battleScore++;
        battleAnswered++;
        tick();
        const progressEl = document.getElementById("battle-progress");
        progressEl.classList.remove("hidden");
        progressEl.textContent =
          battleAnswered === 5
            ? "All five answered! 🎉"
            : `Answered ${battleAnswered} of 5 — finish them all, then send your score.`;
        if (battleAnswered === 5) {
          battleFinish();
        } else {
          // Carry the player to the next unanswered question.
          const next = arena.querySelector(".battle-q:not([data-done])");
          if (next) {
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            next.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
          }
        }
      }
      yes.addEventListener("click", () => pick(true, yes));
      no.addEventListener("click", () => pick(false, no));
      arena.appendChild(el);
    });
  }

  function battleFinish() {
    const arena = document.getElementById("battle-arena");
    const result = document.createElement("div");
    result.className = "battle-result";
    result.setAttribute("aria-live", "polite");
    if (battleTheirScore !== null) {
      const verdict =
        battleScore > battleTheirScore ? "Victory is yours 👑" :
        battleScore < battleTheirScore ? "Ouch... they got you this time 💀" :
        "Dead tie. The rivalry continues 🤝";
      result.innerHTML = `<p class="big">You ${battleScore} — ${battleTheirScore} Them</p><p>${verdict}</p>`;
      // An older challenge link? Offer today's fresh set afterwards.
      if (battleKey !== todayKey()) {
        document.getElementById("battle-again").classList.remove("hidden");
      }
    } else {
      result.innerHTML = `<p class="big">${battleScore}/5 🎯</p><p>Now send your score and make them play.</p>`;
    }
    arena.appendChild(result);
    result.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("battle-send").classList.remove("hidden");
  }

  document.getElementById("battle-send").addEventListener("click", (e) => {
    const when = battleKey === todayKey() ? "today's questions" : `the ${battleKey} questions`;
    const url = `${BASE_URL}#battle=${battleKey}.${battleScore}`;
    sendFromButton(
      e.currentTarget,
      `⚔️ Trivia Battle: I scored ${battleScore}/5 on ${when}. Your turn — tap to play the same set 👇`,
      url,
      null,
      IN_IMESSAGE ? bubbleForBattle(battleScore) : null
    );
  });

  document.getElementById("battle-again").addEventListener("click", () => {
    clearHash();
    battleInit(todayKey(), null);
  });

  // Shareable before you've played: sends the same challenge link as the
  // games-list Invite button, pinned to this battle's question set.
  document.getElementById("battle-invite").addEventListener("click", (e) => {
    const g = GAMES.find((game) => game.id === "battle");
    const url = `${BASE_URL}#g=battle.${battleKey || todayKey()}`;
    sendFromButton(e.currentTarget, g.invite, url, null, IN_IMESSAGE ? bubbleForInvite(g) : null);
  });

  // ---------- hash routing ----------

  function route() {
    const hash = location.hash.slice(1);
    if (!hash) { show("today"); return; }

    const eq = hash.indexOf("=");
    const kind = eq === -1 ? hash : hash.slice(0, eq);
    const val = eq === -1 ? "" : hash.slice(eq + 1);

    if (kind === "c") {
      const [type, idxStr, linkDate, respRaw] = val.split(".");
      const idx = parseInt(idxStr, 10);
      const pool = CONTENT[type];
      if (pool && idx >= 0 && idx < pool.length) {
        // A dated link from a friend in a nearby calendar day pins the deck
        // to their day, so both of you look at the same five cards. Links
        // without a nearby date (stale or legacy) reset any earlier pin.
        const validDate = linkDate && withinDays(linkDate, 2) ? linkDate : null;
        const target = validDate || todayKey();
        if (target !== deckKey) renderDeck(target);
        const holder = document.getElementById("single-card");
        holder.innerHTML = "";
        holder.appendChild(buildCard(type, idx, validDate || todayKey(), "receive", validResp(type, respRaw)));
        show("card");
        return;
      }
    } else if (kind === "g") {
      // Game invite: drop the recipient straight into the game.
      const [gid, gDate] = val.split(".");
      if (GAMES.some((game) => game.id === gid)) {
        if (gid === "battle") {
          const target = gDate && withinDays(gDate, 2) ? gDate : todayKey();
          if (target !== deckKey) renderDeck(target);
          battleInit(target, null);
          show("battle");
        } else {
          openGame(gid);
        }
        return;
      }
    } else if (kind === "ttt" && /^[xo-]{9}$/.test(val) && tttPlausible(val)) {
      tttInit(val);
      show("ttt");
      return;
    } else if (kind === "emoji") {
      const [p, a] = val.split(".");
      const puzzle = dec(p);
      const answer = dec(a || "");
      if (puzzle && answer) { emojiShowSolve(puzzle, answer); return; }
    } else if (kind === "draw") {
      const dot = val.indexOf(".");
      if (dot > 0) {
        const word = dec(val.slice(0, dot));
        const strokes = decodeStrokes(val.slice(dot + 1));
        if (word && word.trim() && strokes) { pictShowSolve(word.trim(), strokes); return; }
      }
    } else if (kind === "battle") {
      const m = val.match(/^(\d{4}-\d{2}-\d{2})\.([0-5])$/);
      if (m) {
        const target = withinDays(m[1], 2) ? m[1] : todayKey();
        if (target !== deckKey) renderDeck(target);
        battleInit(m[1], parseInt(m[2], 10));
        show("battle");
        return;
      }
    }

    // Unknown or tampered state: clean the URL and land on today.
    clearHash();
    show("today");
  }

  window.addEventListener("hashchange", route);

  // ---------- boot ----------

  renderDeck();
  renderGames();
  route();
})();
