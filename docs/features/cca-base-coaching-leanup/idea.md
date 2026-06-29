---
id: cca-base-coaching-leanup
epic: cca-walkthrough-polish
state: active
type: chore
---

# cca-base-coaching-leanup (template side)

Lean up the shared always-loaded coaching chassis (`base/.claude/skills/_walker-base.md`)
from the CCA Claude Code walkthrough notes
(`docs/2026-06-28-cca-cc-walkthrough-notes.md`, notes #12, #4, #8).

This is the **template-side ONLY** slice. The CCA-specific `_walker-supplement.md`
does NOT exist in `workshop-template` (it lives only in `workshop-cca/base/`), so all
supplement-resident work (plan-mode cluster, stuck-fallback, state-check-on-entry,
@-tag coaching, comparison-tables, supplement dedupe-removal, supplement fenced
convention) is OUT OF SCOPE here and handled in the `workshop-cca:cca-content-polish`
child.

## In scope (all in `base/.claude/skills/`)

1. **Anti-false-credit guardrail (#12)** — add a universal pedagogy rule to
   `_walker-base.md`: only credit the learner with a skill they ACTUALLY performed;
   if they delegate/punt, acknowledge that honestly — never narrate the skill as done.
   (Model Y: learner prompts, Claude writes; credit their *direction*, not hand-work
   they didn't do.)

2. **Base-resident lazy-loads (#8b)** — move the two sometimes-needed sections that
   live in `_walker-base.md` into separate on-demand files, each replaced with a 1–2
   line pointer (exact path + when to Read):
   - "Detection-based fast-forward" → `base/.claude/skills/_walker-detection.md`
   - "HARD vs SOFT gates" → `base/.claude/skills/_walker-gates.md`
   Register both new files in `base.manifest` `verbatim[]` so they sync to members.

3. **Dedupe (#3) — KEEP** the canonical "Narrating real test output (advisory)" in
   `_walker-base.md` as-is. (The supplement's duplicate is removed later in
   `workshop-cca`, pointing back here.)

4. **Fenced-prompt convention (#4)** — `_walker-base.md`'s offered-prompt guidance gets
   a one-line note that offered prompts render as fenced code blocks (consistent with
   rule #1's verbatim-output convention). The full offered-prompts convention lives in
   the supplement → handled in `workshop-cca`.

## Keep CORE always-loaded (do NOT lazy-load)

Learner-driven rule, the seven-rules visible-walkthrough contract, read-state-silently,
under-specified→ASK, README-is-source-of-truth, verify-is-diagnostic,
give-the-requirement-not-the-implementation, "Narrating real test output".

## Validation

Every pointer references a file that exists; every moved file is non-empty; no dangling
references to moved-away headings; new base files registered in `base.manifest`;
report before/after `_walker-base.md` line count.
