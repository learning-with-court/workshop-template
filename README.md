# learning-with-court workshop template

This is the template repository for new workshops in the
[learning-with-court](https://workshop.institute) catalog. Fork it to start
a new workshop.

## Fork it

Either click **Use this template** at the top of the GitHub page, or:

```bash
gh repo create learning-with-court/<your-workshop-id> \
  --template learning-with-court/workshop-template \
  --private --clone

cd <your-workshop-id>
pnpm install
```

**Workshop repos stay private — forever.** Learners install via
`lwc setup <id>`, which uses the org's shared GitHub App
(`learning-with-court`) to mint a short-lived installation token,
runs `git clone` against the private remote, and strips the token off
`origin` immediately after. Plain `git pull` against the clone prompts
for credentials by design; use `lwc refresh <id>` or `/refresh-workshop`
inside Claude Code for refreshes. There is no "flip to public when
ready" step — `mcp-workshop` and `evals-workshop` have always been
private and `lwc setup` has always handled the credential flow for you.

## Fill in the template

Every file with `TODO:` markers needs your attention. Start here:

| File | What to fill in |
|---|---|
| `workshop.yaml` | id, title, tagline, summary, tags, prereqs, phases |
| `landing.md` | long-form prose for the catalog detail page |
| `workshop/lesson_example/` | rename dir to your lesson slug, fill in lesson manifest + content |
| `workshop/LESSON_TEMPLATE.md` | (reference only — don't edit) |
| `.claude/skills/lesson-example.md` | per-lesson walker skill (read directly via `Read`, NOT the `Skill` tool) |
| `.claude/skills/workshop-orchestrator.md` | shared pedagogy contract — fill in workshop-name, MCP-server-or-not |
| `.claude/skills/start-workshop.md` | entry-point skill — fill in package.json name + workshop name |
| `.claude/hooks/session-start.sh` | SessionStart greeting — fill in workshop shape, optionally enable MCP-auth + env-key detection blocks |
| `.env.example` | fill in required secret names, OR delete if your workshop uses no secrets |
| `docs/WORKSHOP_SPEC.md` | (reference — keep as-is, fill in `TODO:` placeholders only) |
| `docs/WORKSHOP_WALKTHROUGH.md` | (reference — fill in lesson sample list before your first release) |
| `README.md` | replace this file with your workshop's real README |

Find every TODO with:

```bash
grep -rn "TODO:" --include="*.md" --include="*.yaml" .
```

## Add lessons

Use the generator:

```bash
pnpm new-lesson joins-and-aggregates --phase B
```

It copies `workshop/lesson_example/` to `workshop/lesson_joins-and-aggregates/`,
rewrites `package.json` / `lesson.yaml` / `README.md` / the walker skill at
`.claude/skills/lesson-joins-and-aggregates.md`, and appends `joins-and-aggregates`
to the phase's `lessons` list in `workshop.yaml`. `--phase` defaults to `A`. The
script refuses to overwrite an existing lesson dir or walker. Lessons are
identified by slug — there is no lesson number; see `docs/WORKSHOP_STANDARD.md`.

After scaffolding, run `pnpm install` so the new workspace package is
picked up, then `grep -rn TODO:` inside the new dir + walker to find the
fields you need to fill in. See [`workshop/LESSON_TEMPLATE.md`](workshop/LESSON_TEMPLATE.md)
for the full lesson convention.

Need to rename a lesson's slug? `pnpm rename-lesson joins aggregates-and-joins` — renames the lesson slug (updates dir, lesson.yaml id, package.json, walker, workshop.yaml, and prerequisites/advanceTo in peer lessons).

### Canonical reference implementation

Each write-pedagogy lesson ships a `src/canonical.<ext>` (extension matches the
learner's target — `canonical.sql` / `canonical.ts` / `canonical.json`) holding
the authoritative reference implementation. The lesson's test suite runs
**both** the learner's target and the canonical against the same fixtures and
asserts both produce the declared `expected.json`. This catches stale fixtures,
dataset drift, and README-vs-implementation disagreement before they reach
learners. The generator carries `src/canonical.example` into every new lesson;
read-pedagogy lessons can leave the slot empty. See
[`workshop/LESSON_TEMPLATE.md`](workshop/LESSON_TEMPLATE.md#canonical-reference-implementation)
for the wiring details and the three drift modes it catches.

Walker boilerplate (visible walkthrough contract, learner-driven rule,
HARD vs SOFT gate semantics, read-the-state-silently pattern, style)
lives in [`.claude/skills/_walker-base.md`](.claude/skills/_walker-base.md).
Your per-lesson walker only needs **Pedagogical priority**, **Steps**,
**What To Say Next**, and any lesson-specific **Common debugging** tips —
link to `_walker-base.md` from the top of the walker rather than
re-stating the shared conventions.

## Shared workshop data

If two or more lessons read the same data — a sample SQLite DB, a RAG
fixture corpus, golden eval outputs — drop it under `workshop/shared/`
and provision via `pnpm setup-shared`.

```bash
pnpm setup-shared         # default: no-op (most workshops don't need this)
```

Most workshops are content-only and can ignore this slot entirely. For
data-heavy workshops, edit `scripts/setup-shared.ts` to download or
generate the seed data — keep it idempotent. See
[`workshop/shared/README.md`](workshop/shared/README.md) for the full
pattern.


## Verify locally

```bash
pnpm install              # installs lefthook hooks on postinstall
pnpm lint-manifest        # validates workshop.yaml + cross-checks fs
pnpm sync-workshop-yaml   # dry-run diff of workshop.yaml vs filesystem
pnpm sync-workshop-yaml --write   # apply the rebuild
pnpm typecheck            # every workspace package
pnpm test:scripts         # tests the manifest linter itself
```

The `manifest-lint` GitHub Action runs the same checks on every push.
Lefthook fires `lint-manifest` on pre-commit when manifests or scripts
change, and `typecheck` on every commit.

## Refresh the workshop (after fork is live)

Once your workshop is registered with the platform and learners install
via `lwc setup <id>`, the way to pick up upstream updates is:

```bash
lwc refresh <your-workshop-id>
```

…NOT `git pull` — the clone uses an un-credentialed HTTPS origin by
design, so `git pull` prompts for credentials and stalls. The CLI mints
a fresh token, runs the pull, and strips the token back off `origin`.
Inside Claude Code, `/refresh-workshop` does the same thing.

## Register with the platform

Once your workshop manifest is filled in and lessons are real:

1. Push the repo to GitHub
2. Add an entry to
   [`platform/workshops.json`](https://github.com/learning-with-court/platform/blob/main/workshops.json):
   ```json
   {
     "id": "<your-workshop-id>",
     "repo": "learning-with-court/<your-workshop-id>",
     "ref": "main",
     "envs": ["dev"]
   }
   ```
   Start dev-only. Flip to `["dev", "prod"]` when ready to ship.
3. Open a PR on the platform repo. CI deploys a `LwcWorkshop-<id>-Dev`
   stack with its own subdomain. The catalog regenerates from the manifest
   automatically.

Reference implementation:
[`learning-with-court/workshop-mcp`](https://github.com/learning-with-court/workshop-mcp).
