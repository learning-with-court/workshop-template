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

## We teach by example — model real best practice

Workshops teach good engineering, so our scaffolding and our fixes must *be* good
engineering: the solution a competent engineer would reach for in a real project,
not a workshop-only contrivance. **If we wouldn't ship it in a production
codebase, we don't ship it to a learner.** Two consequences run through the rest
of this document:

- **We use real, current tools the way real projects use them** (see "Canonical
  toolchain" below), so a learner's muscle memory transfers straight out of the
  workshop.
- **We fix friction the way a real project would.** A program loads its own
  `.env` because real programs do; we rejected a bespoke `lwc run` wrapper because
  real projects don't add a `run` indirection. The fix and the lesson are the same
  thing — when we solve a problem in the scaffolding, we're also demonstrating the
  practice we want the learner to adopt.

When you hit friction, ask "what would a good engineer do in a real repo?" before
"what's the quickest workshop patch?" — they should be the same answer.

## Canonical toolchain (what we build with)

Standardize on this stack so each workshop doesn't reinvent one. **Default to
these; deviate only with a reason recorded in the workshop's own docs.** They're
chosen because they're current best-practice and what we'd use in a real project
(per the principle above).

| Concern | Tool | How it's used |
|---|---|---|
| JS/TS packages + workspaces | **pnpm** | lockfile committed; `pnpm exec <bin>` resolves project-local tools (no global installs) |
| Run TypeScript | **tsx** | run `.ts` directly, no build step; always via `pnpm exec tsx` |
| Default code-workshop language | **TypeScript** on **Node 22+** | Node 22 built-ins available (e.g. `process.loadEnvFile`) |
| Python env + deps + runner | **uv** | `uv run <file>.py`; uv owns the venv + lockfile (don't hand-manage `venv/`) |
| Anthropic API | official **SDK** (`@anthropic-ai/sdk`, or `anthropic` for Python) | not raw HTTP |

New concern or runtime → add a row here as part of the workshop that introduces
it, rather than making an ad-hoc choice in that repo.

## Runnable artifacts: a direct run must just work

When a workshop has the learner build something runnable (a CLI, a script, a
server — in whatever language), the bar is: **the learner can run what they
built, first try, with the exact command the lesson showed them, with no
out-of-band setup.** A command in a README/walker that doesn't actually run is a
bug. This is runtime-agnostic; three rules make it true:

1. **The program loads its own config/secrets.** At its entry point, the program
   reads its `.env` / config so running it *directly* behaves the same as running
   it through verify or any harness. Never depend on the harness, a wrapper, or a
   pre-set shell variable to inject the API key — a real program loads its own
   config, and teaching that is part of the lesson.
2. **Run commands invoke the project's pinned toolchain, not a global binary.**
   The documented command must resolve the interpreter/runner *and* dependencies
   from the project (lockfile / virtualenv / `node_modules`), because a learner's
   bare shell won't have your tools installed globally.
3. **Docs show the real command.** Every run-line in a README, walker skill, or a
   learner-authored config file (`CLAUDE.md`, etc.) is copy-paste-runnable — the
   working form, never an aspirational or simplified one. Walkers run the
   documented command verbatim; if it's wrong, the walker rediscovers it live.

**Solve it in the artifact and the command — not a layer between them.** No
bespoke run-wrapper, no `package.json`/Makefile run-scripts that hide the real
invocation, no magic env flags. (We rejected an `lwc run` wrapper and per-project
run-scripts for exactly this reason: we control the toolchain, so the fix belongs
in the file and the run-line. Teach the process; don't paper over it.)

### Per-runtime instantiation

| Runtime | Rule 1 — load own config | Rule 2 — run command |
|---|---|---|
| **TypeScript / Node** (current code workshops) | `try { process.loadEnvFile(".env"); } catch {}` as the first line inside the CLI-entry guard (Node 22 built-in, zero deps; `try/catch` tolerates a missing file when the key is in the shell). The guard is false on `import()`, so a verify that imports the module never triggers it. | `pnpm exec tsx src/<file>.ts <args>` — `pnpm exec` resolves `tsx` from `node_modules/.bin`; bare `tsx` only works if installed globally. |
| **Python** (illustrative — no Python workshop yet) | `load_dotenv()` (python-dotenv) at module entry, or read the env explicitly, guarded by an `if __name__ == "__main__":` so an importer doesn't trigger it. | `uv run <file>.py <args>` or `venv/bin/python <file>.py <args>` — resolves the interpreter + deps from the project env, never a bare `python` that may miss deps. |

New runtimes follow the same two rules; add a row when a workshop introduces one.

**Applying it in a chain-suite repo (CCA):** the runnable source is varying.
Files that are **stable once built** (e.g. `review.ts`, `batch.ts`) take a single
sticky chain-edit overlay. Files that **evolve across lessons** (e.g.
`agent/orchestrator.ts`) need the change at the position they first appear *and*
an overlay at each later position they change — the overlay tool is whole-file +
sticky, not a line-patch, so freezing one version clobbers the evolution. Apply
these during that workshop's own end-to-end walk, where the per-position content
is verified, not as a blind bulk re-cut. **Independent repos:** edit in place.

## Authoring scripts

`scripts/new-lesson.ts`, `scripts/rename-lesson.ts`, and
`scripts/sync-workshop-yaml.ts` scaffold and maintain lessons in the slug
scheme (`lesson_<slug>` dirs, string ids, `lesson-<slug>.md` walkers). They
take a slug argument, never a number.
