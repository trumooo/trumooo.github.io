# Daily5 🪸

Five fresh cards a day for long-distance friends — live at
`https://trumooo.github.io/daily5/`

## What's in the box

**Today's Five** — picked deterministically from the date, so both friends
always see the identical set:

1. 🧠 **Trivia** — with a tap-to-reveal answer
2. 💬 **Question of the day**
3. 📸 **Challenge** — e.g. "send a photo of you and your favorite bevy"
4. 🤔 **This or that**
5. 🎲 **Wildcard**

Pick whichever ones you like and hit **Send** — it opens the iOS share sheet
(Messages is right there), or copies the text on desktop. Trivia cards ship
with a link that opens straight to the question + reveal button.

**Games** (player count on every card, GamePigeon-style):

- ⭕ **Tic-Tac-Toe** · 2 players — the whole board travels in the link; make
  a move, send it, they tap and move back.
- 🧩 **Emoji Riddle** · 2 players — write a riddle + hidden answer, they
  guess then reveal.
- 🎨 **Pictionary** · 2 players — get a random word, draw it on the canvas,
  send it; they watch the drawing replay stroke by stroke, guess, then
  reveal. The whole drawing travels inside the link as packed stroke data.
- ⚔️ **Trivia Battle** · 2 players — same 5 daily questions for both; the
  link carries your score and the date, so they play the exact same set and
  get a head-to-head result.

No backend, no accounts: all state lives in the URL hash, all daily content
is seeded from the date in `content.js`.

## Files

- `index.html` / `styles.css` / `script.js` — the app (coral theme 🪸, with
  automatic dark mode, reduced-motion support, and screen-reader labels)
- `content.js` — the content pools; add questions/challenges here anytime
- `manifest.webmanifest` + `icon-*.png` / `apple-touch-icon.png` — home-screen
  install support with the coral icon
- `og-image.png` — the preview card shown when the link is shared
- `imessage/` — Swift scaffold + guide for shipping this as a real iMessage
  app extension once you're in the Apple Developer Program (see its README)
