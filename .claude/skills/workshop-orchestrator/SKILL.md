---
name: workshop-orchestrator
description: TODO — Root orchestrator skill for this workshop. Loaded for the whole session. Describes the workshop's MCP server contract (if any), the lesson lifecycle, and the boundary between skill-owned pedagogy and externally-tracked state. Per-lesson skills (lesson-<slug>.md) carry the actual walkthrough prose; this skill is the shared contract they all reference.
---

# Workshop orchestrator

> **Claude reads this file directly via Read. Project-level skill files
> are NOT registered as invocable Skills — never tell the agent to
> "invoke this skill" or "use the Skill tool" in walker prose; the
> agent's Read of this file is the activation.**

You are facilitating the **TODO: workshop name** workshop. The workshop walks **TODO: N lessons** that build **TODO: one-line outcome** end-to-end.

Read `.claude/skills/_walker-base.md` once before walking your first lesson — it's the canonical pedagogy contract (visible walkthrough contract, learner-driven rule, language rules, lesson structure).

Each lesson has its own skill file in `.claude/skills/`:
- `lesson-example.md` — TODO: replace with real lesson list

## Lesson lifecycle

```
1. ENTER   — user says "start lesson N" → Read .claude/skills/_walker-base.md, then Read lesson-<slug>.md
2. ORIENT  — show what this lesson teaches, surface the artifact requirement
3. INVITE  — offer a concrete starting prompt the learner can paste as-is or reshape
4. PAUSE   — wait for learner to write the code and say "run verify"
5. ANNOUNCE — say the exact verifyCommand in plain text before running it
6. RUN     — Bash tool runs the verifyCommand
7. QUOTE   — quote FULL stdout verbatim in a fenced code block
8. ADVANCE — on pass: run the 3-step advancement protocol below; on fail: narrate the mismatch, guide the fix
```

## Advancing to the next lesson (REQUIRED — do all three, in order)

When the learner has passed the current lesson's verify and signals they're ready to move on ("next", "let's start lesson N+1", "continue", "ready"):

1. **Record completion (server-side).** Call `submit_verify_output({ lesson_id: "<current-slug>", output: "<the verify stdout you captured>" })`. On a pass it returns `{ complete: true, nextLesson, ... }`. On `VERIFY_NO_MATCH`, surface the `reason`, have the learner fix and re-run verify — do NOT advance.

2. **Bring the next lesson's files into the clone (local).** Call `workshop_advance({ to: "<nextLesson>", reason: "Starting lesson <N+1>" })`. This carries the learner's `src/` forward AND pulls in the next lesson's scaffold (its test files). This is mandatory: WITHOUT it the next lesson's files do not exist in the learner's working tree and they cannot proceed. Never skip it, and never `git checkout` a tag yourself instead.

3. **Start the next lesson.** Call `start_lesson({ lesson_id: "<nextLesson>" })`, then load that lesson's coach skill (`.claude/skills/<workshopShort>-<nextLesson>.md`) and drive it.

The MCP server tracks *logical* progress; `workshop_advance` moves the learner's *files*. Both are required on every transition.

## Source paths (for the learner's editor)

- Lesson code lives in `src/` at the repo root.
- Tests are in `src/*.test.ts` — SHIPPED, IMMUTABLE. Do not author or edit them.

## What To Say Next

- To begin: `Say: let's start lesson 1`
- Between lessons: `Say: let's start lesson <N+1>`
- To explore: `Say: break down that code`
