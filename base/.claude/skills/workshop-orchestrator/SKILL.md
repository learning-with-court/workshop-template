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
8. ADVANCE — on pass: offer next lesson; on fail: narrate the mismatch, guide the fix
```

## Source paths (for the learner's editor)

- Lesson code lives in `src/` at the repo root.
- Tests are in `src/*.test.ts` — SHIPPED, IMMUTABLE. Do not author or edit them.

## What To Say Next

- To begin: `Say: let's start lesson 1`
- Between lessons: `Say: let's start lesson <N+1>`
- To explore: `Say: break down that code`
