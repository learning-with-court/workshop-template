# The compose model — going-forward process for LWC workshops

The compose model is how new LWC workshops are built. It replaces the git chain
as the authoring and delivery mechanism for cumulative workshops.

> **Status (2026-06-20):** validated via the greeter spike (S1, S2, S3 + delivery
> path all pass). Productionisation and CCA migration are in progress. The old
> `rebuild-chain.ts` / overlay / `from:` model is still live for the CCA monorepo
> until migrated — do not use it for new workshops.

---

## 1. What it is — and why

**Source ≠ artifact.** Under the old git chain, `main` was *both* what authors
edit *and* what the platform serves (per-lesson tags pointed into its commit
history). Editing a lesson meant rewriting history → `git push --force` on every
lesson downstream of the edit. The chain also required hand-authored overlays with
`from:` pointers to place files at the right chain position — a parallel
representation of every delta.

The compose model separates the two concerns:

- **Source branch** — a normal branch (`main`) with a readable, editable layout.
  Authors commit here with normal `git commit` / PRs. No force-push ever.
- **Generated tags** — `pnpm exec tsx scripts/compose.ts` reads the source and emits one
  tag per lesson (`<composeShort>/<slug>`). These are the delivery artifact. They
  are created/overwritten by the generator; the platform/CLI consumes them
  unchanged.

The chain's features are all preserved:

| Feature | How it's preserved |
|---|---|
| Cumulative starting trees | Generator computes Σ prior-lesson `solution/` at each position |
| DRY uniform content | Prose, scaffold, and skills are laid down identically at every tag from the live source |
| Determinism / idempotence | Fixed author/committer ident + dates → same SHAs across runs |
| Self-verify before publish | Generator checks every tree before moving any ref |
| No silent flattening | Cumulative state comes only from explicit per-lesson `solution/`; no hardcoding |

The spike (`spike-compose-workshop/`) proves this: S1 (correct cumulative tags),
S2 (edit one lesson with a normal commit → downstream tags update, source branch
append-only), and S3 (full walker smoke-walk, $3.10 / 49 turns, verification
contract fully active) all passed. See
`docs/superpowers/2026-06-20-compose-model-spike-findings.md`.

---

## 2. Source layout — what you author

```
<workshop-repo>/
  workshop.yaml              # manifest: id, composeShort, phases[].lessons (ordered slugs)
  landing.md                 # landing page prose
  base/                      # lesson-1 starting scaffold — uniform across every lesson tag
    package.json
    tsconfig.json
    vitest.config.ts
    .mcp.json
    .claude/settings.json
    .claude/hooks/block-edits.sh
    .claude/skills/_walker-base.md
    .claude/skills/workshop-orchestrator/
    src/.gitkeep             # empty src/ — the learner's canvas
  lessons/
    01-<slug>/
      lesson.yaml            # verifyCommand, verify.*, onPass, prereqs (served as prose)
      README.md              # lesson prose (served as prose)
      solution/              # canonical answer — files the learner PRODUCES this lesson
        src/<slug>.ts        # served-root-relative paths (e.g. src/hello.ts, not lessons/01-hello/src/hello.ts)
      test/                  # the immutable shipped test for this lesson
        src/<slug>.test.ts   # also served-root-relative
    02-<slug>/  …
    03-<slug>/  …
  .claude/skills/lesson-<slug>.md    # per-lesson coach skills (optional; uniform at every tag)
  scripts/compose.ts        # the generator — this is the workshop's `cut` command
```

**`solution/`** holds the files the learner will have produced by the *end* of
this lesson — cumulative, served-root-relative. The generator puts prior lessons'
solutions in downstream lesson tags; it excludes the lesson's own solution so the
learner has something to build.

**`test/`** holds the immutable shipped test for this lesson — also
served-root-relative. Tests are *sticky*: a lesson's test is present in that
lesson's tag and every subsequent one. Test files must be authored via shell
heredoc (the `block-edits` hook denies `Write`/`Edit` on `*.test.*` even to the
guide — intentional, see `VERIFICATION_CONTRACT.md`).

**`workshop.yaml` must include `composeShort`** — this is the namespace key:

```yaml
id: my-workshop
composeShort: my-ws      # tags will be my-ws/hello, my-ws/shout, etc.
                         # .workshop/<composeShort>/ is where prose lands in served trees
phases:
  - id: A
    title: "Phase title"
    lessons:
      - hello            # ordered slugs — must match lessons/<NN>-<slug> dirs
      - shout
      - config
```

---

## 3. Served-tag layout — what compose emits

For lesson N (1-indexed), tag `<composeShort>/<slug_N>` points at a tree with:

```
# UNIFORM — identical at every lesson position (from base/ + source .claude/ + source prose)
package.json  tsconfig.json  vitest.config.ts
.mcp.json  .claude/**
.workshop/<composeShort>/workshop.yaml
.workshop/<composeShort>/landing.md
.workshop/<composeShort>/lesson_hello/lesson.yaml + README.md     # ALL lessons present
.workshop/<composeShort>/lesson_shout/lesson.yaml + README.md     # at EVERY position
.workshop/<composeShort>/lesson_config/lesson.yaml + README.md

# VARYING — cumulative prior solutions only
src/hello.ts      # from lesson 1 solution/ — present at lesson 2 + 3, ABSENT at lesson 1
src/shout.ts      # from lesson 2 solution/ — present at lesson 3, ABSENT at 1 + 2

# VARYING — tests sticky from their own lesson
src/hello.test.ts   # present at lessons 1, 2, 3
src/shout.test.ts   # present at lessons 2, 3 (not 1)
src/config.test.ts  # present at lesson 3 only
```

**Greeter example in full:**

| Tag | `src/hello.ts` | `src/shout.ts` | `greeting.json` | Tests present |
|---|---|---|---|---|
| `greeter/hello` | ❌ absent (learner builds it) | ❌ | ❌ | `hello.test.ts` |
| `greeter/shout` | ✅ prior solution | ❌ absent | ❌ | `hello` + `shout.test.ts` |
| `greeter/config` | ✅ | ✅ prior solution | ❌ absent | all three |

The generator self-verifies this contract before writing any ref.

---

## 4. The generator — `scripts/compose.ts`

```
pnpm exec tsx scripts/compose.ts [--dry-run] [--push]
```

- **(default)** — generate tags locally; source branch untouched.
- **`--dry-run`** — plan + self-verify only; no refs written. Use to confirm the
  layout is correct before committing.
- **`--push`** — after generating, force-push the tags to `origin` (for deployed
  serving — CI does this).

The generator runs via `tsx` (Node builtins + `git` CLI; no other runtime deps) and is
config-driven: it reads `composeShort` from `workshop.yaml` to determine the tag
namespace and `.workshop/<short>/` path. Fixed author/committer ident produces
identical SHAs on re-runs (idempotent). It never modifies the source branch — only
`<composeShort>/*` tag refs move.

---

## 5. Author lifecycle — the going-forward process

### Creating a new workshop

1. **Design** — define lessons, what the learner builds each lesson, and how
   they're cumulative. Write lesson prose + pick a test recipe per lesson (see
   `VERIFICATION_CONTRACT.md`).

2. **Author** — on `main` (or a feature branch), create the source layout:
   `workshop.yaml` (with `composeShort`), `base/`, `lessons/<NN>-<slug>/`
   directories. Edit all files with normal commits. No overlays, no `from:`, no
   force-push.

3. **Dry-run** — confirm the generator sees the layout correctly:
   ```
   pnpm exec tsx scripts/compose.ts --dry-run
   ```
   Check the printed plan + self-verify output. Fix any layout errors.

4. **Generate locally** — write the tags into your local repo:
   ```
   pnpm exec tsx scripts/compose.ts
   ```
   Inspect a tag tree to confirm: `git show greeter/shout:src/hello.ts` should
   exist; `git show greeter/shout:src/shout.ts` should error.

5. **Walk it** (recommended) — run `walk-workshop <id> --local --smoke` to
   confirm the walker/guide/learner flow works end-to-end.

6. **Push + register** — for a deployed workshop, push source and generated tags:
   ```
   git push origin main
   pnpm exec tsx scripts/compose.ts --push
   ```
   Add a `dev` entry to `platform/workshops.json`:
   ```json
   {
     "id": "my-workshop",
     "repo": "learning-with-court/my-workshop",
     "ref": "my-ws/hello",
     "workshopRoot": ".workshop/my-ws",
     "cut": ["pnpm", "exec", "tsx", "scripts/compose.ts"],
     "envs": ["dev"]
   }
   ```
   - `ref` = the first lesson's tag (`<composeShort>/<firstSlug>`)
   - `workshopRoot` = `.workshop/<composeShort>`
   - `cut` = the generator command (the local provisioner runs this at checkout)

7. **Deploy** — open a PR to `dev`, merge, deploy-dev creates the Lambda. Test
   with `lwc setup <id>` against dev. Flip to `"envs": ["dev", "prod"]` for prod.

### Editing a lesson (the key win)

To fix a bug, reword prose, or change a solution:

1. Edit the file(s) normally — `Edit`, `Write`, or your editor.
2. Commit with `git commit`.
3. Regenerate: `pnpm exec tsx scripts/compose.ts` (then `--push` for deployed).

**That's it. No force-push on `main`. No rewriting history.** Only the
`<composeShort>/*` tag refs move. Downstream lesson tags pick up the change
automatically (the generator rebuilds the cumulative chain from scratch each run).

### Growing a standalone into a suite

Add more phases/lessons to `workshop.yaml` and corresponding `lessons/<NN>-<slug>/`
dirs. Run the generator — it extends the tag set. The existing lesson tags are
recomputed (idempotent SHAs if the prior source is unchanged). No migration, no
new repo.

---

## 6. Relation to existing standards

**`VERIFICATION_CONTRACT.md`** — the compose model is the delivery mechanism;
the verification contract specifies what goes *inside* each lesson's `test/` dir
and how `lesson.yaml` wires the `verifyCommand`. Use the contract's three recipes
(BEHAVIORAL, STRUCTURAL, STRUCTURAL no-source) when authoring tests. The
immutability rule (tests blocked even from the guide) is enforced by
`base/.claude/hooks/block-edits.sh` — it's in `base/` so it lands at every tag.

**`WORKSHOP_STANDARD.md`** — covers workshop identity, scaffold shape, and naming.
The compose model's source layout is the scaffold; `composeShort` is the one
compose-specific addition.

**The old git chain (`rebuild-chain.ts` + overlays + `from:`)** — still live for
the CCA monorepo while migration is in progress. New workshops start in the compose
model; CCA will migrate workshop-by-workshop. Do not use the chain for anything new.

---

## Quick reference

```
# First time
pnpm exec tsx scripts/compose.ts --dry-run    # check layout
pnpm exec tsx scripts/compose.ts              # generate tags locally
pnpm exec tsx scripts/compose.ts --push       # publish tags to origin (CI / deploy)

# After editing any lesson
git commit -m "fix lesson 2 prose"
pnpm exec tsx scripts/compose.ts [--push]

# Inspect a generated tree
git show greeter/shout:src/hello.ts      # prior solution — must exist
git show greeter/shout:src/shout.ts      # own solution — must NOT exist
git show greeter/shout:.workshop/greeter/lesson_config/README.md  # uniform prose
```
