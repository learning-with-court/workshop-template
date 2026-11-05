// scripts/lint-steps.ts
// Checks each lesson.yaml's optional `steps:` block, the per-step page hints
// lwc's lesson page reads. lint-manifest.ts runs it after the manifest lint
// (its vendored Lesson schema ignores `steps`, as the platform's does), so
// `pnpm lint-manifest` covers both. A lesson with no `steps:` passes.
//
// One entry per README Walkthrough item, in order; each may name a view
// (`file <path>`, relative to the practice repo, `commits`, or `move <from> <to>`) and,
// for a choose step, the choices whose prompts the buttons send. The views are
// lwc's: it draws them from the practice repo named in .lwc/target-repo, never
// from the workshop's own clone. See docs/LESSON_PAGE.md.
//
// Also checks each workshop's optional terms.yaml (the words lwc underlines in a
// step, each with what it means) and that its intro.md is beside it.
import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "js-yaml";
import { z } from "zod";

const Places = ["edited", "staged", "committed", "github"];

const View = z.string().refine(
  (v) => {
    const [kind, ...args] = v.trim().split(/\s+/);
    if (kind === "file") return args.length === 1;
    if (kind === "commits") return args.length === 0;
    if (kind === "move") {
      return args.length === 2 && args[0] !== args[1] && args.every((p) => Places.includes(p));
    }
    return false;
  },
  `must be "file <path>", "commits", or "move <from> <to>" with from and to among ${Places.join(", ")}`,
);

const Step = z
  .object({
    view: View.optional(),
    /** A choose step: each choice is a button that sends its prompt. */
    choices: z
      .array(z.object({ label: z.string().min(1), prompt: z.string().min(1) }).strict())
      .min(2)
      .optional(),
  })
  .strict();

const Steps = z.object({ steps: z.array(Step).optional() });

/** A zod issue path as it reads in YAML: steps[4].choices[0].prompt */
function issuePath(p: (string | number)[]): string {
  return p.map((k, i) => (typeof k === "number" ? `[${k}]` : i ? `.${k}` : k)).join("") || "(root)";
}

/** Top-level numbered items (`1. `, unindented) under the README's `## Walkthrough`. */
export function walkthroughItems(readme: string): number {
  let inside = false;
  let n = 0;
  for (const line of readme.split("\n")) {
    if (/^## /.test(line)) inside = /^## Walkthrough\s*$/.test(line);
    else if (inside && /^\d+\. /.test(line)) n++;
  }
  return n;
}

/** Errors for one lesson dir (holding lesson.yaml and README.md); [] when it has no steps. */
export function lintLessonSteps(lessonDir: string, label = lessonDir): string[] {
  const yamlPath = path.join(lessonDir, "lesson.yaml");
  if (!fs.existsSync(yamlPath)) return [];
  const parsed = Steps.safeParse(YAML.load(fs.readFileSync(yamlPath, "utf8")));
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${label}/lesson.yaml: ${issuePath(i.path)}: ${i.message}`);
  }
  const steps = parsed.data.steps;
  if (!steps) return [];
  const readme = path.join(lessonDir, "README.md");
  if (!fs.existsSync(readme)) return [`${label}/lesson.yaml: steps given but README.md is missing`];
  // Each entry hints one Walkthrough item, so there can't be more entries than items.
  const items = walkthroughItems(fs.readFileSync(readme, "utf8"));
  if (steps.length > items) {
    return [`${label}/lesson.yaml: ${steps.length} steps but the README has ${items} Walkthrough items`];
  }
  return [];
}

/** Every lesson under <repoRoot>/workshops/<ws>/lessons/ and <repoRoot>/lessons/. */
export function lintSteps(repoRoot: string): string[] {
  const lessonRoots: string[] = [path.join(repoRoot, "lessons")];
  const workshops = path.join(repoRoot, "workshops");
  if (fs.existsSync(workshops)) {
    for (const ws of fs.readdirSync(workshops)) lessonRoots.push(path.join(workshops, ws, "lessons"));
  }
  const errors: string[] = [];
  for (const root of lessonRoots) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    for (const d of fs.readdirSync(root).sort()) {
      const dir = path.join(root, d);
      if (fs.statSync(dir).isDirectory()) errors.push(...lintLessonSteps(dir, path.relative(repoRoot, dir)));
    }
  }
  return errors;
}

const Terms = z
  .object({
    terms: z.array(
      z.object({ term: z.string().min(1), means: z.string().min(1), ask: z.string().min(1).optional() }).strict(),
    ),
  })
  .strict();

/** Errors for every <repoRoot>/workshops/<ws>/terms.yaml; a workshop without one is fine. */
export function lintWorkshopTerms(repoRoot: string): string[] {
  const workshops = path.join(repoRoot, "workshops");
  if (!fs.existsSync(workshops)) return [];
  const errors: string[] = [];
  for (const ws of fs.readdirSync(workshops).sort()) {
    const termsPath = path.join(workshops, ws, "terms.yaml");
    if (!fs.existsSync(termsPath)) continue;
    const label = path.relative(repoRoot, termsPath);
    if (!fs.existsSync(path.join(workshops, ws, "intro.md"))) {
      errors.push(`${label}: terms given but intro.md is missing beside it`);
    }
    let doc: unknown;
    try {
      doc = YAML.load(fs.readFileSync(termsPath, "utf8"));
    } catch (e) {
      errors.push(`${label}: does not parse: ${(e as Error).message.split("\n")[0]}`);
      continue;
    }
    const parsed = Terms.safeParse(doc);
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((i) => `${label}: ${issuePath(i.path)}: ${i.message}`));
    }
  }
  return errors;
}

// CLI: tsx scripts/lint-steps.ts  (from the repo root)
if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = [...lintSteps(process.cwd()), ...lintWorkshopTerms(process.cwd())];
  if (errors.length === 0) {
    console.log("✔ lesson steps and workshop terms lint passed");
    process.exit(0);
  }
  for (const e of errors) console.error(`✘ ${e}`);
  process.exit(1);
}
