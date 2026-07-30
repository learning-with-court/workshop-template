---
description: Cursor specifics for the walker contract — the structured-choice tool, recovery affordances, and process lifetime. Not invoked directly; the orchestrator Reads exactly one _walker-surface-*.md at ENTER.
user-invocable: false
---

# Surface — Cursor

`_walker-base.md` names capabilities, never products. This file supplies the
Cursor specifics for them. Read this file, not the Claude Code one, when
`CLAUDECODE` is NOT set in the environment.

## The structured-choice tool

**`AskQuestion`** — a native Cursor tool, **not** an MCP tool. It renders the
"Clarifying Questions" selector (arrow keys / Space / Enter). Call it directly
as a tool invocation.

**Known false-negative:** searching MCP (`GetMcpTools`, `list_tools`), globbing
`**/AskQuestion*`, or grepping the filesystem will conclude the tool is
missing. That search is wrong. Only fall back if the *call itself* errors with
tool-not-found / unknown tool.

Fallback, if and only if the invocation errors: a **numbered** list in the
message, so the learner can reply with a single digit. Do not announce the
fallback or narrate the failed tool call.

## Recovery affordances

There is no `/mcp` equivalent to hand the learner. Never invent one. Degrade by
handing them the wheel and confirming through the workshop state file and the
lesson verify.

## Reconnecting a restarted MCP server

If a workshop restarts an MCP server process (or the service it talks to),
this client keeps holding the dead handle — the new process can be perfectly
healthy while this session's tool calls hang. The reconnect gesture here is to
toggle the server off and back on in MCP settings, or reload the window. Then
confirm with the cheapest read the server offers before relying on it again.

## Process lifetime

A backgrounded process started from a tool call may be killed with the tool's
process group after the call returns — sometimes minutes later, and sometimes
only partially, leaving a process alive with no listening socket. Long-lived
servers must be started detached. The CLI owns that; do not hand-roll launches.
