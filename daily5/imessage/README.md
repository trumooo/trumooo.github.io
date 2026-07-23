# Daily5 → iMessage app extension

This folder holds the native scaffold for shipping Daily5 as a real iMessage
app (the kind that lives in the app drawer inside Messages, like GamePigeon).

## How it fits together

The web app at `https://trumooo.github.io/daily5/` is the whole product — the
native extension is just a thin `WKWebView` shell around it:

1. The extension loads the web app with `?imsg=1`.
2. When that flag is present, every "Send" button in the web app posts
   `{ text, url }` to the native side instead of opening a share sheet.
3. `MessagesViewController.swift` receives it and inserts an `MSMessage`
   bubble into the conversation, with the state-carrying URL attached.
4. When the recipient taps the bubble, `willBecomeActive(with:)` reads the
   URL fragment and routes the web app straight to that card or game state
   (tic-tac-toe board, riddle, trivia battle score, etc.). If the recipient
   doesn't have the app installed, iMessage falls back to opening the URL in
   Safari — where the web app works standalone. Nobody gets a dead bubble.

This architecture means every content and game update ships instantly by
pushing to GitHub Pages — no App Store re-review needed for content changes.

## Setup steps (requires a Mac + Xcode)

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr).
2. In Xcode: **File → New → Project → iMessage App**. Name it `Daily5`.
   (An iMessage-only app has no separate iOS app icon — it lives entirely in
   Messages, which matches what we want.)
3. Delete the generated `MessagesViewController.swift` and drop in the one
   from this folder.
4. Add a `MessageCard` image (300×300, coral 🪸 card art) to the extension's
   asset catalog — it's the bubble thumbnail.
5. Fill in the iMessage app icon set (Messages requires its own icon sizes,
   including 27×20 through 74×55 and the 1024×768 marketing icon).
6. Run on a device/simulator: select the MessagesExtension scheme and Xcode
   will launch Messages with the app in the drawer.

## App Review notes (the "Apple approval" part)

- **Guideline 4.2 (minimum functionality):** thin web wrappers get rejected
  for *full apps*, but iMessage extensions that insert interactive
  `MSMessage` bubbles are exactly what the extension point is for. Emphasize
  in the review notes that the app composes interactive message bubbles
  (turn-based games, reveal-able trivia) rather than just framing a website.
- **Guideline 2.5.6:** WKWebView is the required/allowed web view — fine.
- Provide a demo video showing: picking a daily card, sending it, the
  recipient tapping the bubble and revealing the answer, and a full
  tic-tac-toe exchange.
- No accounts, no data collection, no tracking → the privacy questionnaire
  is all "No", which keeps review simple.

## Nice upgrades once the shell is approved

- `MSSession` is already used, so consecutive moves in one game collapse
  into a single updating bubble (like GamePigeon) instead of stacking.
- Generate the bubble image dynamically (render the current tic-tac-toe
  board into `layout.image`) so the board is visible before tapping.
- Add a compact-mode picker UI natively for faster card selection.
