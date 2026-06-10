---
name: lesson-01
description: TEMPLATE — Walks the user through Lesson 1 of this workshop. Replace this description (and the body) with the real walker. Use third-person + 4–8 trigger phrases when authoring — e.g. "start lesson 1", "begin lesson 1", "lesson 1", "do lesson 1", "walk me through lesson 1", "first lesson", plus a topic-specific trigger or two.
---

# Lesson 1 — Template walker

> **Conventions:** see [`_walker-base.md`](_walker-base.md) for the
> visible walkthrough contract, learner-driven rule, HARD vs SOFT gates,
> read-the-state-silently pattern, style, and verify-is-diagnostic
> framing. This walker only carries the per-lesson content.

> **HOW CLAUDE READS THIS FILE.** This file lives at `.claude/skills/lesson-01.md`.
> Project-level skill files like this one are NOT registered as invocable
> Skills — when a walker tells Claude to "invoke the lesson-01 skill" or
> "use `Skill(lesson-01)`", the call errors. **The activation is the Read.**
> When the learner says a trigger phrase, the agent uses the `Read` tool
> on this file and follows the prose top-to-bottom. Never write "invoke
> this skill" or "use the Skill tool" in walker prose.

> **TODO: replace this entire walker with the real one for Lesson 1.**
>
> Reference exemplar: `learning-with-court/workshop-mcp/.claude/skills/lesson-01.md`.
> The required H2 sections below are the binding spec from
> `docs/WORKSHOP_SPEC.md` §1.

You are facilitating Lesson 1. The lesson README at
`workshop/lesson_01_template/README.md` is the source of truth — read it
first, then walk the user through the steps below.

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

   Then **STOP and wait for the user to say `run verify`**. End your
   code-explanation response with:

   > **Say `run verify`** when you're ready, or `break down that code`
   > for a chunked walk first.

3. **When the user says `run verify`, run it via the Bash tool.** Announce
   the exact command first (e.g. ``I'm going to run: `pnpm --filter
   @workshop/lesson-01-template verify` ``), then call Bash, then:
   1. Quote the full stdout verbatim in a fenced code block.
   2. Tie one important output line to the source path that produced it.
   3. End with the next-step phrase:
      > **Say `let's run the tests`** to drive the lesson through vitest.

4. **When the user says `let's run the tests`, run it via the Bash tool.**
   Same pattern: announce, run, quote stdout verbatim, tie back to source,
   end with the next-step phrase (probably `let's start lesson 2`).

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

## Common debugging

> TODO: replace with this lesson's actual likely failures. Drop this
> section entirely if there are no lesson-specific failure modes — the
> generic toolchain failures (Node/pnpm/install) belong in the workshop
> README, not in every lesson walker.

| Symptom | Likely cause | Fix |
|---|---|---|
| TODO: lesson-specific failure #1 | TODO: cause | TODO: fix |
