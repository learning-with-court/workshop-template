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

## Reconnecting a restarted MCP server

If a workshop restarts an MCP server process (or the service it talks to),
this client keeps holding the dead handle — the new process can be perfectly
healthy while this session's tool calls hang. The reconnect gesture here is
`/mcp`, selecting the server and reconnecting it. Then confirm with the
cheapest read the server offers before relying on it again. This is a gesture
for *you*, the guide — never hand it to the learner as an instruction.

## The lesson page

`page_*` tools, when present, drive a browser page open beside this terminal. It already shows the lesson's current step and its prompt, so with the page open the terminal carries only the conversation: a few sentences saying what is happening and what the learner does next. Don't repeat the step, its concepts or long code in the terminal; put anything worth reading on the page with `page_show_code` or `page_note`. When the page tools are absent, or `page_open` returned `opened: false`, the terminal is the only surface: say everything there, as you would with no page.

Mirror lesson state as it changes: `page_set_lesson` on lesson start, passing `slug`, the lesson's id (its folder is `lesson_<slug>`), so the page shows that lesson's Walkthrough one step at a time; after a step's commands, `page_step_result` for that step, its index the Walkthrough's numbered item counted from 0 as `page_set_step` takes it (`ran` may be empty when nothing ran); `page_set_step`, the step done and the next current, only when the learner's Next step press (the done action) arrives, since a question keeps the step where it is; `page_show_code` for anything you'd otherwise quote at length, `page_note` (kind `coach`) for a keepable aside.

For verify, call `page_show_verify` with the command string exactly as returned by `start_lesson`/`verifyCommand` — matching is exact-string, so a paraphrase falls back to a plain list instead of the check/expected/actual table — and pass `output` raw, unparsed.

A button press arrives as the learner's next prompt, typed in by the `lwc-pages` plugin, and can also show in `pending_actions` on a page tool result; the same press can arrive on both by design. Treat it as a single learner statement and act on it once — only Next step moves the lesson on, and no press is an automatic verify run.

`page_off` (with `persist: true` only on "always") turns the page off at the learner's request. If these tools are absent, or `page_open` returned `opened: false`, say nothing about the page at all.

## Process lifetime

A backgrounded process started from a tool call survives after the call
returns. The CLI still owns server lifecycle; do not hand-roll launches.
