# Shared base changelog

The shared base is the set of files in `base.manifest`, synced into Code
workshops by `scripts/sync-base.ts` (workspace) and pinned per-member in
`base.lock`.

## base-v1 — 2026-06-14
- Initial foundation: verbatim chassis set (feature-workflow config, tsconfigs,
  pnpm-workspace, lefthook, shared `scripts/*.ts`, WORKSHOP_WALKTHROUGH),
  plus the `validate-base` drift check (`scripts/validate-base.mjs` +
  `.github/workflows/validate-base.yml`). No pedagogy (L0) or mixed-file (L1)
  content yet — those land in base-v2 / base-v3.
