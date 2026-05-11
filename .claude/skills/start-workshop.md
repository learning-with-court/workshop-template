---
name: start-workshop
description: TODO — Confirms this workshop's toolchain (Node 22+, pnpm 9+, repo root, deps) and routes the user into Lesson 1, with an edge case to hand off to where-am-i if the user explicitly says they're resuming and don't know where they left off. Use when the user says "start the workshop", "begin the workshop", "let's start the workshop", "let's begin", "I want to do the workshop", "begin", "ready to start", "kick off the workshop", or seems to be at the entry point with nothing started yet.
---

# Start Workshop

> **Claude reads this file directly via Read.** Don't tell the agent to
> "invoke this skill" or "use the Skill tool" anywhere in this file.

You are helping the user begin the **TODO: workshop name**. This is the first skill they run after installing the workshop.

This skill has its own shape: a toolchain check, then a hand-off to Lesson 1. The workshop is sequential — every learner starts at Lesson 1. Phase-specific prereq checks (auth secrets, AWS profile, etc.) happen at the lesson boundary that introduces those phases, not here.

## What to do

1. **Confirm we're in the workshop repo.** Read `package.json` at the repo root and check that `name === "TODO: replace with your workshop's monorepo package name (e.g. claude-code-mcp-workshop-monorepo)"`. If not, tell the user to `cd` into the cloned repo and stop.

2. **Confirm Node 22+ via the Bash tool.** Announce the command in plain text first, e.g.:

   > I'm going to run: `node --version`

   Then call the Bash tool with `node --version` and quote the full stdout verbatim in a fenced code block. If it's below v22, point them at https://nodejs.org/ and stop.

3. **Confirm pnpm is installed via the Bash tool.** Announce first:

   > I'm going to run: `pnpm --version`

   Then call Bash with `pnpm --version` and quote stdout verbatim. If pnpm is missing, recommend `corepack enable && corepack prepare pnpm@9.12.0 --activate`.

4. **Install dependencies if needed.** Check whether `node_modules/` exists at the repo root. If it's missing, announce and run via the Bash tool:

   > I'm going to run: `pnpm install`

   Then call Bash with `pnpm install` and quote the full stdout verbatim.

5. **TODO: Sanity-check the install scope.** If this workshop ships as a Claude Code plugin, check that the plugin is installed at *repo scope* (local: `.claude/settings.local.json`, or project: `.claude/settings.json`) so the lesson skills only fire while the user is in this directory. Delete this step if your workshop is installed via the `lwc` CLI (which always installs at project scope).

6. **Hand off to Lesson 1.** Tell the user the toolchain is ready. End with the literal next-step phrase:

   > **Say `let's start lesson 1`** to begin.

   **Edge case for resume.** If the user's incoming message explicitly says they're resuming and don't know which lesson they left off on (e.g. "I'm picking up where I left off but I forget which lesson"), end with `**Say `where am I`**` instead — assuming your workshop ships a `where-am-i` skill that inspects git history and the workshop directory. If your workshop doesn't ship `where-am-i`, just tell the user to pick a lesson explicitly. If the user says "resume lesson 5" or names a specific lesson, just point them at that lesson directly: `**Say `let's start lesson 5`**` (substituting their lesson number).

## Style

- Be brief. Don't lecture.
- Don't print env values or secrets back; they may contain credentials.
- If the user wants to know what the workshop covers, point them at `README.md` rather than narrating.
- Always end with the exact next thing to say.

## What To Say Next

Always end your response with one of these — pick by what just happened in the conversation:

- After confirming repo + Node + pnpm and `node_modules/` exists, and the user is starting fresh: `**Say `let's start lesson 1`**` to begin.
- After the user names a specific lesson to resume (e.g. "I'm picking up at lesson 5"): `**Say `let's start lesson 5`**` (substitute the lesson number).
- After the user says they're resuming but doesn't know which lesson: `**Say `where am I`**` (only if your workshop ships that skill).
- If `package.json` `name` is wrong or Node is below v22: don't hand off; tell the user to fix the toolchain and stop.
