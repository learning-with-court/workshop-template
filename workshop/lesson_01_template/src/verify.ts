// TEMPLATE: replace this file with the real verify script for Lesson 1.
//
// Verify script convention (mcp-workshop / evals-workshop):
//   - Top of file: presence-check any required env vars and fail loudly
//     with a one-line "missing X — see .env.example" message if absent.
//   - Body: run one canonical pass through the lesson's code path.
//   - Output: one `→ ← ✔` block per assertion (request, response, claim).
//     The walker quotes this output verbatim back to the learner.
//   - Exit 0 on success, non-zero on failure. The workshop linter (or a
//     hosted workshop server) regex-matches `mustInclude` / `mustNotInclude`
//     patterns from `lesson.yaml` against this stdout.
//
// Why this shape: the walker shows the learner the code, runs verify,
// and quotes the FULL stdout verbatim. Lines like `→ ping({})` and
// `✔ ping returned a text content block` are the artifact the lesson
// teaches against. See docs/WORKSHOP_SPEC.md §1 (Visible walkthrough
// contract) for the binding contract.

// Example presence check (uncomment + customize if this lesson needs a
// secret from .env):
//
// if (!process.env.ANTHROPIC_API_KEY) {
//   console.error("✘ ANTHROPIC_API_KEY is missing.");
//   console.error("  Copy .env.example to .env at the workshop root and");
//   console.error("  set ANTHROPIC_API_KEY=sk-ant-... in your editor.");
//   process.exit(1);
// }

async function main(): Promise<void> {
  // TODO: replace with the lesson's actual verify logic.
  console.log("→ noop()");
  console.log("← {}");
  console.log("✔ lesson 01 template scaffold runs");
}

main().catch((err) => {
  console.error("✘ verify failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
