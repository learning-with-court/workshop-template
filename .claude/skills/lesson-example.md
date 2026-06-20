---
name: lesson-example
description: TEMPLATE — Walks the user through the example lesson of this workshop. Replace this description (and the body) with the real walker. Use third-person + 4–8 trigger phrases when authoring — e.g. "start the example lesson", "begin example", "do the example lesson", "walk me through the example", "first lesson", plus a topic-specific trigger or two. Match the phrases to your lesson's slug, not a number.
---

# Example lesson — Template walker

> **Conventions:** see [`_walker-base.md`](_walker-base.md) for the
> visible walkthrough contract, learner-driven rule, HARD vs SOFT gates,
> read-the-state-silently pattern, style, and verify-is-diagnostic
> framing. This walker only carries the per-lesson content.

> **HOW CLAUDE READS THIS FILE.** This file lives at `.claude/skills/lesson-<slug>.md`
> (here, `lesson-example.md`). Project-level skill files like this one are NOT
> registered as invocable Skills — when a walker tells Claude to "invoke the
> lesson-example skill" or "use `Skill(lesson-example)`", the call errors.
> **The activation is the Read.**
> When the learner says a trigger phrase, the agent uses the `Read` tool
> on this file and follows the prose top-to-bottom. Never write "invoke
> this skill" or "use the Skill tool" in walker prose.

> **TODO: replace this entire walker with the real one for your lesson.**
>
> Reference exemplar: `learning-with-court/workshop-mcp/.claude/skills/lesson-setup.md`.
> The required H2 sections below are the binding spec from
> `docs/WORKSHOP_SPEC.md` §1.

You are facilitating the example lesson. The lesson README at
`lessons/01-example/README.md` is the source of truth — read it first,
then walk the user through the steps below.

The lesson's shipped test is at `src/example.test.ts` (placed there by
the compose generator from `lessons/01-example/test/src/example.test.ts`).
The learner writes `src/example.ts`; the test verifies it.

## Pedagogical priority

> TODO: exactly one sentence naming the *one* concept this lesson centers.
> Example: "Prove your toolchain works before you build anything else."

## Steps

> TODO: replace this stub with the lesson's actual Steps.

1. Read `lessons/01-example/README.md` and surface the artifact requirement
   to the learner: they need to create `src/example.ts` with a single
   exported `example()` function that returns `"Hello from example!"`.

2. **Render the function signature inline** in a fenced `ts` code block.
   In one or two sentences, explain what the test exercises. Then STOP
   and wait for the learner to write the file and say `run verify`.

3. **When the user says `run verify`**, announce the command in plain text
   first:
   > I'm going to run: `pnpm exec vitest run src/example.test.ts || true`

   Then call the Bash tool, quote the full stdout verbatim in a fenced
   code block, tie one key line back to the source.

4. After a passing run: `**Say `let's start lesson 2`**` to move on.
   (Replace with your workshop's real next step.)

## What To Say Next

Always end your response with one of these — pick by what just happened:

- After explaining the spec: wait for the user to write the code. End with:
  > **Say `run verify`** when you're ready — or `I need a starting point`
  > if you want a nudge.
- After the user says `run verify`: run it, quote stdout verbatim, then:
  > **Say `let's start lesson 2`** to move on.
- If blocked:
  > Say: `help me debug the example lesson`.

## Common debugging

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find module './example.ts'` | File not created yet or wrong path | Create `src/example.ts` at the repo root |
| `expected 'Hello from example!' but got …` | Wrong return value | Match the string exactly: `"Hello from example!"` |
| `Tests  0 passed` | No exports found | Ensure `export function example()` is present |
