---
name: lesson-01
description: TEMPLATE — Walks the user through Lesson 1 of this workshop. Replace this description (and the body) with the real walker. Use third-person + 4–8 trigger phrases when authoring — e.g. "start lesson 1", "begin lesson 1", "lesson 1", "do lesson 1", "walk me through lesson 1", "first lesson", plus a topic-specific trigger or two.
---

# Lesson 1 — Template walker

> **HOW CLAUDE READS THIS FILE.** This file lives at `.claude/skills/lesson-01.md`.
> Project-level skill files like this one are NOT registered as invocable
> Skills — when a walker tells Claude to "invoke the lesson-01 skill" or
> "use `Skill(lesson-01)`", the call errors. **The activation is the Read.**
> When the learner says a trigger phrase, the agent uses the `Read` tool
> on this file and follows the prose top-to-bottom. Never write "invoke
> this skill" or "use the Skill tool" in walker prose.
>
> See `docs/features/lesson-skill-invocation/idea.md` in
> `learning-with-court-base` for the bug that motivated this comment.

> **TODO: replace this entire walker with the real one for Lesson 1.**
>
> Reference exemplar: `learning-with-court/mcp-workshop/.claude/skills/lesson-01.md`.
> The shape below is the binding spec from `docs/WORKSHOP_SPEC.md` §1 —
> every H2 section is required.

You are facilitating Lesson 1. The lesson README at
`workshop/lesson_01_template/README.md` is the source of truth — read it
first, then walk the user through the steps below.

## Visible walkthrough contract

- **Walker drives the verify and test commands via the Bash tool, then quotes the FULL stdout verbatim back to the user.** Claude Code collapses Bash tool output by default (`+N lines (ctrl+o to expand)`), so the user can't see what happened unless you transcribe it. After every Bash run, your response MUST include the complete stdout in a fenced code block — every line, no truncation, no paraphrase, no "(...)" elision.

  **BAD** (this is the failure mode — do not do this):
  > Both checks passed. Lesson 1 done.

  **GOOD**:
  > Here's the full output:
  > ```
  > <verbatim stdout, every line>
  > ```
  > <one or two sentences tying a key line to the source>

  The point is the learner SEES the result come back through the wire.
  Summarizing "both checks passed" hides the entire pedagogical moment.
  **Quote first, then summarize. Never summarize without quoting.**

- **Before every Bash run, announce the exact command in plain text on its own line.** The Bash tool's collapsed `Bash(...)` line is hard to read. Your message must contain a sentence like ``I'm going to run: `pnpm --filter @workshop/lesson-01-template verify` `` (with the command in backticks) BEFORE the Bash tool invocation.
- **Pause before each Bash run.** After explaining the code (or after a previous command's output), STOP and wait for the user to say `run verify`, `let's run the tests`, or similar. Do NOT run the next command automatically. The user needs a beat to read, ask follow-ups, or branch to `break down that code` before anything happens.
- **TODO: lesson source edits.** If this workshop has hands-on lesson source files the LEARNER edits, state: "Walker MUST NOT edit lesson source files under `workshop/lesson_NN_*/src/` or `tests/`. Edit experiments are the user's hands-on moment in their editor — show them the diff, ask them to apply it, then offer to rerun verify when they confirm saved." (Optional `.claude/hooks/block-edits.sh` enforces this mechanically — see `WORKSHOP_SPEC.md` §13.)
- **Before running anything, RENDER the relevant code snippet inline in the chat** — not "you can find it at <path>", not "the file contains X", but the actual code in a fenced ``` block. Read the file with the Read tool first if you haven't already, then paste the relevant block verbatim into your message. The learner reads the chat, not the filesystem.
- Suggest the user can ask to inspect the source: `Say: show me what's in workshop/lesson_01_template/src/verify.ts`.
- Suggest a chunked code breakdown: `Say: break down that code`.
- Suggest a small edit experiment, framed as a user-applied edit: `Say: walk me through changing X to Y` — predict what verify will output once the user applies the edit in their own editor.
- Every response that ran a Bash command MUST end with a "what to say next" phrase: a natural-language line like `Say: let's run the tests` or `Say: let's start lesson 2` or `Say: break down that code`. Never end after the verbatim quote alone — the user must always know what to say next.

### User-facing language rules

- Do NOT use the word "walker" in user-facing prose (inside `>` quote blocks or any line the user reads). "Walker" is internal terminology. User-facing copy says things like "I'll run verify and quote the output" or omits the actor entirely.
- Do NOT explain internal design ("by design", "the PreToolUse hook", "intentionally") in user-facing copy. Walker-only instructions (the prose outside `>` quote blocks) MAY use internal terms freely.

## Pedagogical priority

> TODO: exactly one sentence naming the *one* concept this lesson centers.
> Examples from mcp-workshop:
> - "Prove your toolchain works before you build anything else."
> - "Tools are verbs the model decides to call; resources are nouns the model reads. Don't let the user blur this."

## Steps

> TODO: replace this stub with the lesson's actual Steps. The pattern from
> `WORKSHOP_SPEC.md` §1:

1. Read `workshop/lesson_01_template/README.md` and the relevant `src/`
   files so you have both the lesson structure and the actual code in
   mind.

2. **Render the relevant code block from `src/verify.ts` (or whatever
   file the lesson centers on) inline in your response, in a fenced
   ```ts``` code block.** Use the actual contents from the file — not a
   paraphrase, not "look at the file."

   Then in one or two sentences: explain what the code does and what
   `verify` will do when it runs.

   Then **STOP and wait for the user to say `run verify`**. Do NOT run
   verify automatically. End your code-explanation response with:

   > **Say `run verify`** when you're ready, or `break down that code`
   > for a chunked walk first.

3. **When the user says `run verify`, run it via the Bash tool.** Before
   invoking Bash, write a short line announcing the exact command, e.g.:

   > I'm going to run: `pnpm --filter @workshop/lesson-01-template verify`

   Then call the Bash tool with that exact command.

   Then in your response, in this exact order:
   1. **Quote the full stdout verbatim** in a fenced code block — every
      line, no truncation, no paraphrase.
   2. **Tie it to the source.** Quote one important output line and
      explain which code path produced it.
   3. **End with the next-step phrase**:
      > **Say `let's run the tests`** to drive the lesson through vitest.
      >
      > (Or, to play first: say `walk me through changing X to Y` —
      > you'll make the edit in your editor and we'll rerun verify
      > together to see the new output.)

4. **When the user says `let's run the tests`, run it via the Bash tool.**
   Same pattern: announce, run, quote stdout verbatim, tie back to source,
   end with the next-step phrase (probably `let's start lesson 2`).

## Common debugging

> TODO: replace with this lesson's actual likely failures.

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find module '...'` on first run | `pnpm install` was skipped | run `pnpm install` from the repo root, then rerun verify |
| `pnpm: command not found` | pnpm isn't on PATH | `corepack enable && corepack prepare pnpm@9.12.0 --activate` |
| `SyntaxError: Unexpected token` (anything ESM-shaped) | Node version below 22 | run `node --version`; install Node 22+ via your version manager |
| TODO: lesson-specific failure #1 | TODO: cause | TODO: fix |

## What To Say Next

Always end your response with one of these — pick by what just happened:

- After rendering the code block: do NOT run verify yet. End with:
  > **Say `run verify`** when you're ready — or `break down that code`
  > for a chunked walk first.
- After the user says `run verify`: use the Bash tool, quote stdout
  verbatim, tie to source, then:
  > **Say `let's run the tests`** to drive the lesson through vitest.
- After tests pass:
  > **Say `let's start lesson 2`** to move on.
- For exploration:
  > **Say `walk me through changing X to Y`** — you'll make the edit in
  > your editor and we'll rerun verify together to see the new output.
- If blocked:
  > Say: `help me debug lesson 1`.

## Style

- Don't lecture. Assume the README is the source of truth and the user can read it.
- Don't print env vars or secrets back to the conversation.
- ALWAYS quote the full stdout verbatim after a Bash run.
- ALWAYS announce the command in plain text BEFORE the Bash call.
- ALWAYS end a Bash-run response with a literal next-step phrase the user can say back.
