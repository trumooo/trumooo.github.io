/* Daily5 — five cards a day for long-distance friends.
   Cards are picked deterministically from the date, so both friends
   always see the same set. Games travel through Messages as links
   that carry the game state in the URL hash. */

(function () {
  "use strict";

  const BASE_URL = location.origin + location.pathname;
  const IN_IMESSAGE =
    new URLSearchParams(location.search).get("imsg") === "1" &&
    window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.daily5;

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
    while (picked.length < 5) {
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

  // ---------- sending ----------

  const toastEl = document.getElementById("toast");
  let toastTimer;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  async function send(text, url) {
    const full = url ? `${text}\n\n${url}` : text;

    // Inside the iMessage extension the native side inserts an MSMessage.
    if (IN_IMESSAGE) {
      window.webkit.messageHandlers.daily5.postMessage({ text, url: url || BASE_URL });
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ text: full });
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // user closed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(full);
      toast("Copied! Paste it into Messages 💬");
    } catch {
      toast("Couldn't copy — select and copy manually");
    }
  }

  // ---------- views ----------

  const views = ["today", "games", "card", "ttt", "emoji", "battle"];

  function show(name) {
    views.forEach((v) => document.getElementById("view-" + v).classList.toggle("hidden", v !== name));
    document.getElementById("tabs").classList.toggle("hidden", name === "card");
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => show(t.dataset.tab))
  );

  document.querySelectorAll("[data-back]").forEach((b) =>
    b.addEventListener("click", () => {
      history.replaceState(null, "", BASE_URL + location.search);
      show("today");
    })
  );

  // ---------- card rendering ----------

  const CARD_META = {
    trivia: { badge: "badge-trivia", label: "Trivia", emoji: "🧠" },
    qotd: { badge: "badge-qotd", label: "Question of the day", emoji: "💬" },
    challenge: { badge: "badge-challenge", label: "Challenge", emoji: "📸" },
    thisOrThat: { badge: "badge-thisorthat", label: "This or that", emoji: "🤔" },
    wildcard: { badge: "badge-wildcard", label: "Wildcard", emoji: "🎲" },
  };

  function buildCard(type, idx) {
    const meta = CARD_META[type];
    const card = document.createElement("div");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "card-top";
    top.innerHTML = `<span class="badge ${meta.badge}">${meta.label}</span><span class="card-emoji">${meta.emoji}</span>`;
    card.appendChild(top);

    let shareText;
    const shareUrl = `${BASE_URL}#c=${type}.${idx}`;

    if (type === "trivia") {
      const item = CONTENT.trivia[idx];
      shareText = `🧠 Trivia time! ${item.q}\n\nTap to reveal the answer 👇`;
      card.insertAdjacentHTML(
        "beforeend",
        `<p class="card-text">${item.q}</p>
         <div class="reveal-wrap">
           <button class="btn btn-reveal">Tap to reveal 👀</button>
           <p class="answer hidden">${item.a}</p>
         </div>`
      );
      const revealBtn = card.querySelector(".btn-reveal");
      revealBtn.addEventListener("click", () => {
        revealBtn.classList.add("hidden");
        card.querySelector(".answer").classList.remove("hidden");
      });
    } else if (type === "thisOrThat") {
      const [a, b] = CONTENT.thisOrThat[idx];
      shareText = `🤔 This or that: ${a} or ${b}?? Choose wisely...`;
      card.insertAdjacentHTML(
        "beforeend",
        `<div class="tot-row">
           <div class="tot-option">${a}</div>
           <span class="tot-vs">VS</span>
           <div class="tot-option">${b}</div>
         </div>`
      );
    } else {
      const text = CONTENT[type][idx];
      shareText = `${meta.emoji} ${meta.label}: ${text}`;
      card.insertAdjacentHTML("beforeend", `<p class="card-text">${text}</p>`);
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const sendBtn = document.createElement("button");
    sendBtn.className = "btn btn-primary";
    sendBtn.textContent = "Send this one 📨";
    sendBtn.addEventListener("click", () => send(shareText, shareUrl));
    actions.appendChild(sendBtn);
    card.appendChild(actions);
    return card;
  }

  function renderDeck() {
    const key = todayKey();
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

  // ---------- games list ----------

  function renderGames() {
    const list = document.getElementById("game-list");
    list.innerHTML = "";
    GAMES.forEach((g) => {
      const el = document.createElement("div");
      el.className = "game-card";
      el.innerHTML = `
        <div class="game-emoji">${g.emoji}</div>
        <div class="game-info">
          <h3>${g.name}</h3>
          <p>${g.desc}</p>
        </div>
        <span class="players-badge">👥 ${g.players} players</span>`;
      el.addEventListener("click", () => openGame(g.id));
      list.appendChild(el);
    });
  }

  function openGame(id) {
    if (id === "ttt") { tttInit("---------"); show("ttt"); }
    else if (id === "emoji") { emojiShowCompose(); show("emoji"); }
    else if (id === "battle") { battleInit(todayKey(), null); show("battle"); }
  }

  // ---------- tic-tac-toe ----------

  const WINS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  let tttBoard, tttMoved;

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

  function tttInit(state) {
    tttBoard = state.split("");
    tttMoved = false;
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

    boardEl.innerHTML = "";
    tttBoard.forEach((cell, i) => {
      const btn = document.createElement("button");
      btn.className = "ttt-cell";
      btn.textContent = glyph[cell];
      if (win && win.line.includes(i)) btn.classList.add("win");
      btn.disabled = cell !== "-" || !!win || tttMoved;
      btn.addEventListener("click", () => {
        tttBoard[i] = turn;
        tttMoved = true;
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
      statusEl.textContent = "Nice move! Now send the board back 👇";
      sendBtn.classList.remove("hidden");
    } else {
      statusEl.textContent = `You're ${glyph[turn]} — tap a square to make your move.`;
      sendBtn.classList.add("hidden");
    }
  }

  document.getElementById("ttt-send").addEventListener("click", () => {
    const state = tttBoard.join("");
    const win = tttWinner(state);
    const url = `${BASE_URL}#ttt=${state}`;
    let text;
    if (win) text = "⭕ Tic-Tac-Toe: that's game!! Tap to see the final board 🏆";
    else if (!state.includes("-")) text = "⭕ Tic-Tac-Toe: it's a draw. We're too evenly matched 🤝";
    else text = "⭕ Tic-Tac-Toe: your move! Tap to play 👇";
    send(text, url);
  });

  document.getElementById("ttt-reset").addEventListener("click", () => tttInit("---------"));

  // ---------- emoji riddle ----------

  function emojiShowCompose() {
    document.getElementById("emoji-compose").classList.remove("hidden");
    document.getElementById("emoji-solve").classList.add("hidden");
    document.getElementById("emoji-puzzle").value = "";
    document.getElementById("emoji-answer").value = "";
  }

  document.getElementById("emoji-send").addEventListener("click", () => {
    const puzzle = document.getElementById("emoji-puzzle").value.trim();
    const answer = document.getElementById("emoji-answer").value.trim();
    if (!puzzle || !answer) {
      toast("Fill in both the riddle and the answer!");
      return;
    }
    const url = `${BASE_URL}#emoji=${enc(puzzle)}.${enc(answer)}`;
    send(`🧩 Emoji Riddle: ${puzzle}\n\nThink you know it? Tap to check 👇`, url);
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
      revealBtn.classList.add("hidden");
      answerEl.classList.remove("hidden");
      backBtn.classList.remove("hidden");
    };
    backBtn.onclick = () => emojiShowCompose();
    show("emoji");
  }

  // ---------- trivia battle ----------

  let battleKey, battleScore, battleAnswered, battleTheirScore;

  function battleInit(dateKey, theirScore) {
    battleKey = dateKey;
    battleTheirScore = theirScore;
    battleScore = 0;
    battleAnswered = 0;

    const statusEl = document.getElementById("battle-status");
    if (theirScore !== null) {
      statusEl.textContent = `Your friend scored ${theirScore}/5 on the ${dateKey} battle. Same 5 questions — beat it or eat it. 🔥`;
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
        <p class="qtext">${item.q}</p>
        <div class="reveal-wrap">
          <button class="btn btn-reveal">Reveal answer 👀</button>
          <p class="answer hidden">${item.a}</p>
        </div>
        <div class="score-row hidden">
          <button class="btn btn-yes">I got it ✅</button>
          <button class="btn btn-no">Missed it ❌</button>
        </div>`;
      const revealBtn = el.querySelector(".btn-reveal");
      revealBtn.addEventListener("click", () => {
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
        if (gotIt) battleScore++;
        battleAnswered++;
        if (battleAnswered === 5) battleFinish();
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
    if (battleTheirScore !== null) {
      const verdict =
        battleScore > battleTheirScore ? "Victory is yours 👑" :
        battleScore < battleTheirScore ? "Ouch... they got you this time 💀" :
        "Dead tie. The rivalry continues 🤝";
      result.innerHTML = `<p class="big">You ${battleScore} — ${battleTheirScore} Them</p><p>${verdict}</p>`;
    } else {
      result.innerHTML = `<p class="big">${battleScore}/5 🎯</p><p>Now send your score and make them play.</p>`;
    }
    arena.appendChild(result);
    result.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("battle-send").classList.remove("hidden");
  }

  document.getElementById("battle-send").addEventListener("click", () => {
    const url = `${BASE_URL}#battle=${battleKey}.${battleScore}`;
    send(`⚔️ Trivia Battle: I scored ${battleScore}/5 on today's questions. Your turn — tap to play the same set 👇`, url);
  });

  document.getElementById("battle-again").addEventListener("click", () => battleInit(todayKey(), null));

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
    } else if (kind === "ttt" && /^[xo-]{9}$/.test(val)) {
      tttInit(val);
      show("ttt");
      return;
    } else if (kind === "emoji") {
      const [p, a] = val.split(".");
      const puzzle = dec(p);
      const answer = dec(a || "");
      if (puzzle && answer) { emojiShowSolve(puzzle, answer); return; }
    } else if (kind === "battle") {
      const m = val.match(/^(\d{4}-\d{2}-\d{2})\.([0-5])$/);
      if (m) {
        battleInit(m[1], parseInt(m[2], 10));
        show("battle");
        return;
      }
    }
    show("today");
  }

  window.addEventListener("hashchange", route);

  // ---------- boot ----------

  renderDeck();
  renderGames();
  route();
})();
