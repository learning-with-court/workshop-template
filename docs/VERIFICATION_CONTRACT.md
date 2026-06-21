# Verification contract

How a workshop verifies a learner's work. This is the standard that
`scripts/new-lesson.ts` scaffolds and `create-workshop` / `build-workshop`
follow. It is the companion to [WORKSHOP_STANDARD.md](./WORKSHOP_STANDARD.md)
(identity + scaffolding) — this doc covers **verification** specifically.

## Why (the principle)

A lesson's verify is **diagnostic, run by the learner, and judged by the
guide** — not a pass/fail grader. The guide reads the real output, compares
actual vs expected, and coaches. Two things follow, and they are the whole
point of this contract:

1. **Verify runs real, executable tests** — not a bespoke script that prints a
   hand-rolled `✔/✘`. Real tests catch the gap between what the guide *says* the
   code does and what it *actually* does. (This was proven on the CCA suite: real
   `vitest` tests removed a "verify-overclaim" failure mode that prose guardrails
   in the walker could not — the guide stopped asserting behavior that hadn't
   actually run.)
2. **The test is an immutable shipped artifact.** It ships with the lesson; the
   learner (and the guide walking the lesson) **runs** it, never authors, edits,
   or "fixes" it. A blocked edit is enforced structurally (see *Immutability*).

## The lesson shape

A migrated/contract lesson directory is **prose only**:

```
workshop/lesson_<slug>/
  lesson.yaml      # manifest (see below)
  README.md        # the lesson prose
```

The test lives with the runnable source, not in the lesson dir:

```
src/<slug>.test.ts        # the shipped test for lesson_<slug>
```

There is **no** `package.json` / `tsconfig.json` / `verify.ts` inside the lesson
dir — verification is the test file plus the `lesson.yaml` `verifyCommand`.

### `lesson.yaml` verify block

```yaml
verifyCommand: pnpm exec vitest run src/<slug>.test.ts || true
verify:
  description: |
    2–4 lines: what the test confirms, and that a failing test does NOT block
    advancement — it tells the learner what to fix.
  mustInclude: ["Tests "]
  mustNotInclude: ["Cannot find module"]
```

- **`|| true` makes it advisory.** The command exits 0 whether tests pass or
  fail, so a red conformance test never hard-blocks the learner.
- **`mustInclude: ["Tests "]`** matches the test-runner summary line, which
  prints on *both* pass and fail. The gate therefore proves *the suite ran*, not
  that every assertion passed. (Platform note: `checkVerifyOutput` treats this as
  advisory-compatible by design — see the platform schema comment.)
- **`mustNotInclude: ["Cannot find module"]`** still blocks on a genuine harness
  error (a missing import is a setup problem, not a learner mistake).

## The three test recipes

Pick by what the lesson produces. Read an existing example of each before writing.

### A. BEHAVIORAL — the lesson builds an API-calling function

Inject the client so the test can fake it; assert the return value and that the
input reached the request. Split `behavior` (worth fixing) from `conformance`
(advisory: model, token budget, exact wording). Add one live test gated on a key.

```ts
import { describe, test, expect, vi } from "vitest";
import { myFn } from "./myFn.ts"; // signature: myFn(arg, client = new Anthropic())

function captureClient(content: unknown[]) {
  const create = vi.fn(async () => ({ content }));
  return { client: { messages: { create } } as any, create };
}

describe("behavior", () => {
  test("returns the result and sends the input", async () => {
    const { client, create } = captureClient([{ type: "text", text: "ok" }]);
    const out = await myFn("the-input", client);
    expect(out).toBe("ok");
    expect(create.mock.calls[0][0].messages[0].content).toContain("the-input");
    //  ^ assert the input reached the model — NEVER assert exact prompt prose
  });
});

describe("conformance", () => {
  test("uses the spec's model + max_tokens", async () => {
    const { client, create } = captureClient([{ type: "text", text: "x" }]);
    await myFn("d", client);
    expect(create.mock.calls[0][0].model).toBe("claude-haiku-4-5");
    expect(create.mock.calls[0][0].max_tokens).toBe(512);
  });
});

test.skipIf(!process.env.ANTHROPIC_API_KEY)("live: a real call returns output", async () => {
  expect(typeof await myFn("real input")).toBe("string");
});
```

**Make the function injectable** (`fn(arg, client = new Anthropic())`) — that is
the one source change a behavioral test requires. Exercise the *real* control
flow: a function with a retry loop needs a test that makes the first response
invalid and asserts the second call happened (`create.mock.calls.length === 2`),
not just a happy-path call.

### B. STRUCTURAL — the lesson produces a config/code artifact that exists in the tree

Hard-read the artifact and loose-regex-match the markers. Mirror whatever the
lesson's old `verify.ts` checked (intent, not exact wording).

```ts
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");

describe("<slug> — <artifact>", () => {
  test("declares the X tool", () => {
    const src = readFileSync(resolve(root, "src/<artifact>.ts"), "utf8");
    expect(src).toMatch(/name:\s*["']record_findings["']/); // anchored, not /name:/
  });
});
```

Keep regexes **loose enough** not to break on rephrasing, **tight enough** to
fail a wrong implementation. `/name:/` matches any object literal — anchor it.

### C. STRUCTURAL, no-source — the artifact is learner-built and absent from the tree

Same as B, but guard every test so it **skips** when the artifact is absent
(keeps the working-tree sweep green; activates the moment the learner builds it):

```ts
const target = resolve(root, "src/server/webhook.ts");
test.skipIf(!existsSync(target))("exports handleWebhook + verifies the signature", () => {
  const src = readFileSync(target, "utf8");
  expect(src).toMatch(/handleWebhook/);
  expect(src).toMatch(/x-hub-signature|verifySignature|hmac/i);
});
```

Use this when the lesson's deliverable is **not** present in the repo's
end-state tree (a from-scratch server, a `fly.toml`, a forensic write-up). To
validate such a test, temporarily create a satisfying artifact, confirm the test
flips skipped → passed, then delete it — **never commit the fixture.**

## Immutability — the test is shipped, not authored

`.claude/hooks/block-edits.sh` (a base file, wired as a `PreToolUse` hook) has
two tiers:

- **Test files (`*.test.*`) are blocked UNCONDITIONALLY** — even with the
  `.workshop-autopilot-active` bypass marker. The contract is immutable.
- **Other `protectedPaths`** (declared in `workshop.yaml`) honor the marker.

Consequence for **authors**: you cannot create or edit a `*.test.*` file with the
`Write`/`Edit`/`MultiEdit` tools — the hook denies them. Author test files with
the shell instead (a `cat > src/<slug>.test.ts <<'EOF' … EOF` heredoc), which the
hook does not intercept. This is intentional: it keeps the agent honest during a
walk, and the author is the one operator allowed to ship the contract.

## Walker pedagogy (how the guide narrates a test run)

This is captured in `.claude/skills/_walker-base.md` (base file). In short:

- **Run the lesson's `verifyCommand` exactly** — it names the test. Never guess a
  filename; never author/fix a test. A "missing" test is a provisioning issue to
  surface, not a cue to write one.
- **Quote the full output, then interpret** — don't state what a test checks
  before running it.
- **`behavior` failures are worth fixing; `conformance` failures are the
  learner's call** (model/budget/wording are advisory). **Skipped** live tests
  (no API key) are expected. **Never say "you failed."** Advancement is never
  gated on green.

## Test delivery (compose model)

Every workshop — single or series — follows the compose model. A lesson's test
source lives once in `lessons/<NN>-<slug>/test/src/<slug>.test.ts`;
`scripts/compose.ts` delivers it into each per-lesson cumulative tag (served as
`src/<slug>.test.ts`). There is no second copy and no overlay step — the chain /
`chain-edits` overlay mechanism is retired (CCA migrated off it onto compose).

## Checklist for one lesson

- [ ] Lesson dir is prose only (`lesson.yaml` + `README.md`); no
      `package.json`/`tsconfig.json`/`verify.ts`.
- [ ] `src/<slug>.test.ts` exists, using recipe A / B / C.
- [ ] `lesson.yaml`: advisory `verifyCommand`, `mustInclude: ["Tests "]`,
      `mustNotInclude: ["Cannot find module"]`.
- [ ] README "## Verify" says **"say run verify"** (prose) — it does NOT hardcode
      a `pnpm --filter … verify` command (that breaks once the package is gone).
- [ ] Coach skill references the current signature/command (no stale spec).
