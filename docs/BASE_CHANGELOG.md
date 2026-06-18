# Shared base changelog

The shared base is the set of files in `base.manifest`, synced into Code
workshops by `scripts/sync-base.ts` (workspace) and pinned per-member in
`base.lock`.

## base-v3 — 2026-06-15
Two polish changes to the shared base.

- **Toned down the help nudge** in the canonical `_walker-base.md`. The old
  rule mandated ending EVERY lesson opening with one verbatim line (`Not
  sure where to start? Just say so — asking is how this works.`), which read
  as a rote tic on a real walk — identical every lesson. The rule is now a
  **starting-point nudge offered only where it genuinely helps** (the first
  lesson or two, when a learner hesitates, at a tricky step), phrased
  **varied and naturally — never the same sentence twice**, with 3–4
  illustrative (not scripted) phrasings the guide varies. The coaching move
  (treat "help"/"I'm stuck" as first-class; walk into the FIRST concrete
  step; never imply they should've known; two flounders → offer proactively)
  is kept intact. `docs/WORKSHOP_SPEC.md` §20/§21 updated to match.
- **Scaffolder verify import bug:** investigated whether the base scaffolder
  (`scripts/new-lesson.ts`) or lesson template (`workshop/lesson_example/`)
  generates a verify that does a raw `await import(<filesystem-path>)`
  (fragile in ESM). **It does not** — the template `verify.ts` is a static
  console scaffold and the only `await import` in the tree is a
  commented-out relative-specifier example. No base change made here; any
  raw-import bug lives in a member's existing lessons, handled separately.

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
