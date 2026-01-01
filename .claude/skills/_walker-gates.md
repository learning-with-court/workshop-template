---
description: Lazy-loaded walker coaching — HARD vs SOFT gates (when to block vs let the learner skip). Read on demand from _walker-base.md; not invoked directly.
user-invocable: false
---

# HARD vs SOFT gates

Walkers gate progress on certain learner actions before continuing.

- **HARD gate** — blocks the walker until the learner acts. Example: the
  walker shows a diff and says "apply this in your editor, then say
  `done`." The walker MUST pause; it cannot run verify, cannot move on,
  cannot summarize past the gate until the learner confirms.
- **SOFT gate** — a suggested next step the learner can skip. Example: "you
  can `break down that code` if you want a chunked walk first." The walker
  waits for input but accepts moving on if the learner just says `run
  verify`.

When in doubt, prefer HARD gates around any state the walker can't observe
(a file edit in the learner's editor, a secret pasted into `.env`) and SOFT
gates around pacing-only suggestions.
