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

  function dailyPicks(dateKey) {
    const rand = mulberry32(hashString("daily5:" + dateKey));
    return {
      trivia: Math.floor(rand() * CONTENT.trivia.length),
      qotd: Math.floor(rand() * CONTENT.qotd.length),
      challenge: Math.floor(rand() * CONTENT.challenge.length),
      thisOrThat: Math.floor(rand() * CONTENT.thisOrThat.length),
      wildcard: Math.floor(rand() * CONTENT.wildcard.length),
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

  function sentSet() {
    try { return new Set(JSON.parse(store.get("daily5-sent-" + todayKey()) || "[]")); }
    catch { return new Set(); }
  }

  function markSent(type, idx) {
    const set = sentSet();
    set.add(type + "." + idx);
    store.set("daily5-sent-" + todayKey(), JSON.stringify([...set]));
  }

  function isSent(type, idx) {
    return sentSet().has(type + "." + idx);
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
  async function send(text, url) {
    if (sendInFlight) return "busy";
    sendInFlight = true;
    try {
      const full = url ? `${text}\n\n${url}` : text;

      // Inside the iMessage extension the native side inserts an MSMessage.
      if (IN_IMESSAGE) {
        window.webkit.messageHandlers.daily5.postMessage({ text, url: url || BASE_URL });
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
  async function sendFromButton(btn, text, url, restoreLabel) {
    const outcome = await send(text, url);
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

  function buildCard(type, idx) {
    const meta = CARD_META[type];
    const card = document.createElement("div");
    card.className = "card";

    const wasSent = isSent(type, idx);
    const top = document.createElement("div");
    top.className = "card-top";
    top.innerHTML =
      `<span class="card-top-left">
         <span class="badge ${meta.badge}">${meta.label}</span>
         <span class="sent-chip${wasSent ? "" : " hidden"}">Sent ✓</span>
       </span>
       <span class="card-emoji" aria-hidden="true">${meta.emoji}</span>`;
    card.appendChild(top);

    let shareText;
    const shareUrl = `${BASE_URL}#c=${type}.${idx}`;

    if (type === "trivia") {
      const item = CONTENT.trivia[idx];
      shareText = `🧠 Trivia time! ${item.q}\n\nTap to reveal the answer 👇`;
      card.insertAdjacentHTML(
        "beforeend",
        `<p class="card-text">${esc(item.q)}</p>
         <div class="reveal-wrap">
           <button type="button" class="btn btn-reveal">Tap to reveal 👀</button>
           <p class="answer hidden" aria-live="polite">${esc(item.a)}</p>
         </div>`
      );
      const revealBtn = card.querySelector(".btn-reveal");
      revealBtn.addEventListener("click", () => {
        tick();
        revealBtn.classList.add("hidden");
        card.querySelector(".answer").classList.remove("hidden");
      });
    } else if (type === "thisOrThat") {
      const [a, b] = CONTENT.thisOrThat[idx];
      shareText = `🤔 This or that: ${a} or ${b}?? Choose wisely...`;
      card.insertAdjacentHTML(
        "beforeend",
        `<div class="tot-row">
           <div class="tot-option">${esc(a)}</div>
           <span class="tot-vs" aria-label="versus">VS</span>
           <div class="tot-option">${esc(b)}</div>
         </div>`
      );
    } else {
      const text = CONTENT[type][idx];
      shareText = `${meta.emoji} ${meta.label}: ${text}`;
      card.insertAdjacentHTML("beforeend", `<p class="card-text">${esc(text)}</p>`);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "btn btn-primary";
    sendBtn.textContent = wasSent ? "Send again 📨" : "Send this one 📨";
    sendBtn.addEventListener("click", async () => {
      const outcome = await sendFromButton(sendBtn, shareText, shareUrl, "Send again 📨");
      if (outcome === "sent" || outcome === "copied") {
        markSent(type, idx);
        card.querySelector(".sent-chip").classList.remove("hidden");
      }
    });
    actions.appendChild(sendBtn);
    card.appendChild(actions);
    return card;
  }

  let renderedDeckKey = null;

  function renderDeck() {
    const key = todayKey();
    renderedDeckKey = key;
    const picks = dailyPicks(key);
    const deck = document.getElementById("deck");
    deck.innerHTML = "";
    deck.appendChild(buildCard("trivia", picks.trivia));
    deck.appendChild(buildCard("qotd", picks.qotd));
    deck.appendChild(buildCard("challenge", picks.challenge));
    deck.appendChild(buildCard("thisOrThat", picks.thisOrThat));
    deck.appendChild(buildCard("wildcard", picks.wildcard));

    document.getElementById("date-chip").textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  // A tab left open overnight gets fresh cards when it wakes up.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && renderedDeckKey !== todayKey()) renderDeck();
  });

  // ---------- games list ----------

  function renderGames() {
    const list = document.getElementById("game-list");
    list.innerHTML = "";
    GAMES.forEach((g) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "game-card";
      el.innerHTML = `
        <div class="game-emoji" aria-hidden="true">${g.emoji}</div>
        <div class="game-info">
          <h3>${esc(g.name)}</h3>
          <p>${esc(g.desc)}</p>
        </div>
        <span class="players-badge">👥 ${g.players} players</span>`;
      el.addEventListener("click", () => openGame(g.id));
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
    sendFromButton(e.currentTarget, text, url);
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
      url
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
      url
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
    sendFromButton(e.currentTarget, `⚔️ Trivia Battle: I scored ${battleScore}/5 on ${when}. Your turn — tap to play the same set 👇`, url);
  });

  document.getElementById("battle-again").addEventListener("click", () => {
    clearHash();
    battleInit(todayKey(), null);
  });

  // ---------- hash routing ----------

  function route() {
    const hash = location.hash.slice(1);
    if (!hash) { show("today"); return; }

    const eq = hash.indexOf("=");
    const kind = eq === -1 ? hash : hash.slice(0, eq);
    const val = eq === -1 ? "" : hash.slice(eq + 1);

    if (kind === "c") {
      const [type, idxStr] = val.split(".");
      const idx = parseInt(idxStr, 10);
      const pool = CONTENT[type];
      if (pool && idx >= 0 && idx < pool.length) {
        const holder = document.getElementById("single-card");
        holder.innerHTML = "";
        holder.appendChild(buildCard(type, idx));
        show("card");
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
