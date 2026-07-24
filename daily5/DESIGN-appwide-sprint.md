# Design sprint 2: the whole app, surface by surface

Same protocol as the battle wizard sprint (`DESIGN-battle-wizard.md`):
critique the current design, generate variants from the feedback, pick and
iterate, then synthesize a final round and implement it. Details sourced
from the GamePigeon research, iOS conventions, and Daily5's own tokens.

## Surface critiques (the V0 pass)

**1. App shell / header.** The header (logo + tagline + date chip) spends
~200px before content; on a phone barely one card fits above the fold
(screenshot evidence from testing). The tagline earns its place once —
not on every open. *Structural flaw: chrome tax on every visit.*

**2. Today deck.** Scroll-and-pick is the right model for a browse surface
(a wizard would slow sending, the deck's whole job) — structure stays.
Flaw inherited from the shell: the first card starts too low.

**3. Received card view.** Strong since responses landed, but it dead-ends:
after sending a response the recipient sits on a spent card. This is the
single highest-leverage screen in the app — it's where *invited friends*
arrive. *Structural flaw: no onward path at the moment of maximum interest.*

**4. Tic-Tac-Toe.** After sending a move, the board sits silent — no state
change beyond a toast. GamePigeon's bubble flips to "waiting for opponent."
*Flaw: no waiting state.* Same applies to Pictionary and Emoji Riddle after
their sends.

**5. Emoji Riddle composer.** Two empty fields — the blank-page problem.
Pictionary solves this with a dealt word + dice; the riddle screen offers
nothing. *Flaw: no spark.*

**6. Pictionary.** Freshly sprinted (colors, timer, dealt word). No
structural change; inherits the waiting-state fix.

## Variants generated from the critiques

- **A. Collapsing header** — full header on first paint, collapses on
  scroll (iOS large-title pattern). Rich but needs scroll listeners.
- **B. Permanently compact header** — one tight row, tagline demoted to
  the footer. Zero moving parts, biggest constant win.
- **C. "Waiting room" states** — after any send, the game view flips to an
  explicit waiting state with a path home.
- **D. Onward path on received cards** — after a response sends, reveal
  "See today's five →" (the app's front door, shown at the exact moment a
  friend has just experienced the loop working).
- **E. Riddle spark dice** — reuse Pictionary's 🎲 token to deal a category
  prompt ("a movie… a song… an inside joke…") into the riddle composer.

## Pick + iterate

**B** beats A: the collapse pattern's payoff is keeping a large title, but
our brand row *is* small once the tagline moves; a scroll listener buys
nothing. Iterations: (1) logo row + date chip share one line; (2) tagline
moves to the footer where it reads as a signature instead of a toll;
(3) spacing tightened so a full card + the top of the next shows above the
fold — the "there's more" scent (Fitts-friendly, no new components).

**C** iterations: (1) unify on one sentence pattern — "Sent ✓ — waiting on
them 😏"; (2) surface it in each game's existing status line (no new
elements); (3) add "Back to today's five" only where no path exists (games
already have ← back; the received card gets variant D instead).

**D** iterations: (1) ghost button revealed only after a successful send —
never competes with the response action; (2) it navigates via the existing
deck (already date-synced to the sender's day); (3) label says what's
there — "See today's five →" — not "open app."

## Synthesis (the implemented final round)

- Compact one-row header + tagline relocated to the footer (**B**)
- Post-send waiting states in Tic-Tac-Toe, Pictionary, and Emoji Riddle
  status lines (**C**) — battle already resolves to a results screen
- "See today's five →" continuation on received cards after responding (**D**)
- 🎲 spark button in the Emoji Riddle composer dealing category prompts (**E**)
- Deck structure, tile grid, and wizard untouched — their sprints stand

Consistency check: every new element reuses an existing token (dice button,
ghost button, status line, footer). No new colors, no new layouts.
