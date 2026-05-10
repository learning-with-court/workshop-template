# How to add a lesson

Each lesson is its own pnpm workspace package under `workshop/lesson_NN_<slug>/`.

## Required files

```
workshop/lesson_NN_<slug>/
  lesson.yaml          # manifest entry — see fields below
  package.json         # @workshop/lesson-NN-<slug>
  tsconfig.json        # extends ../../tsconfig.base.json
  README.md            # H1 must match lesson.yaml `title`
  src/                 # lesson code
  tests/               # vitest tests
.claude/skills/lesson-NN.md   # walker skill — runs in the cloned project repo
```

The directory name format is **strict**: `lesson_NN_<slug>` where:
- `NN` is the zero-padded lesson id (e.g. `01`, `12`)
- `<slug>` uses `_` separators (becomes `-` in the manifest key: `lesson_03_my_topic` → `03-my-topic`)

## lesson.yaml fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | integer matching the `NN` in the directory name |
| `title` | yes | shown in catalog; must appear in README h1 |
| `blurb` | yes | one-sentence hook |
| `prerequisites` | yes | array of prior lesson ids (e.g. `[1, 2]`) |
| `targetFiles` | yes | array of paths the lesson modifies; empty array OK for setup-only |
| `verifyCommand` | yes | exact shell command to run the verify script |
| `verify.description` | yes | human-readable explanation |
| `verify.mustInclude` | yes | array of regex strings; verify output must match all |
| `verify.mustNotInclude` | no | array of regex strings; verify output must match none |
| `onPass.advanceTo` | no | next lesson id |
| `onPass.feedback` | yes | 2–3 sentence handoff into the next lesson |

## workshop.yaml registration

After creating the lesson dir, add the key to `workshop.yaml`:

```yaml
phases:
  - id: A
    title: phase title
    lessons:
      - 01-template
      - 02-your-new-lesson    # <-- add here
```

## Verification

```bash
pnpm install              # picks up the new workspace package
pnpm lint-manifest        # cross-checks workshop.yaml against the filesystem
pnpm typecheck            # all packages must typecheck
pnpm --filter @workshop/lesson-NN-<slug> verify   # the verify script itself
```

The `manifest-lint` GitHub Action runs the same checks on every push.

## Walker skill

`.claude/skills/lesson-NN.md` is the per-lesson Claude Code skill that
guides the learner through the lesson when they invoke it from the cloned
project repo. Frontmatter:

```markdown
---
name: lesson-NN
description: Guide through Lesson NN — <title>. Use when the learner asks for help on this lesson.
---
```

Body: walkthrough that calls out the targetFiles, points at the README,
and runs the verify command at the end.
