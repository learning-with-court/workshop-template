# How to add a lesson

Each lesson is its own pnpm workspace package under `workshop/lesson_<slug>/`.

> **Fastest path:** `pnpm new-lesson <slug> --phase A` scaffolds everything
> below from `workshop/lesson_example/` and registers it in `workshop.yaml`.
> The manual shape is documented here for reference. Lessons are identified by
> **slug** (kebab-case) — there is no lesson number. See
> [`docs/WORKSHOP_STANDARD.md`](../docs/WORKSHOP_STANDARD.md).

## Required files

```
workshop/lesson_<slug>/
  lesson.yaml          # manifest entry — see fields below
  package.json         # @workshop/lesson-<slug>
  tsconfig.json        # extends ../../tsconfig.base.json
  README.md            # H1 must match lesson.yaml `title`
  src/                 # lesson code
  tests/               # vitest tests
.claude/skills/lesson-<slug>.md   # walker skill — runs in the cloned project repo
```

The directory name format is **strict**: `lesson_<slug>` where:
- `<slug>` matches the canonical regex `^[a-z][a-z0-9-]*$` (lowercase letter
  first, then lowercase letters / digits / single hyphens). No underscores,
  no leading digit.
- The slug keeps its hyphen form in the directory name: slug `my-topic` →
  dir `lesson_my-topic` → manifest key `my-topic`.

## lesson.yaml fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | the lesson slug (string) — matches the dir's `<slug>` |
| `title` | yes | shown in catalog; must appear in README h1 |
| `blurb` | yes | one-sentence hook |
| `prerequisites` | yes | array of prior lesson slugs (e.g. `[setup, columns]`) |
| `targetFiles` | yes | array of paths the lesson modifies; empty array OK for setup-only |
| `verifyCommand` | yes | exact shell command to run the verify script |
| `verify.description` | yes | human-readable explanation |
| `verify.mustInclude` | yes | array of regex strings; verify output must match all |
| `verify.mustNotInclude` | no | array of regex strings; verify output must match none |
| `onPass.advanceTo` | no | next lesson slug |
| `onPass.feedback` | yes | 2–3 sentence handoff into the next lesson |

## workshop.yaml registration

After creating the lesson dir, add the slug to `workshop.yaml`:

```yaml
phases:
  - id: A
    title: phase title
    lessons:
      - example
      - your-new-lesson    # <-- add here
```

## Verification

```bash
pnpm install              # picks up the new workspace package
pnpm lint-manifest        # cross-checks workshop.yaml against the filesystem
pnpm typecheck            # all packages must typecheck
pnpm --filter @workshop/lesson-<slug> verify   # the verify script itself
```

The `manifest-lint` GitHub Action runs the same checks on every push.

## Walker skill

`.claude/skills/lesson-<slug>.md` is the per-lesson Claude Code skill that
guides the learner through the lesson when they invoke it from the cloned
project repo. Frontmatter:

```markdown
---
name: lesson-<slug>
description: Guide through <title>. Use when the learner asks for help on this lesson.
---
```

Body: walkthrough that calls out the targetFiles, points at the README,
and runs the verify command at the end.

The full walker shape is in `docs/WORKSHOP_SPEC.md` §1. Required H2
sections: `Visible walkthrough contract`, `Pedagogical priority`,
`Steps`, `Common debugging`, `What To Say Next`, `Style`. Use
`.claude/skills/lesson-example.md` as the starting scaffold — copy it,
rename, replace the TODOs.

**Critical:** never write "invoke this skill" or "use the Skill tool"
in walker prose. Project-level skill files are read directly via the
`Read` tool; that read IS the activation. See the comment block at the
top of the scaffold walker for the rationale.

## Canonical reference implementation

Each write-pedagogy lesson (where the learner fills in a target file)
ships a `src/canonical.<ext>` next to the target — the **authoritative
reference implementation** of the thing the learner is being asked to
write. The extension matches the target's format:

| Lesson shape | Canonical file |
|---|---|
| SQL query lesson | `canonical.sql` |
| TS function lesson | `canonical.ts` |
| Config / fixture lesson | `canonical.json` |

The lesson's test suite executes BOTH the learner's target AND the
canonical against the same fixtures and asserts both produce the output
declared in `expected.json` (or whatever fixture file the lesson uses).

### Three drift modes this catches

Without a canonical, only the learner's target is checked against
`expected.json`. That leaves three classes of bug invisible — all of
which the canonical check surfaces immediately:

1. **Stale `expected.json`.** Author edits the canonical query / code
   but forgets to regenerate the fixture. Learners pass against a stale
   expectation; the README's stated example no longer matches reality.
2. **Dataset drift.** Seed data changes (new rows, schema migration,
   regenerated fixture corpus) and nothing notices that the canonical
   is no longer consistent with `expected.json`.
3. **README disagrees with canonical.** The README prose says "the
   canonical query is X" but `expected.json` was generated from a
   different X. The walker tells the learner one thing while the test
   checks something else.

### Wiring per lesson

The template ships:

- `workshop/lesson_example/src/canonical.example` — the placeholder.
  Rename to `canonical.<ext>` and fill in the reference implementation.
- `workshop/lesson_example/tests/template.test.ts` — contains an
  `it.skip("canonical matches expected", …)` block with a TODO
  `runCanonical()` stub. Flip it to `it(…)` once you've implemented the
  executor for your workshop's file format.

`runCanonical()` is workshop-specific — the test stub shows the three
common shapes (open the fixture DB and execute SQL, dynamic-import a TS
module, read+parse JSON). Pick one, wire it once at the workshop level,
and reuse across all lessons that share the format.

### Read-pedagogy lessons can omit it

If the lesson is read-only — the learner studies code rather than
writing it — the lesson source IS the canonical. There's nothing to
cross-check, so the `canonical.<ext>` slot can be omitted. Either
delete the skipped test from `template.test.ts` or leave it skipped
permanently; the linter doesn't enforce presence.

### Visibility to learners

The canonical is **not hidden**. The workshop is hands-on, not graded —
peeking at the reference when stuck is fine, even encouraged. The point
is learning by doing with a known-good answer one file away, not
gate-keeping.

## Common patterns to copy into your lesson code

These shapes are the workshop's reference defaults. Inline them when the
lesson should teach the pattern; import from `workshop/shared/` once
you've extracted them.

### Defensive JSON parse (fence stripping)

Models slip ```` ```json ```` fences into output despite prompt
instructions. The canonical strip-then-parse shape lives in
`workshop/lesson_example/src/extract.ts` — copy it into any lesson
that reads model output as JSON. The pattern:

```ts
const stripped = raw.trim()
  .replace(/^```(?:json)?\s*/i, "")
  .replace(/\s*```\s*$/, "")
  .trim();
return JSON.parse(stripped);
```

### Anthropic client init from env

Read `ANTHROPIC_API_KEY` from `process.env`. Presence-check at the top
of the verify/run script and fail loudly with a "missing — see
`.env.example`" message. Never accept the key as a CLI arg, env vars
load cleanly via `tsx --env-file-if-exists=../../.env`.

```ts
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("✘ ANTHROPIC_API_KEY is missing.");
  console.error("  Copy .env.example to .env and set the value in your editor.");
  process.exit(1);
}
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
```

### Verify script shape

One canonical pass through the lesson's code path, emitting `→ ← ✔`
blocks (request, response, claim) — one block per assertion. Exit 0 on
success, non-zero on failure. The walker quotes the full stdout
verbatim back to the learner; the workshop's `lesson.yaml`
`verify.mustInclude` / `mustNotInclude` regexes match against this
stdout. See `workshop/lesson_example/src/verify.ts` for the
scaffold.

### Test shape

Mock the SDK; assert behavior. NEVER hit a real API in tests — that
makes tests slow, flaky, and dependent on secrets. Use vitest's
`vi.mock()` to stub the SDK at the module boundary.

```ts
import { vi, describe, it, expect } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "{\"ok\":true}" }] }) };
  },
}));

// import the code under test AFTER the mock
import { runLesson } from "../src/lesson.js";

describe("lesson behavior", () => {
  it("parses the model's response", async () => {
    const result = await runLesson();
    expect(result.ok).toBe(true);
  });
});
```

## First-encounter explainer links

If your workshop touches topics the platform's landing-site explainer pages cover, link to them at **first encounter** in the relevant walker, README section, or SessionStart hook block.

The platform currently hosts:

- `workshop.institute/secrets` — secret handling (API keys, threat model, three flows, leak recovery)
- `workshop.institute/editor` — picking an editor, finding the workshop dir, hidden files
- `workshop.institute/getting-started` — orientation for first-time workshop users
- `workshop.institute/troubleshooting` — catalog of common failure modes + fixes
- `workshop.institute/cost` — per-call costs + budgeting

**The shape**: a one-line FYI inside a `>` quote block, present-tense, offered not nagged. Once per topic per workshop — subsequent lessons that re-mention the topic don't repeat the link.

```markdown
> First time setting up a workshop secret? See
> [workshop.institute/secrets](https://workshop.institute/secrets) for
> the threat model and the three supported flows side by side.
```

See `WORKSHOP_SPEC.md` §17 for the full rule + per-workshop first-encounter mapping template.
