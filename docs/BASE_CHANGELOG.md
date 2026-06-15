# Shared base changelog

The shared base is the set of files in `base.manifest`, synced into Code
workshops by `scripts/sync-base.ts` (workspace) and pinned per-member in
`base.lock`.

## base-v2 — 2026-06-14
The **L0 pedagogy skill** joins the shared base: the canonical, workshop-
agnostic `_walker-base.md`.

- **New verbatim member:** `.claude/skills/_walker-base.md` — the single
  source of truth for shared pedagogy conventions (lesson-opening structure,
  the asking-for-help close, the seven-rule visible-walkthrough contract,
  read-state-silently, secret-safe detection fast-forward, HARD/SOFT gates,
  verify-is-diagnostic-not-graded, don't-quiz, style + language rules).
- **`user-invocable: false`** — new frontmatter key marking it as a
  reference layer, not a triggerable Skill. It is invoked by the
  orchestrator at lesson ENTER (`Read .claude/skills/_walker-base.md` once
  before loading the lesson walker), NOT hook-injected.
- **Detection is secret-safe:** the API-key fast-forward uses presence
  checks (`grep '^ANTHROPIC_API_KEY=' .env`, `lwc env has`), never any
  command that prints a secret value to the agent's tool surface.
- Workshop-specific pedagogy stays in each workshop's own supplement; the
  L0 body is agnostic so it syncs verbatim to every Code workshop.

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
skill lands in base-v2 (below).
