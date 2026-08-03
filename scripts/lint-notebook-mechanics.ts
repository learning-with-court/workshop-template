// scripts/lint-notebook-mechanics.ts
//
//   pnpm lint-notebook-mechanics [path/to/mechanics.yaml ...]
//
// Validates the MECHANICAL shape of a notebook workshop's
// .workshop/mechanics.yaml. Defaults to notebook-base/mechanics.reference.yaml
// so the template's own reference file cannot rot; point it at a member's file
// to check that workshop.
//
// Why this is separate from validate-notebook-base.mjs, which is the drift
// check: mechanics.yaml is deliberately NOT synced. It mixes chassis (env.*,
// verify.*) with pedagogy (mode, judgeNotes, contentNotes), and a shared
// template must never ship one workshop's teaching philosophy as if it were a
// technical constraint. So there is no lock hash to compare against, and what
// can be checked is conformance to a shape.
//
// It also cannot live in the synced validator: that runs bare `node` with no
// install (notebook workshops are Python and have no node_modules), while
// parsing YAML properly needs a dependency. Shape checking is an AUTHORING-time
// concern anyway, so it belongs here and in /build-workshop's checklist.
//
// HARD RULE: this must never assert anything about `mode`, `judgeNotes`,
// `contentNotes`, `learnerBrief`, gates, or whether the workshop quizzes. Those
// belong to the workshop. The top-level schema is passthrough for exactly that
// reason.
import * as fs from "node:fs";
import * as YAML from "js-yaml";
import { z } from "zod";

export const NOTEBOOK_MEDIUM = "python-notebook";

/** Step keys the env builder understands.
 *
 *  SOURCE OF TRUTH: `parseStep`'s switch in lwc-cli's `internal/pyenv/build.go`.
 *  Keep this list byte-for-byte in step with those `case` labels. Different
 *  repos and different languages, so they cannot import each other; they agree
 *  by convention, and the convention has already failed once.
 *
 *  Get it wrong in either direction and it is worse than having no linter:
 *
 *  - A key HERE that pyenv does not accept: the linter passes a config that
 *    aborts the entire env build with `unknown key "..."`, so learners get no
 *    Python environment at all — no notebooks, no verify. This is not
 *    hypothetical. `fatal` was written into this list and into
 *    notebook-base/mechanics.reference.yaml from the reference doc rather than
 *    from pyenv, before pyenv implemented it, and it shipped that way to
 *    ml-foundations.
 *  - A key MISSING here that pyenv does accept: the linter rejects a valid
 *    workshop and the author has to work around their own tooling.
 *
 *  When pyenv gains or loses a key, change this list in the same PR and update
 *  the reference mechanics.yaml's documented key comment too. `fatal` requires
 *  a lwc-cli build that includes learning-with-court/lwc-cli#35. */
export const KNOWN_BUILD_KEYS = [
  "name",
  "install",
  "indexUrl",
  "noDeps",
  "editable",
  "probeImport",
  "note",
  "remedy",
  "optional",
  "fatal",
  "mkdir",
  "run",
  "copy",
  "copyTree",
  "to",
] as const;

const BuildStep = z
  .object({ name: z.string().min(1, "every build step needs a name") })
  .passthrough();

const Mechanics = z
  .object({
    medium: z.literal(NOTEBOOK_MEDIUM, {
      errorMap: () => ({
        message: `medium must be "${NOTEBOOK_MEDIUM}" — it is the switch pyenv.Medium() reads to register the notebook tools`,
      }),
    }),
    env: z.object({
      // A string, not a number: unquoted 3.10 parses as the float 3.1 in YAML,
      // which silently requests the wrong interpreter.
      python: z.string().regex(/^\d+\.\d+$/, 'env.python must be a quoted "MAJOR.MINOR" string'),
      requires: z.array(z.string()).optional(),
      cacheKey: z.array(z.string()).optional(),
      reuse: z.array(z.string()).optional(),
      build: z.array(BuildStep).min(1, "env.build needs at least one step"),
    }),
    verify: z.object({
      collect: z.string().min(1),
      notBuiltPatterns: z.array(z.string()).min(1),
      shipsBrokenPatterns: z.array(z.string()).min(1),
    }),
    scaffolding: z.array(z.string()).optional(),
  })
  // Pedagogy lives alongside these keys and is none of this linter's business.
  .passthrough();

export type LintIssue = { path: string; message: string };

/** Pure: the medium-specific invariants a schema cannot express. */
export function checkInvariants(doc: unknown): LintIssue[] {
  const issues: LintIssue[] = [];
  const m = doc as {
    env?: { reuse?: string[]; build?: Record<string, unknown>[] };
  };

  // Reusing notebooks/ across lesson checkouts carries a previous lesson's
  // outputs forward, so the learner opens a notebook that looks already-run.
  for (const r of m.env?.reuse ?? []) {
    if (/^notebooks\/?$/.test(r.trim())) {
      issues.push({
        path: "env.reuse",
        message:
          'never reuse "notebooks" — it is re-materialized per lesson, and carrying it forward leaks the previous lesson\'s outputs',
      });
    }
  }

  const steps = m.env?.build ?? [];

  // Unknown step keys do nothing at all rather than erroring, so a typo here is
  // invisible until a learner's environment is subtly wrong.
  steps.forEach((step, i) => {
    for (const key of Object.keys(step)) {
      if (!(KNOWN_BUILD_KEYS as readonly string[]).includes(key)) {
        issues.push({
          path: `env.build[${i}]`,
          message: `unknown build step key "${key}" — it will be silently ignored. Known keys: ${KNOWN_BUILD_KEYS.join(", ")}`,
        });
      }
    }
  });

  // Without a jupytext sync step, notebooks/ is never created and every lesson
  // opens to nothing. This is the one build step a notebook workshop cannot omit.
  const hasJupytextSync = steps.some((s) => {
    const run = s.run;
    return Array.isArray(run) && run.some((a) => typeof a === "string" && a === "jupytext");
  });
  if (!hasJupytextSync) {
    issues.push({
      path: "env.build",
      message:
        "no jupytext step found — notebooks/ is never materialized from src/, so every lesson opens empty",
    });
  }

  // A probe whose failure message has no fix is a dead end for the learner: the
  // whole point of probing a system library is that no package manager can
  // install it for them.
  steps.forEach((step, i) => {
    if (step.probeImport && !step.remedy) {
      issues.push({
        path: `env.build[${i}]`,
        message: `probeImport "${String(step.probeImport)}" has no remedy — a learner hitting it gets no way to fix it`,
      });
    }
  });

  return issues;
}

/** Pure: parse + validate one document's text. */
export function lintText(text: string): LintIssue[] {
  let doc: unknown;
  try {
    doc = YAML.load(text);
  } catch (e) {
    return [{ path: "<yaml>", message: `not valid YAML: ${(e as Error).message}` }];
  }
  const parsed = Mechanics.safeParse(doc);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => ({
      path: i.path.join(".") || "<root>",
      message: i.message,
    }));
  }
  return checkInvariants(doc);
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const targets = process.argv.slice(2);
  const files = targets.length ? targets : ["notebook-base/mechanics.reference.yaml"];
  let failed = false;
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`lint-notebook-mechanics: no such file: ${f}`);
      failed = true;
      continue;
    }
    const issues = lintText(fs.readFileSync(f, "utf8"));
    if (issues.length) {
      failed = true;
      console.error(`lint-notebook-mechanics: ${issues.length} issue(s) in ${f}:`);
      for (const i of issues) console.error(`  ${i.path}: ${i.message}`);
    } else {
      console.log(`lint-notebook-mechanics: OK — ${f}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
