---
id: cca-base-affordances
epic: cca-walkthrough-polish
state: active
type: feature
---

# Plan — cca-base-affordances

Template-base chassis affordances. All new files are base-owned and registered
in `base.manifest` `verbatim[]` so `sync-base` propagates them to members.

## Served-layout facts (verified)

- `base/**` → served repo root (compose step 1). So `base/scripts/try.ts` lands
  at served `scripts/try.ts`; `base/.claude/skills/primers/tool_use.md` lands at
  `.claude/skills/primers/tool_use.md`.
- `lesson.yaml` is served on disk for EVERY lesson at
  `.workshop/<ws>/lesson_<slug>/lesson.yaml`.
- Per-lesson fixtures serve at `.workshop/<ws>/lesson_<slug>/fixtures/**`.
- Deliverable code is at repo-root `src/`.
- Active workshop marker: `<repoRoot>/.workshop/active` (workshop id).
- Current lesson: `.git/lwc/pinned-tag-<workshopId>` holds `<short>/<ws>/<slug>`;
  the last segment is the lesson slug. Fallback: first lesson in `workshop.yaml`.
- `try.ts` is a plain Node/tsx process → it CANNOT call MCP `where_am_i`; it
  resolves the active lesson from local on-disk state (the same markers the CLI's
  `lwc feedback` reads). "via lwc" in the notes = the lwc-written local state.

## `try:` schema (lesson.yaml, optional)

```yaml
try:
  # the deliverable module under src/ (no extension), and the named export to call
  module: review        # → src/review.ts
  export: reviewWithCritic
  # fixture fed to the export as its first arg (JSON parsed); path is relative to
  # the lesson dir's served root (.workshop/<ws>/lesson_<slug>/)
  fixture: fixtures/sample-diff.json
  # optional: how to pass the fixture — "json" (parsed object, default) | "text" (raw string)
  fixtureAs: json
```

Optional. Only lessons with a live single-call demo declare it. The per-lesson
`try:` values for CCA lessons are authored in the `workshop-cca` child, not here.

## Files

### New
- `base/scripts/try.ts` — the runner.
- `base/.claude/skills/primers/tool_use.md` — first primer.
- `scripts/try.test.ts` — unit tests for the pure resolution logic.

### Modified
- `scripts/lint-manifest.ts` — add optional `try` block to the `Lesson` zod schema.
- `base/package.json` — `"try": "tsx scripts/try.ts"` script + `tsx` devDep so
  `pnpm try` resolves in the served tree.
- `workshops/example/lessons/01-example/lesson.yaml` — add a documented `try:`
  block + a matching fixture + an export the runner can call.
- `workshops/example/lessons/01-example/fixtures/try-input.json` — example fixture.
- `base/.claude/skills/_walker-base.md` — primer-pointer convention (new section,
  mirrors the existing lazy-load pointer style).
- `base.manifest` — add the two new base files; bump version base-v11 → base-v12.
- `docs/BASE_CHANGELOG.md` — base-v12 entry.

## Runner design (`base/scripts/try.ts`)

Pure, testable helpers (exported) + a thin `main()`:

1. `resolveActiveWorkshop(repoRoot)` → `{ workshopId, wsDir }` from
   `.workshop/active` + scanning `.workshop/<dir>/workshop.yaml`. If only one
   `.workshop/<dir>/` exists, use it.
2. `resolveCurrentLesson(repoRoot, wsDir, workshopId)` → slug, from the pinned-tag
   marker's last segment, else the first lesson in `<wsDir>/workshop.yaml`.
3. `loadTryDecl(wsDir, slug)` → parse `.workshop/<ws>/lesson_<slug>/lesson.yaml`,
   return its `try:` block (or null → friendly "this lesson has no `pnpm try`
   demo; use `run verify`").
4. `runTry(repoRoot, wsDir, slug, decl)` → dynamic `import()` of
   `repoRoot/src/<module>.ts` (tsx resolves TS), read+parse the fixture, call the
   export, print the result (JSON.stringify with indent; strings printed raw).
   Errors print a clean message, exit 1.

`main()` wires real `process.cwd()` repoRoot + the steps; everything above is
side-effect-free given explicit args so tests inject a temp dir tree.

## Tests (`scripts/try.test.ts`, no model calls)

- `resolveActiveWorkshop`: single-dir auto-detect; multi-dir via `.workshop/active`.
- `resolveCurrentLesson`: pinned-tag marker last-segment; fallback to first lesson;
  malformed marker.
- `loadTryDecl`: present block parsed; absent block → null; lesson.yaml missing.
- (Optional integration) `runTry` against a tiny temp tree with a real export +
  fixture, asserting the printed result — pure JS, no network.

## Ownership: `/clear` DEFERRED

`workshop-orchestrator` is in `base/` but NOT in `base.manifest` → it is a fork
seed, not synced. The `/clear` workshop-boundary change is deferred to
`workshop-cca:cca-content-polish` (CCA owns its filled-in orchestrator).

## Validation gate
`pnpm lint-manifest`, `node scripts/validate-base.mjs` (member-side; here we run
the template's `validate-base` test), `pnpm typecheck` (scripts), `pnpm test:scripts`
all green. Documented `LEFTHOOK_EXCLUDE=` only for worktree-deps phantom failures.
