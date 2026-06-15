# workshop/shared/

Cross-lesson seed data lives here. Most workshops won't need this slot —
leave the directory empty and `pnpm setup-shared` will stay a no-op.

## What this directory is for

Anything that multiple lessons read from and that doesn't belong inside
a single `lesson_<slug>/` package:

- **Sample databases** — a SQLite file lessons query against
- **Fixture corpora** — documents a RAG workshop indexes and retrieves over
- **Golden outputs** — reference answers an evals workshop scores against
- **Any shared blob** — model weights, embeddings, JSONL fixtures, etc.

If only one lesson uses the data, keep it inside that lesson package
instead.

## When to use it

Use `workshop/shared/` when **two or more lessons** read the same data.
Typical fits: SQL workshops, RAG workshops, evals workshops.

If your workshop is content-only (each lesson is self-contained), skip
this slot entirely. The default no-op `pnpm setup-shared` is intentional
— it means content-only workshops don't have a useless boot step.

## How to populate it

Provisioning runs through `pnpm setup-shared` (see `scripts/setup-shared.ts`).
Two patterns:

1. **Commit data directly** for small fixtures (<5 MB). Drop files in this
   directory and check them in. `setup-shared` can stay a no-op, or verify
   the files exist.
2. **Download / generate on first run** for larger blobs. Replace the body
   of `scripts/setup-shared.ts` with a `curl` / `fetch` that pulls the file
   into `workshop/shared/`. Keep it idempotent — re-running should be a
   no-op once the data is in place.

## Lessons read from here

From within `workshop/lesson_<slug>/`, use the relative path `../shared/`:

```ts
// workshop/lesson_query/src/query.ts
import Database from "better-sqlite3";
const db = new Database("../shared/sample.db", { readonly: true });
```

## About `.gitkeep`

The `.gitkeep` file is what keeps this directory alive in fresh template
forks (git won't track an empty dir). Replace it — or just leave it
alongside — once you've added real shared content.
