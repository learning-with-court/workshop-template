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

The full walker shape is in `docs/WORKSHOP_SPEC.md` §1. Required H2
sections: `Visible walkthrough contract`, `Pedagogical priority`,
`Steps`, `Common debugging`, `What To Say Next`, `Style`. Use
`.claude/skills/lesson-01.md` as the starting scaffold — copy it,
rename, replace the TODOs.

**Critical:** never write "invoke this skill" or "use the Skill tool"
in walker prose. Project-level skill files are read directly via the
`Read` tool; that read IS the activation. See the comment block at the
top of the scaffold walker for the rationale.

## Common patterns to copy into your lesson code

These shapes are the workshop's reference defaults. Inline them when the
lesson should teach the pattern; import from `workshop/shared/` once
you've extracted them.

### Defensive JSON parse (fence stripping)

Models slip ```` ```json ```` fences into output despite prompt
instructions. The canonical strip-then-parse shape lives in
`workshop/lesson_01_template/src/extract.ts` — copy it into any lesson
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
stdout. See `workshop/lesson_01_template/src/verify.ts` for the
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
