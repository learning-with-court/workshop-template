---
name: start-workshop
description: TODO — Confirms this workshop's toolchain (Node 22+, pnpm) and routes the user into Lesson 1. Use when the user says "start the workshop", "begin", "let's start", "kick off the workshop", or seems to be at the entry point with nothing started yet.
---

# Start Workshop

> **Claude reads this file directly via Read.** Don't tell the agent to
> "invoke this skill" or "use the Skill tool" anywhere in this file.

You are helping the user begin the **TODO: workshop name**. This is the first skill they run after installing the workshop.

## What to do

1. **Confirm Node 22+** via Bash: announce `I'm going to run: \`node --version\``, run it, quote stdout verbatim. If below v22, point to https://nodejs.org/ and stop.

2. **Confirm pnpm** via Bash: announce `I'm going to run: \`pnpm --version\``, run it, quote stdout. If missing, recommend `corepack enable && corepack prepare pnpm@10 --activate`.

3. **Install dependencies if needed.** If `node_modules/` is absent, announce and run `pnpm install`, quote full stdout.

4. **Hand off to Lesson 1.** Tell the user the toolchain is ready. End with:

   > **Say `let's start lesson 1`** to begin.

## Style

- Brief. Don't lecture.
- Always end with the exact next thing to say.
