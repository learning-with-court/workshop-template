---
description: Lazy-loaded walker coaching — detection-based fast-forward (setup-skip helpers). Read on demand from _walker-base.md; not invoked directly.
user-invocable: false
---

# Detection-based fast-forward

Walkers MAY shell-check for installed components and environment variables
to skip setup steps a learner has already handled. When detection finds a
satisfied requirement, **render one confirmation line and proceed** — do
not re-explain the setup.

**Canonical detection helpers** (each run as its own Bash call):

| Helper | Command | Satisfied when |
|---|---|---|
| Anthropic API key | `grep -q '^ANTHROPIC_API_KEY=' .env && echo "present" \|\| echo "missing"` | stdout is `present` |
| Anthropic API key (via CLI) | `lwc env has ANTHROPIC_API_KEY 2>/dev/null \|\| true` | non-empty / truthy stdout |
| Claude Code | `which claude 2>/dev/null \|\| true` | non-empty stdout |
| Workshop directory | `test -f workshop.yaml 2>/dev/null \|\| true` | exit 0 (from install path) |
| Clerk auth | `lwc auth whoami 2>/dev/null \|\| true` | non-empty stdout |

> **Resilience rule:** Detection probes that may return "not found" as a
> normal outcome MUST be guarded with `2>/dev/null || true` (or equivalent)
> so non-zero exit codes never cancel sibling tool calls in a parallel
> batch. The walker inspects **stdout** to determine satisfaction — never
> the exit code.

One-line confirmation when a check passes:
> ✓ `ANTHROPIC_API_KEY` is set. Moving on.

**Hard constraints:**

- **Walkers MUST NOT invoke commands that print secret values to stdout.**
  Use presence checks only — file-level grep on `.env` (emits
  "present"/"missing", never the value), or `lwc env has <NAME>` /
  `lwc env list` for a names-only / boolean presence answer. There is NO
  agent-visible command that prints a secret's value; even with
  `2>/dev/null`, piping a secret value into the agent's tool surface counts
  as a leak.
- Walkers MUST NOT auto-run lesson `verify` on the learner's behalf.
  Detection collapses *setup* steps only; lesson pacing stays
  learner-driven (see **Learner-driven rule** in `_walker-base.md`).
- Walkers MUST NOT use time-based heuristics to gate progress.
- Detection reads state only — no auto-install of missing components. If a
  check fails, guide the learner to install/configure normally.
