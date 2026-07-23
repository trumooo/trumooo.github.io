# Daily5 iMessage App — ready-to-open Xcode project

This is the complete native shell for shipping Daily5 as a real iMessage app
(the kind that lives in the app drawer inside Messages, like GamePigeon).
No template setup needed:

## Run it right now (simulator, no Apple account needed)

1. Open `Daily5.xcodeproj` in Xcode.
2. Select the **MessagesExtension** scheme, pick an iPhone simulator, press **Run**.
3. Xcode launches Messages in the simulator with a test conversation —
   Daily5 is in the app drawer. Send a card, make a Tic-Tac-Toe move, and
   watch the bubble render the live board.

Note: the extension loads `https://trumooo.github.io/daily5/?imsg=1`, so the
web app must be deployed (merge to `main`) for content to appear. To test
against a local copy instead, edit `appURL` at the top of
`MessagesViewController.swift`.

## How it fits together

The web app at `/daily5/` is the whole product — this project is a thin
`WKWebView` shell around it:

1. The extension loads the web app with `?imsg=1` (which switches the app
   into its compact drawer layout).
2. Every "Send" button posts `{ text, url, image }` to the `daily5` script
   message handler — `image` is a JPEG data URL of the live state (board,
   drawing, score) rendered by the web app.
3. `MessagesViewController.swift` inserts an `MSMessage` bubble with the
   state-carrying URL attached and the rendered image as the bubble art, so
   bubbles preview the actual game GamePigeon-style.
4. Tapping a bubble routes the extension (via `willBecomeActive`/`didSelect`)
   straight to that card or game state. Recipients without the app get the
   URL opened in Safari — where the web app works standalone. Nobody gets a
   dead bubble.

This architecture means every content and game update ships instantly by
pushing to GitHub Pages — no App Store re-review for content changes.

## Running on your own iPhone (free)

1. Plug in your phone and select it as the run destination.
2. In both targets' **Signing & Capabilities**, choose your Personal Team
   (free Apple ID) and change the bundle identifiers to something unique to
   you (e.g. `com.yourname.Daily5` / `com.yourname.Daily5.MessagesExtension`
   — the extension ID must be the app ID + a suffix).
3. Run. Free-account installs expire after 7 days; re-run to refresh.

## Shipping to the App Store

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr).
2. In App Store Connect, create the app record and upload a build
   (Product → Archive → Distribute).
3. TestFlight it to your friends first — that's the honest beta.

### App Review notes (the "Apple approval" part)

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
- The 1024×768 Messages App Store marketing icon slot isn't filled yet —
  add it in the asset catalog before submitting (Xcode will flag it).

## Nice upgrades once the shell is approved

- `MSSession` is already used, so consecutive moves in one game collapse
  into a single updating bubble instead of stacking.
- Route haptics through a `{haptic:"light"}` bridge message to
  `UIImpactFeedbackGenerator` (iOS web views ignore the web vibration API).
- Add a compact-mode picker UI natively for faster card selection.
