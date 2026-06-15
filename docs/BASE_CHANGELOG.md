# Shared base changelog

The shared base is the set of files in `base.manifest`, synced into Code
workshops by `scripts/sync-base.ts` (workspace) and pinned per-member in
`base.lock`.

## base-v1 — 2026-06-14
- Initial foundation. Verbatim chassis set — the three files confirmed
  byte-identical across the Code family: `.feature-workflow.yml`,
  `tsconfig.base.json`, `scripts/tsconfig.json`. Plus the two
  template-authored canonical files that carry the drift check itself:
  `scripts/validate-base.mjs` and `.github/workflows/validate-base.yml`.
  Candidates that weren't byte-identical (pnpm-workspace, lefthook, the
  other shared `scripts/*.ts`, WORKSHOP_WALKTHROUGH) were deferred. No
  pedagogy (L0) or mixed-file (L1) content yet — those land in
  base-v2 / base-v3.
