# Shared base changelog

The shared base is the set of files in `base.manifest`, synced into Code
workshops by `scripts/sync-base.ts` (workspace) and pinned per-member in
`base.lock`.

## base-v1 — 2026-06-14
Initial foundation: the workshop chassis + authoring toolchain, standardized
on the slug lesson scheme (see `WORKSHOP_STANDARD.md`).

- **Verbatim chassis:** `.feature-workflow.yml`, `tsconfig.base.json`,
  `scripts/tsconfig.json`.
- **Manifest linter (now canonical):** `scripts/lint-manifest.ts` — rewritten
  to the slug schema; verified to lint the template + all three Code members
  (mcp, sql-intro, evals) green. Members reclaim one canonical linter (it had
  drifted into four versions).
- **Authoring scripts (now canonical):** `scripts/new-lesson.ts`,
  `scripts/rename-lesson.ts`, `scripts/sync-workshop-yaml.ts`,
  `scripts/setup-shared.ts` — slug-scheme; members previously lacked these.
- **Drift check itself:** `scripts/validate-base.mjs` and
  `.github/workflows/validate-base.yml`.

Deliberately OUT (essential per-workshop): `pnpm-workspace.yaml` (mcp's
`shared`/`infra` globs), `lefthook.yml` (sql-intro's `lint-workshop` hooks),
`scripts/package.json` (member-specific deps), `docs/WORKSHOP_WALKTHROUGH.md`
(per-workshop customized; seed-if-absent later). The L0 pedagogy `_walker-base`
skill lands in a later base version.
