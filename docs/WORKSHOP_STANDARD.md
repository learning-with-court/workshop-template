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

## Authoring scripts

`scripts/new-lesson.ts`, `scripts/rename-lesson.ts`, and
`scripts/sync-workshop-yaml.ts` scaffold and maintain lessons in the slug
scheme (`lesson_<slug>` dirs, string ids, `lesson-<slug>.md` walkers). They
take a slug argument, never a number.
