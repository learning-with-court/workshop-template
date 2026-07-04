---
id: base-v13-walker-src-fix
name: Promote the repo-root src/ walker fix into the base + re-sync the family
type: Bug
priority: P1
effort: Small
impact: High
created: 2026-07-03
---

# Promote the repo-root src/ walker fix into the base + re-sync the family

## Problem Statement

PR #37 (`fix(walker): point editable-source ref at repo-root src/ (not lesson dir)`)
corrected the walker base skill so it points learners at the editable source at the
**repo root** (`src/` / `tests/`) instead of the stale compose-era
`workshop/lesson_<slug>/src/` path. That fix was applied **only in the member repos**
(workshop-evals, workshop-mcp, workshop-sql-intro) — it was **never promoted into the
base**. `base/.claude/skills/_walker-base.md` still carries the stale
`workshop/lesson_<slug>/src/` path in **base-v10, v11, v12, and the in-progress v13**
(template `dev`, line 121).

Two consequences:

1. **cca regressed.** By upgrading to base-v12, `workshop-cca` *adopted the stale path* —
   its walker base skill now tells learners to look under the old lesson-dir path. This is
   a live content bug in the six CCA workshops.
2. **`validate-base` is red on the three standalone repos.** evals/mcp/sql-intro carry the
   *correct* (fixed) walker content on top of a base-v10 lock that records the *stale*
   hash, so the drift check fails. Their content PRs were admin-merged (2026-07-03) over
   this pre-existing, structural failure because the content pass was orthogonal — but the
   base is still unreconciled.

## Fix

1. Fold the repo-root `src/` fix into `base/.claude/skills/_walker-base.md` in the template
   (the stale `workshop/lesson_<slug>/src/` → repo-root `src/` / `tests/` wording from #37).
2. Cut **base-v13** with the fix included.
3. `sync-base` **every member** to base-v13 — this simultaneously **undoes cca's regression**
   and **clears the drift** on evals/mcp/sql-intro (their walker content will then match a
   base lock that records the fixed hash), turning `validate-base` green everywhere.

## Notes

- The three standalone members' `_walker-base.md` files currently differ from one another
  (each drifted independently), so promotion needs a **single canonical** walker text — take
  the fixed repo-root-`src/` wording as the source of truth and reconcile any other
  per-repo divergence during the promotion.
- Surfaced 2026-07-03 during the site-facing workshop-content pass, when the content PRs'
  `validate-base` checks exposed the un-promoted fix. Related: the compose-served-layout
  migration that moved editable source to the repo root.
