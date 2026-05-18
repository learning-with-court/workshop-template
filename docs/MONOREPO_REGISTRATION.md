# Monorepo Registration — `workshopRoot`

For standalone workshops (one repo → one workshop), `workshops.json` looks like:

```json
{
  "id": "mcp-workshop",
  "repo": "learning-with-court/mcp-workshop",
  "ref": "main",
  "envs": ["dev", "prod"]
}
```

The platform fetcher reads `workshop.yaml` from the repo root.

---

## Registering multiple workshops from one repo

A **monorepo series** (like the Claude Certified Architect series) ships all
workshops in a single repo, with each workshop's manifest nested under a
sub-directory. The optional `workshopRoot` field tells the platform where to
find that workshop's `workshop.yaml` and `workshop/` lesson tree.

### `workshops.json` entry shape

```json
{
  "id": "cca-claude-code-workshop",
  "repo": "learning-with-court/claude-certified-architect",
  "ref": "main",
  "workshopRoot": ".workshop/claude-code",
  "envs": ["dev"],
  "series": {
    "id": "claude-certified-architect",
    "title": "Claude Certified Architect",
    "order": 1
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `workshopRoot` | Optional | Sub-directory path (no leading `/`) under which `workshop.yaml`, `landing.md`, and `workshop/<lesson-dirs>/` live. Omit for single-workshop repos. |
| `series` | Optional | Series membership mirrored from `workshop.yaml`. Drives series grouping in the catalog and landing site. |

### Monorepo layout

```
claude-certified-architect/          ← repo root
  .workshop/
    series.yaml                      ← optional series metadata (see below)
    claude-code/                     ← workshopRoot for cca-claude-code-workshop
      workshop.yaml
      landing.md
      workshop/
        lesson_01_setup/
          lesson.yaml
        lesson_02_prompting/
          lesson.yaml
    prompting/                       ← workshopRoot for cca-prompting-workshop
      workshop.yaml
      landing.md
      workshop/
        lesson_01_setup/
          lesson.yaml
```

### `series.yaml` minimal schema

Place at `.workshop/series.yaml` (or the repo root) to describe the series as a
whole:

```yaml
id: claude-certified-architect          # kebab-case; matches series.id in workshop.yaml
title: Claude Certified Architect       # human-readable
members:                                # ordered list of workshop ids
  - cca-claude-code-workshop
  - cca-prompting-workshop
  - cca-tools-mcp-workshop
  - cca-agentic-workshop
  - cca-context-reliability-workshop
  - cca-capstone-workshop
```

`series.yaml` is informational — the platform does not require it. It is
consumed by `lwc catalog` to render series-aware output and by any tooling that
needs the canonical member order.

---

## Backwards compatibility

`workshopRoot` is always optional. Existing `workshops.json` entries without it
continue to work exactly as before: the platform fetches `workshop.yaml` from
the repo root.

The `mcp-workshop`, `evals-workshop`, and `sql-intro-workshop` entries do **not**
need to be migrated to the monorepo pattern.

---

## CDK / Lambda behavior

Each `workshops.json` entry still produces its own per-env Lambda stack (named
`LwcWorkshop-<id>-Dev` / `LwcWorkshop-<id>-Prod`). Multiple entries pointing at
the same repo each get their own Lambda with their own bundle.

The `workshopRoot` is resolved at **bundle time** (during `fetch-and-bundle`).
The Lambda receives a pre-resolved bundle and does not use `workshopRoot` at
runtime. `WORKSHOP_ROOT` is set in the Lambda's environment as an observability
annotation only.
