# Daily5 🪸

Five fresh cards a day for long-distance friends — live at
`https://trumooo.github.io/daily5/`

## What's in the box

**Today's Five** — picked deterministically from the date, so both friends
always see the identical set. Each pool cycles through a seeded shuffle:
guaranteed different cards every day, and nothing repeats until a whole
pool has been used up.

1. 🧠 **Trivia** — with a tap-to-reveal answer
2. 💬 **Question of the day**
3. 📸 **Challenge** — e.g. "send a photo of you and your favorite bevy"
4. 🤔 **This or that**
5. 🎲 **Wildcard**

Pick whichever ones you like and hit **Send** — it opens the iOS share sheet
(Messages is right there), or copies the text on desktop.

**The whole exchange lives in the app.** When your friend opens a card link,
they don't just look at it — they respond in-app and the response travels
back through the link: tap a side on this-or-that (with a twins/clash
verdict when picks meet), type an answer to the question of the day or
wildcard, self-score the trivia (the reply message compares your results),
or accept a photo challenge. Opening a reply shows their pick starred,
their answer quoted, or their result bannered — and you can respond right
back.

**Games** — a GamePigeon-style tile grid: tapping a tile IS the action.
Challenge games (📨) fire the game message immediately and the recipient
takes the first turn; compose games (✏️) open a quick setup first, then
send. Open games take the full screen. Player count is on every tile.

- ⭕ **Tic-Tac-Toe** · 2P — tap to challenge; they make the opening move
  and the board ping-pongs through the links.
- 🧩 **Emoji Riddle** · 2P — write a riddle + hidden answer, they guess
  then reveal.
- 🎨 **Pictionary** · 2P — five brush colors, a 60-second clock that
  starts on your first stroke, and the whole drawing travels in the link;
  they watch it replay stroke by stroke, guess, then reveal.
- ⚔️ **Trivia Battle** · 2P — tap to challenge, then play your own round;
  same 5 date-pinned questions for both, head-to-head result on their end.

No backend, no accounts: all state lives in the URL hash, all daily content
is seeded from the date in `content.js`.

## Files

- `index.html` / `styles.css` / `script.js` — the app (coral theme 🪸, with
  automatic dark mode, reduced-motion support, and screen-reader labels)
- `content.js` — the content pools; add questions/challenges here anytime
- `manifest.webmanifest` + `icon-*.png` / `apple-touch-icon.png` — home-screen
  install support with the coral icon
- `og-image.png` — the preview card shown when the link is shared
- `/Daily5-iOS/` (repo root) — complete, ready-to-open Xcode project for the
  iMessage app extension: open `Daily5.xcodeproj`, press Run, and it appears
  in the simulator's Messages drawer (see its README for device + App Store
  steps)
