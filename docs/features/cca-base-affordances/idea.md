---
id: cca-base-affordances
epic: cca-walkthrough-polish
state: active
type: feature
---

# cca-base-affordances (template side)

The SHARED chassis affordances from the CCA Claude Code walkthrough notes
(`docs/2026-06-28-cca-cc-walkthrough-notes.md`, notes #11, #8, #6; token doc
`docs/2026-06-28-cca-token-optimization.md`). Template-base slice of the
`cca-walkthrough-polish` epic. Sibling children own the prose sweep
(`workshop-cca:cca-content-polish`), block-edits (#40, merged), and the
coaching lean-up (#41, merged).

## In scope (template-shared chassis)

1. **`scripts/try.ts` — lesson-aware fixture runner (#11).** A shipped script
   that resolves the active lesson (lwc `where_am_i`, with a local on-disk
   fallback), looks up that lesson's `try:` declaration in its served
   `lesson.yaml`, dynamically imports the deliverable export from `src/`, runs
   it on the declared fixture, and prints the result. In-project (served at
   repo-root `scripts/try.ts`) so `type: module` applies — no ESM/CJS
   breakage. Invoked uniformly via `pnpm try`. Generic / workshop-agnostic.

2. **`try:` field in the `lesson.yaml` schema (#11).** Optional per-lesson
   block declaring the export to call + the fixture to feed (`targetFiles`
   gives the file, not the callable/input). Documented in the example lesson
   (`workshops/example/lessons/01-example/lesson.yaml`) and validated in the
   `lint-manifest.ts` `Lesson` zod schema.

3. **Primers library (#8a).** A shared, base-owned on-demand primers dir
   (`base/.claude/skills/primers/`) + the first primer `tool_use.md` (plain,
   ground-up `tool_use` / structured-output explanation). Lessons carry a
   ~2-line pointer; the guide `Read`s the primer on cue/struggle (NOT
   preloaded). A brief base convention in `_walker-base.md` describes the
   primer-pointer pattern (mirrors the existing lazy-load pointer style).

## Ownership decision: `/clear` is DEFERRED to workshop-cca

Scope item 4 (`/clear` at workshop boundaries) is **deferred to
`workshop-cca:cca-content-polish`.** Ownership check: the
`workshop-orchestrator` skill exists under `base/.claude/skills/` but is NOT
listed in `base.manifest` `verbatim[]`, so `sync-base` does NOT propagate it
to members. The base copy is a `TODO:`-placeholder fork seed
(`new-lesson`/`build-workshop` fill it in per-workshop); each member owns its
filled-in orchestrator after forking. Editing the base seed here would not
reach existing members. The advancement-protocol prose CCA actually runs lives
in CCA's own orchestrator → the `/clear` change belongs there.

## Manifest + version

Register every new base file in `base.manifest` `verbatim[]`
(`base/scripts/try.ts`, `base/.claude/skills/primers/tool_use.md`). Bump
base-v11 → base-v12 + a `docs/BASE_CHANGELOG.md` entry.

## Validation

- `scripts/try.test.ts` covers the pure resolution logic (active-lesson →
  `try:` lookup → import/fixture target), no live model calls.
- lint-manifest accepts a lesson with and without `try:`.
- validate-base + lint-manifest + typecheck + tests green.
