---
description: Claude Code specifics for the walker contract — the structured-choice tool, recovery affordances, and process lifetime. Not invoked directly; the orchestrator Reads exactly one _walker-surface-*.md at ENTER.
user-invocable: false
---

# Surface — Claude Code

`_walker-base.md` names capabilities, never products. This file supplies the
Claude Code specifics for them. Read this file, not the Cursor one, when
`CLAUDECODE` is set in the environment.

## The structured-choice tool

**`AskUserQuestion`.** Call it directly as a tool invocation. Do NOT search for
it first — searching MCP (`GetMcpTools`, `list_tools`), globbing the filesystem,
or grepping for the name will conclude it is missing, and that conclusion is
wrong. Only fall back if the *call itself* errors with tool-not-found.

Fallback, if and only if the invocation errors: a **numbered** list in the
message, so the learner can reply with a single digit. Do not announce the
fallback or narrate the failed tool call.

## Recovery affordances

`/mcp` exists on this surface and can reconnect or restart an MCP server. Even
so, **never hand the learner an environment-specific recovery instruction** —
see the bridge-wedged rule in the orchestrator. Degrade by handing them the
wheel and confirming through the workshop state file and the lesson verify.

## Process lifetime

A backgrounded process started from a tool call survives after the call
returns. The CLI still owns server lifecycle; do not hand-roll launches.
