# Workshop manifest standard

The canonical schema every learning-with-court workshop repo follows. This is
the contract enforced by `scripts/lint-manifest.ts` and the shared base
mechanism (`base.manifest` + `scripts/validate-base.mjs`). The platform manifest
fetcher (`platform/packages/server/src/manifest/schema.ts`) is the upstream
source of truth; the linter vendors a copy of that schema. Keep them in sync.

## Lesson identity is a slug

Every lesson is identified by a **slug** — a short, human-readable,
kebab-case string. The slug is the single identity that ties together the
lesson directory, the `lesson.yaml` `id`, the `workshop.yaml` phase reference,
prerequisite lists, and the walker skill filename. There is **no separate
numeric lesson number**. Ordering comes from the position of the slug in
`workshop.yaml` `phases[].lessons[]`, not from a number baked into the id.

### Slug regex

```
^[a-z][a-z0-9-]*$    (with .min(1))
```

Lowercase letter first, then lowercase letters / digits / single hyphens.
No leading digit, no underscores, no uppercase. Examples: `setup`,
`group-by`, `aws-deploy`, `inner-join`, `capstone`.

### Where the slug appears (all must agree)

| Surface | Form | Example |
|---|---|---|
| Lesson directory | `workshop/lesson_<slug>/` | `workshop/lesson_group-by/` |
| `lesson.yaml` `id` | the bare slug (string) | `id: group-by` |
| `workshop.yaml` phase ref | the bare slug | `lessons: [group-by]` |
| `prerequisites` (lesson.yaml) | slug list | `prerequisites: [aggregates]` |
| `onPass.advanceTo` (optional) | a slug | `advanceTo: having` |
| Walker skill | `.claude/skills/lesson-<slug>.md` | `.claude/skills/lesson-group-by.md` |
| Package name | `@workshop/lesson-<slug>` | `@workshop/lesson-group-by` |

The directory is `lesson_<slug>` — only the `lesson_` prefix is added; the
slug keeps its hyphen form inside the directory name (no underscore
substitution). `lessonDirForKey(key)` in the linter is exactly
`` `lesson_${key}` ``.

## Migration: numeric scheme → slug scheme

The legacy template used a numeric scheme. The mapping, before → after:

| Concern | Before (legacy) | After (canonical) |
|---|---|---|
| Lesson dir | `lesson_01_template` | `lesson_example` |
| `lesson.yaml` `id` | `id: 1` (integer) | `id: example` (string slug) |
| `prerequisites` | `[1, 2]` (integers) | `[setup, columns]` (slugs) |
| `onPass.advanceTo` | `2` (integer) | `having` (slug, optional) |
| `workshop.yaml` phase ref | `- 01-template` | `- example` |
| Walker skill | `lesson-01.md` | `lesson-example.md` |
| Package name | `@workshop/lesson-01-template` | `@workshop/lesson-example` |

## `workshop.yaml` rules

- **`status: available` from day one.** Publication is availability — a
  workshop ships `available`, never `coming-soon`. (`coming-soon` remains a
  valid enum value for the rare deliberate-preview case, but it is not the
  default and authoring should not start there.)
- **No `subdomains:` block.** It is vestigial — it appears nowhere in
  `platform` and is not consumed by the manifest fetcher. Per-workshop
  subdomains are derived from the workshop `id` by convention
  (`<id>.workshop.institute` / `<id>-dev.workshop.institute`) and from the
  `workshops.json` registry, not from a field in `workshop.yaml`. Do not add
  it back.

## What enforces this

- **`scripts/lint-manifest.ts`** — vendored Zod schema. Validates
  `workshop.yaml` and every phase-referenced `lesson.yaml` against the slug
  schema: slug `id` / `prerequisites` / `advanceTo`, lesson dir existence,
  `targetFiles` existence, `verifyCommand` pnpm-filter resolution, walker
  skill presence (`lesson-<slug>.md`), and README H1 ↔ title match. Run with
  `pnpm lint-manifest`. This linter is shared base — the **same** file lints
  every member repo green.
- **`base.manifest` + `scripts/validate-base.mjs`** — the shared-base
  mechanism that keeps this linter (and the other base files) identical
  across all workshop repos, so the schema can't silently drift per repo.
- **`scripts/validate-scaffolding.mjs`** — enforces the Runtime scaffolding
  standard below (progress server present + pre-approved + clean hook path).
  Run with `node scripts/validate-scaffolding.mjs`.

## Runtime scaffolding (progress server)

Every workshop tracks learner progress server-side through the `lwc` CLI
acting as a stdio MCP proxy. To wire that in — and to avoid the failure mode
where the agent has no progress tools and reaches for the global Cowork lwc
connector ("these lwc tools are for Cowork mode") — every workshop must ship:

1. **A progress MCP server in `.mcp.json` at the repo root:**
   ```json
   { "mcpServers": { "lwc-<id>": { "command": "lwc" } } }
   ```
   Bare `lwc` runs the stdio MCP proxy (serving `workshop_advance` /
   `workshop_state` / `workshop_reset` / `workshop_update`), resolving the
   active workshop from the cwd. The `lwc-` name prefix also marks the project
   as a workshop so the Cowork-flow plugin skills stay silent. The template
   ships `lwc-WORKSHOP_ID`; `build-workshop` substitutes the real id.
2. **Pre-approval in committed `.claude/settings.json`:**
   ```json
   { "enabledMcpjsonServers": ["lwc-<id>"] }
   ```
   so a fresh clone never shows the MCP trust prompt for workshop
   infrastructure. (Must be the committed `settings.json`, not the gitignored
   `settings.local.json`.)
3. **A clean session-start hook** (if the workshop ships one): walker skills
   load from `.claude/skills/<lesson-walker>.md`, never
   `.workshop/<workshop>/.claude/skills/`; the hook defers the lesson opening
   to `_walker-base.md` + the per-lesson walker rather than prescribing one.

**Chain-suite repos (CCA):** `.mcp.json` is a per-position varying artifact, so
the server is seeded across the chain via a `from:"baseline"` chain-edit overlay
(see `scripts/chain-edits/README.md`), and any lesson that teaches authoring
`.mcp.json` must reframe to "add to the existing file." For independent-build
workshops it is a flat committed `.mcp.json`.

## Authoring scripts

`scripts/new-lesson.ts`, `scripts/rename-lesson.ts`, and
`scripts/sync-workshop-yaml.ts` scaffold and maintain lessons in the slug
scheme (`lesson_<slug>` dirs, string ids, `lesson-<slug>.md` walkers). They
take a slug argument, never a number.
