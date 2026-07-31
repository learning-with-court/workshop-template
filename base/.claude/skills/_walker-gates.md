---
description: Lazy-loaded walker coaching — gates by workshop mode: HARD vs SOFT when the learner drives, preconditions and decisions when the guide drives. Read on demand from _walker-base.md; not invoked directly.
user-invocable: false
---

# Gates

What a gate means depends on **who drives the work**, which a workshop
declares as `mode:` in `.workshop/mechanics.yaml`.

- `mode: builder` (the default when unset) — the LEARNER drives. They edit
  files, paste secrets, run commands. The walker frequently needs to stop and
  wait for them. HARD and SOFT gates below apply.
- `mode: presented` — the GUIDE drives. It executes the work itself (running
  notebook cells through a live kernel, for example) and the learner watches,
  directs and decides. See "Gates in a presented workshop" below.

## HARD vs SOFT gates (`mode: builder`)

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

## Gates in a presented workshop (`mode: presented`)

**A presented workshop has no HARD gates**, and adding one is a defect rather
than extra rigour. A HARD gate blocks until the learner acts — and here the
learner is not the one acting, so there is nothing to block on. Labelling
guide behaviour HARD ("the idea is actually explained") describes something
the walker cannot wait for, because it cannot wait on itself.

Three things take their place. Name them for what they are:

- **Preconditions** — state the guide CHECKS before proceeding, by reading the
  environment rather than by waiting. "The setup cell runs clean." "Verify
  passes with the model id in state." A failed precondition means fix it or
  stop, not pause for the learner.
- **Teaching requirements** — what the guide must actually do at a beat: walk
  the load-bearing lines, run, read the output WITH the learner. These are
  scored, not gated. They belong with the workshop's judge notes; a walker
  cannot block on its own conduct.
- **Decisions** — the real exception, and the only place a presented walker
  genuinely waits. A knob that changes what happens next (a threshold, a
  feature cut, a retry policy) must be OFFERED with evidence and answered by
  the learner. Offering a decision is not quizzing: there is no right answer
  being withheld.

If a lesson script in a presented workshop still labels something HARD,
treat it as one of the three above and carry on. Do not block.
