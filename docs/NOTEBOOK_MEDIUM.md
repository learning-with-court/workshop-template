# The notebook medium

Most workshops here are TypeScript projects the learner edits and tests. A
**notebook workshop** is different: lesson code lives in git-tracked
`py:percent` sources under `src/`, paired into real `.ipynb` files under
`notebooks/` that the learner opens in JupyterLab, and a live kernel runs the
cells.

That machinery is shared through a **second, opt-in base**, kept in sync the
same way the code base is but on an independent version line.

## Two bases, deliberately separate

| | Code base | Notebook base |
|---|---|---|
| Manifest | `base.manifest` | `notebook-base.manifest` |
| Source tree | `base/` (plus repo-root files) | `notebook-base/` |
| Tags | `base-vN` | `notebook-base-vN` |
| Member lock | `base.lock` | `notebook-base.lock` |
| Sync tool | `scripts/sync-base.ts` (workspace) | `scripts/sync-notebook-base.ts` (workspace) |
| Member-side check | `scripts/validate-base.mjs` | `scripts/validate-notebook-base.mjs` |
| Who gets it | every Code member (`base: true`) | only members declaring `medium: python-notebook` |

They are separate because their audiences differ. A SQL workshop should never
carry jupytext pairing or a JupyterLab extension, while the code base's job
(compose, validate, lint, CI, the walker chassis) is genuinely universal and
unrelated. Bolting a second concept onto `sync-base` was rejected on purpose:
that is the tool that corrupted itself during the base-v20 work, and a sibling
is safer than reopening it.

What the sibling does **not** duplicate is the copy logic. It imports
`planSync`, `mergeLocal` and `diffPlan` from `sync-base.ts`, which are already
pure and already generic over the manifest, and which carry the hard-won
`LOCAL_SENTINEL` line-start fix a copy would have to re-earn. The coupling is
intentional: both syncs want identical copy semantics.

## The switch

A workshop opts in by declaring the medium at the top level of
`.workshop/mechanics.yaml`:

```yaml
medium: python-notebook
```

This is the same declaration `pyenv.Medium()` in `lwc-cli` reads to decide
whether to register the nine notebook tools, so there is one source of truth
rather than a second opt-in flag to keep in step. Absence safely means "not a
notebook workshop."

Note that this is orthogonal to `.feature-workspace.yml`'s `base: false` flag,
which is about the **code** base. `workshop-nexus` takes both. A future
notebook workshop that skipped the code base would still take this one.

## Why the manifest paths are member-relative

`notebook-base.manifest` lists destination paths as the member sees them
(`base/jupytext.toml`), and declares where its source tree lives:

```json
{ "sourceRoot": "notebook-base", "verbatim": ["base/jupytext.toml", "..."] }
```

`sync-notebook-base` resolves each path under `sourceRoot` when reading. That
indirection exists so `workshop-template` can hold notebook chassis **without
inheriting it**: if these files sat at their final paths in the template, the
template itself would carry a notebook toolchain it does not use, and compose
would ship it into the template's own workshop. That is the
`medium-conditional-base-files` problem in reverse, and the prefix avoids it.

It also means `planSync` needed no modification: the prefix lives entirely in
the reader.

## What travels, and what must not

The notebook base carries the **mechanical and technical chassis only**.

**It travels:** the jupytext pairing (`base/jupytext.toml`), the JupyterLab
settings (`base/.workshop/jupyter-overrides.json`), the prebuilt
follow-the-cell-being-run extension plus its source
(`base/.workshop/labextensions/`, `extensions/scroll-on-run/`), the notebook
verify helpers (`base/tests/notebook_verify.py`), the member-side drift check
and its workflow.

**It does not travel:** `judgeNotes`, `contentNotes`, `mode`, gates, coach
scripts, `learnerBrief`, or whether the workshop quizzes. `workshop-nexus` bans
quizzing outright; a future notebook workshop may quiz deliberately and must be
free to. Pushing a pedagogy decision into a shared template would make every
later workshop inherit one workshop's teaching philosophy as if it were a
technical constraint.

**The test for whether something belongs:** would a workshop with the opposite
teaching style still need it? A jupytext pairing, yes. A no-quiz ban, no.

### The two files that are split rather than shared

**`tests/conftest.py` is not synced; `tests/notebook_verify.py` is.** Nexus's
original `conftest.py` mixed pure notebook mechanics (reading the state file,
reading execution counts out of a saved `.ipynb`) with NEXUS-specific helpers
(`get_client()` importing `from fundamental import Fundamental`,
`print_model_fact()` calling `client.models.get()`). Only the first kind
travels. Your `conftest.py` imports what it needs and adds its own:

```python
import pytest
from notebook_verify import ROOT, load_state, print_state, notebook_execution_report

@pytest.fixture
def state() -> dict:
    return load_state()
```

**`.workshop/mechanics.yaml` is not synced either**, because it mixes chassis
with pedagogy in a single file and a byte-for-byte sync cannot express that
split. (The `LOCAL_SENTINEL` trick is a poor fit for YAML: a mis-split yields
invalid YAML rather than a visible error.) Instead the template ships
`notebook-base/mechanics.reference.yaml` as a documented example and validates
the **shape**:

```bash
pnpm lint-notebook-mechanics                          # the reference file
pnpm lint-notebook-mechanics ../workshop-nexus/base/.workshop/mechanics.yaml
```

That linter checks the mechanical keys and is **silent about pedagogy** by
design, enforced by its own tests. It is separate from
`validate-notebook-base.mjs` because parsing YAML needs a dependency, while the
member-side drift check must run under bare `node` (notebook workshops are
Python and have no `node_modules`).

Beyond schema conformance it catches three medium-specific mistakes worth
knowing about:

- **reusing `notebooks/`** across lesson checkouts, which carries the previous
  lesson's outputs forward so the learner opens an already-run notebook
- **an unknown `env.build` step key**, which is silently ignored rather than
  erroring, so a typo is invisible until an environment is subtly wrong
- **a `probeImport` with no `remedy`**, which is a dead end: the whole point of
  probing a system library is that no package manager can install it for the
  learner

## Cutting and syncing a version

Tagging is automatic. Push a change under `notebook-base/` (or to
`notebook-base.manifest`) to `main` and `release-notebook-base.yml` cuts the
tag the manifest declares. If the version is already tagged elsewhere it fails
rather than moving a published tag, because moving one would silently change
what every notebook workshop syncs.

Then, from the **workspace** repo:

```bash
pnpm exec tsx scripts/sync-notebook-base.ts --tag notebook-base-v1 --dry-run
pnpm exec tsx scripts/sync-notebook-base.ts --tag notebook-base-v1
```

`--dry-run` is read-only: it diffs against each member's `origin/dev` without
any checkout. A real run isolates each member in a throwaway git worktree, so a
member's live clone and branch are never touched, then opens a
`feature/notebook-base-sync` PR.

## Adding a notebook workshop

1. Fork this template as usual.
2. Copy `notebook-base/mechanics.reference.yaml` to
   `base/.workshop/mechanics.yaml`, declare `medium: python-notebook`, fill in
   the mechanical parts, and write your own pedagogy.
3. Register the member in `.feature-workspace.yml`.
4. Run `sync-notebook-base --tag notebook-base-vN --member workshop-<id>`.
5. Check the shape: `pnpm lint-notebook-mechanics <path to your mechanics.yaml>`.

Step 2 is where your workshop diverges from every other notebook workshop, and
that is intended. The chassis is shared; the teaching is yours.
