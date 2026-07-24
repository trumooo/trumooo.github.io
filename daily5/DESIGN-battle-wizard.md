# Design sprint: Trivia Battle → one-question wizard

Goal: Trivia Battle should present **one question at a time** (wizard), feel
like a GamePigeon round, and stay visually native to Daily5. Every design
detail below is sourced — from the GamePigeon research, from established quiz
UX (HQ Trivia, Kahoot, Duolingo), or from Daily5's own token system.

## V0 — first redo

One question per screen. Progress dots. Reveal button → answer → self-score
("I got it / missed it") → auto-advance. Final screen: score + send.

## Self-feedback on V0

1. **The honor system is the core flaw, and the wizard makes it worse.**
   Reveal-then-self-score means the answer is one tap away before you commit.
   In a scrolling list you could pretend that's fine; isolated on its own
   screen it's obviously flimsy. Scoring should be *real*.
2. **Two taps per question (reveal, then score) × 5 = heavy.** A wizard should
   be one decision per screen.
3. **No tension.** GamePigeon rounds have pace; HQ Trivia proved a visible
   countdown is the tension engine. V0 has no clock.
4. **The rival is invisible during play.** If a challenge says "beat 4/5,"
   the target should stay on screen, not just live in the intro text.
5. **Progress dots alone are weak** — pair them with outcome state so the
   trail tells the story (Duolingo's ✓/✗ lesson pips).
6. **Nothing new travels in the link.** Score-only comparison wastes the
   wizard's per-question structure.

## Five variants generated from that feedback

- **V1 — Multiple choice.** Four options per question; distractors sampled
  from the trivia pool's other answers, seeded so both players see identical
  options. Real scoring, one tap per question. (Fixes #1, #2.)
- **V2 — Countdown wizard.** Honor scoring kept, but a per-question timer
  forces pace; timeout = miss. (Fixes #3 only.)
- **V3 — Flip-card wizard.** Card flip to reveal, swipe to advance. Pretty,
  but keeps the honor system and adds gesture complexity. (Fixes #2 barely.)
- **V4 — Rival ghost.** Challenger's per-question results ride in the link;
  after each answer you see whether *they* got that one. (Fixes #4, #6.)
- **V5 — Speed run.** Total time as tiebreaker, score+time in link.
  (Fixes #3; adds clock-anxiety to a friendship app — off-brand.)

## Pick one, iterate ×3 — V1 (multiple choice)

V1 wins because it removes the design's structural flaw (fake scoring)
rather than decorating it.

- **Iteration 1 — answer interaction.** 2×2 option grid styled as
  `tot-option` pills (existing token). Tap → instant verdict: correct option
  fills teal, a wrong pick fills coral-dark (matching `btn-yes`/`btn-no`
  semantics already in the app), buttons freeze, auto-advance after ~1s.
  One tap per question.
- **Iteration 2 — fairness of details.** Options must come from somewhere
  deterministic: 3 distractors drawn from other trivia answers with a PRNG
  seeded by `date + question index`, then seeded-shuffled — both players get
  the same four options in the same order, any day, any timezone. (Same
  seeding discipline as the daily deck.)
- **Iteration 3 — tension & story.** Progress pips fill ✓ teal / ✗ coral as
  you go (Duolingo trail); a 20-second per-question countdown reusing the
  Pictionary timer chip (HQ Trivia uses 10s, but our questions are longer
  reads; timeout = miss, correct answer flashes); a 🔥 streak toast at 3+.

## Synthesis — best elements across variants, final iteration

Take V1 as the chassis, graft **V2's countdown** (already folded in above)
and **V4's rival trail**: the sender's per-question results ride in the link
as a 5-character `g/m` pattern (`#battle=DATE.SCORE.PATTERN`), validated by
requiring the pattern's ✓ count to equal the score. The results screen shows
both trails side by side — you don't just lose 3–4, you see *which* question
sank you. Old two-part links stay valid (score-only comparison), so nothing
in flight breaks.

**Wizard + app consistency check:** one question per screen ✓; tokens reused
(`battle-q` card, `qnum` label, `tot-option` pills, `pict-timer` chip,
`answer` colors, Baloo/Nunito, coral/teal) ✓; GamePigeon flow preserved
(tile tap = challenge, both play the same board, results compare) ✓;
link-state architecture unchanged, backward compatible ✓.

## Final spec (implemented)

1. Intro line: fresh → "Same 5 questions for both of you — 20 seconds each.";
   challenged → "They scored N/5 — beat it."
2. Top bar: five pips (current ringed, done filled ✓/✗) + countdown chip.
3. Question card: "Question N of 5", question text, 4 option pills.
4. Tap or timeout → verdict colors → 1s → next question.
5. Results: big score (or "You X — Y Them"), side-by-side ✓✗ trails when the
   link carried a pattern, verdict line, Send-your-score (now with pattern),
   Challenge-a-friend, and Play-today's-set when replaying an old date.
