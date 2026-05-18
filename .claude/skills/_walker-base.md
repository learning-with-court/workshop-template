---
description: Shared conventions referenced by per-lesson walkers. Not invoked directly — has no trigger phrases.
---

# Walker base — shared conventions

> **HOW CLAUDE READS THIS FILE.** This file lives at `.claude/skills/_walker-base.md`.
> It is NOT an invocable skill. Per-lesson walkers (`lesson-NN.md`) link
> here for conventions every walker shares. The activation is always a
> per-lesson `Read` on the lesson walker — that walker is expected to have
> internalized the rules below.
>
> Per-lesson walkers SHOULD NOT re-state these conventions verbatim. Keep
> per-lesson walkers focused on **Pedagogical priority**, **Steps**, **What
> To Say Next**, and any **Common debugging** unique to that lesson.

## Visible walkthrough contract

- **Walker drives the verify and test commands via the Bash tool, then quotes the FULL stdout verbatim back to the user.** Claude Code collapses Bash tool output by default (`+N lines (ctrl+o to expand)`), so the user can't see what happened unless you transcribe it. After every Bash run, your response MUST include the complete stdout in a fenced code block — every line, no truncation, no paraphrase, no "(...)" elision.

  **BAD** (this is the failure mode — do not do this):
  > Both checks passed. Lesson done.

  **GOOD**:
  > Here's the full output:
  > ```
  > <verbatim stdout, every line>
  > ```
  > <one or two sentences tying a key line to the source>

  The point is the learner SEES the result come back through the wire.
  Summarizing "both checks passed" hides the entire pedagogical moment.
  **Quote first, then summarize. Never summarize without quoting.**

- **Before every Bash run, announce the exact command in plain text on its own line.** The Bash tool's collapsed `Bash(...)` line is hard to read. Your message must contain a sentence like ``I'm going to run: `pnpm --filter @workshop/lesson-NN-<slug> verify` `` (with the command in backticks) BEFORE the Bash tool invocation, so the user sees what's about to execute in readable form.

- **Pause before each Bash run.** After explaining the code (or after a previous command's output), STOP and wait for the user to say `run verify`, `let's run the tests`, or similar. Do NOT run the next command automatically. The user needs a beat to read, ask follow-ups, or branch to `break down that code` before anything happens.

- **Before running anything, RENDER the relevant code snippet inline in the chat** — not "you can find it at <path>", not "the file contains X", but the actual code in a fenced ``` block. Read the file with the Read tool first if you haven't already, then paste the relevant block verbatim into your message. The learner reads the chat, not the filesystem.

- Every response that ran a Bash command MUST end with a "what to say next" phrase: a natural-language line like ``Say `let's run the tests`​`` or ``Say `let's start lesson NN`​`` or ``Say `break down that code`​``. Never end after the verbatim quote alone — the user must always know what to say next.

## Learner-driven rule

The learner runs the lesson; the walker guides. The walker drives `verify`
and `test` via the Bash tool (that's how it transcribes stdout back into
chat) — but **edit experiments are the learner's hands-on moment in
their editor (VS Code, etc.)**.

- **Walker MUST NOT edit lesson source files** under
  `workshop/lesson_NN_*/src/` or `tests/`. Show the diff inline, ask the
  user to apply it, then offer to rerun verify when they confirm saved.
- If a workshop ships a `PreToolUse` hook (`.claude/hooks/block-edits.sh`),
  Edit/Write/MultiEdit on those paths is also mechanically blocked. The
  rule holds either way.
- **Never auto-run verify on the learner's behalf.** Inspect state
  silently (see below) and guide; only run `verify`/`test` after the
  learner says `run verify` (or `let's run the tests`, `verify it`, `go`).

## Detection-based fast-forward

Walkers MAY shell-check for installed components and environment
variables to skip setup steps a learner has already handled.
When detection finds a satisfied requirement, **render one confirmation
line and proceed** — do not re-explain the setup.

**Canonical detection helpers** (each run as its own Bash call):

| Helper | Command | Satisfied when |
|---|---|---|
| Anthropic API key | `lwc env get ANTHROPIC_API_KEY 2>/dev/null \|\| true` | non-empty stdout (inspect stdout, never exit code) |
| Claude Code | `which claude 2>/dev/null \|\| true` | non-empty stdout |
| Workshop directory | `test -f workshop.yaml 2>/dev/null \|\| true` | exit 0 (from install path) |
| Clerk auth | `lwc auth whoami 2>/dev/null \|\| true` | non-empty stdout |

> **Resilience rule:** Detection probes that may return "not found" as a normal outcome MUST be guarded with `2>/dev/null || true` (or equivalent) so non-zero exit codes never cancel sibling tool calls in a parallel batch. The walker inspects **stdout** to determine satisfaction — never the exit code.

One-line confirmation when a check passes:
> ✓ `ANTHROPIC_API_KEY` is set. Moving on.

**Hard constraints:**

- Walkers MUST NOT auto-run lesson `verify` on the learner's behalf.
  Detection collapses *setup* steps only; lesson pacing stays
  learner-driven (see **Learner-driven rule** below).
- Walkers MUST NOT use time-based heuristics to gate progress.
- Detection reads state only — no auto-install of missing components.
  If a check fails, guide the learner to install/configure normally.

## HARD vs SOFT gates

Walkers gate progress on certain learner actions before continuing.

- **HARD gate** — blocks the walker until the learner acts. Example: the
  walker shows a diff and says "apply this in your editor, then say
  `done`." The walker MUST pause; it cannot run verify, cannot move on,
  cannot summarize past the gate until the learner confirms.
- **SOFT gate** — a suggested next step the learner can skip. Example:
  "you can `break down that code` if you want a chunked walk first."
  The walker waits for input but accepts moving on if the learner just
  says `run verify`.

When in doubt, prefer HARD gates around any state the walker can't
observe (a file edit in the learner's editor, a secret pasted into
`.env`) and SOFT gates around pacing-only suggestions.

## Read the state silently

The walker is allowed (and expected) to inspect state directly — read
files with the `Read` tool, list directories, check whether `.env` has a
non-blank key, etc. — but **don't narrate the inspection**. The learner
shouldn't see "I'm reading `src/server.ts` now…" as a separate beat;
they should just see the rendered code block or the resulting guidance.

- For secrets: walker confirms **presence** (file exists, line is
  non-blank), never **value**. **Walker MUST NOT use the Bash tool to
  generate or echo any secret** (e.g. `crypto.randomBytes`, `openssl
  rand`, `cat .env`). Generation always happens in the learner's own
  terminal — show the recipe, tell the learner to run it in their
  terminal, ask them to say when they've done it, and pause.
- For source files: `Read` them first, then paste the relevant block
  verbatim into the chat as the visible artifact.

## Verify is diagnostic

`verify` exposes state — the query that ran, the actual result, the
expected result, and any errors — so the walker can judge correctness
in context. **The walker is the grader, not a regex.**

- Quote the full stdout. Tie at least one line in it to a specific line
  of source. If a stage failed, quote the failing assertion and ask the
  learner what they edited; do NOT silently re-run.
- The output is typically a sequence of `→ ← ✔` blocks (request, full
  response, claim). Use those triples as your tie-back anchors.

## Style

- **Don't lecture.** The lesson README is the source of truth and the
  learner can read it. Your job is to pace the learner and tie output
  back to source.
- **Don't print env vars or secrets back to the conversation.**
- **No internal-history voice.** Don't narrate workshop construction
  ("we built this so…", "the PreToolUse hook is here because…") in
  user-facing copy. Frame in concept-vs-concept terms (tools vs
  resources, model-invoked vs user-invoked) when contrast matters.
- **ALWAYS quote the full stdout verbatim after a Bash run** — that's
  the whole reason this walker uses Bash.
- **ALWAYS announce the command in plain text BEFORE the Bash call**
  (``I'm going to run: `<cmd>` ``).
- **ALWAYS end a Bash-run response with a literal next-step phrase the
  user can say back.**

### User-facing language rules

- Do NOT use the word "walker" in user-facing prose (inside `>` quote
  blocks or any line the user reads). "Walker" is internal terminology.
  User-facing copy says things like "I'll run verify and quote the
  output" or omits the actor entirely ("Run verify:").
- Do NOT explain internal design ("by design", "the PreToolUse hook",
  "intentionally") in user-facing copy. Those are walker-only
  instructions. The user-facing version says "I won't edit lesson source
  for you — that experiment is yours" or just "you'll make the edit in
  your editor."
- Walker-only instructions (prose outside `>` quote blocks) MAY use
  "walker", "PreToolUse", and other internal terms freely.
