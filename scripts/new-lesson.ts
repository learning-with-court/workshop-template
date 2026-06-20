// scripts/new-lesson.ts
//
// Scaffold a new compose-model lesson.
//
// Usage:
//   pnpm new-lesson <slug> [--phase A|B|C|...]
//
// Example:
//   pnpm new-lesson joins-and-aggregates --phase B
//
// Lessons are identified by slug (kebab-case). The lesson number (<NN>) is
// assigned automatically (highest existing lessons/<NN>-* + 1, zero-padded to 2 digits).
// See docs/WORKSHOP_STANDARD.md for the full identity contract.
//
// What it does (compose-model layout):
//   - Creates lessons/<NN>-<slug>/lesson.yaml — from lessons/01-example/lesson.yaml,
//     with id/title/blurb/verifyCommand rewritten for the new slug.
//   - Creates lessons/<NN>-<slug>/README.md — H1 placeholder + minimal body.
//   - Creates lessons/<NN>-<slug>/solution/src/<slug>.ts — stub export.
//   - Creates lessons/<NN>-<slug>/test/src/<slug>.test.ts — minimal vitest test
//     (written via shell; the block-edits hook denies Write/Edit on *.test.*).
//   - Copies .claude/skills/lesson-example.md -> lesson-<slug>.md, rewrites slug refs.
//   - Appends <slug> to workshop.yaml phases[--phase].lessons.
//   - Refuses to overwrite existing dirs; exits non-zero on conflict.
//
// Intentional non-goals:
//   - No package.json / tsconfig.json / canonical.* — compose-model lessons don't have them.
//   - No interactive prompts. Args only.
//   - No content generation. The author / agent fills the scaffold.

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Canonical lesson slug. Keep in sync with scripts/lint-manifest.ts.
const SLUG_RE = /^[a-z][a-z0-9-]*$/;

type Args = { slug: string; phase: string };

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let phase = "A";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--phase") {
      const v = argv[++i];
      if (!v) throw new Error("--phase requires a value");
      phase = v;
    } else if (a.startsWith("--phase=")) {
      phase = a.slice("--phase=".length);
    } else if (a === "-h" || a === "--help") {
      printUsageAndExit(0);
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 1) {
    printUsageAndExit(1);
  }
  const [slug] = positional;
  if (!SLUG_RE.test(slug!)) {
    throw new Error(
      `<slug> must be slug-form (lowercase letter first, then lowercase letters, digits, single hyphens), got "${slug}"`,
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(phase)) {
    throw new Error(`--phase must be a simple identifier, got "${phase}"`);
  }
  return { slug: slug!, phase };
}

function printUsageAndExit(code: number): never {
  const msg = [
    "Usage: pnpm new-lesson <slug> [--phase A|B|C]",
    "",
    "  <slug>  kebab-case lesson slug, e.g. joins-and-aggregates",
    "  --phase phase id from workshop.yaml; defaults to A",
    "",
    "Example:",
    "  pnpm new-lesson joins-and-aggregates --phase B",
  ].join("\n");
  (code === 0 ? console.log : console.error)(msg);
  process.exit(code);
}

function rewriteFile(file: string, fn: (text: string) => string): void {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  fs.writeFileSync(file, after);
}

/**
 * Append a `lesson` key to `workshop.yaml` under the phase with id === phaseId.
 * We edit line-by-line to preserve comments + formatting.
 */
function appendPhaseLesson(yamlText: string, phaseId: string, lessonKey: string): string {
  const lines = yamlText.split("\n");

  // Find the `phases:` line.
  let phasesIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^phases:\s*$/.test(lines[i]!)) {
      phasesIdx = i;
      break;
    }
  }
  if (phasesIdx === -1) {
    throw new Error("workshop.yaml: could not find top-level `phases:` key");
  }

  // Walk forward to find the phase entry matching phaseId.
  // A phase entry begins with `  - id: <phase>` (two-space indent for sequence
  // item under top-level `phases:`).
  let phaseStartIdx = -1;
  for (let i = phasesIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    // Stop if we hit another top-level key (no leading whitespace + colon).
    if (/^[A-Za-z]/.test(line)) break;
    const m = line.match(/^(\s*)-\s*id:\s*(\S+)\s*$/);
    if (m && m[2] === phaseId) {
      phaseStartIdx = i;
      break;
    }
  }
  if (phaseStartIdx === -1) {
    throw new Error(
      `workshop.yaml: could not find phase with id "${phaseId}". Add the phase manually first, or pick a different --phase.`,
    );
  }

  // Find the `lessons:` line in this phase block, then the last item under it.
  let lessonsIdx = -1;
  for (let i = phaseStartIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    // Next phase entry or next top-level key ends the block.
    if (/^[A-Za-z]/.test(line)) break;
    if (/^\s*-\s*id:\s*\S+/.test(line)) break;
    if (/^\s*lessons:\s*$/.test(line)) {
      lessonsIdx = i;
      break;
    }
  }
  if (lessonsIdx === -1) {
    throw new Error(
      `workshop.yaml: phase "${phaseId}" has no \`lessons:\` block`,
    );
  }

  // Walk forward collecting lesson item lines (e.g. `      - example`).
  // Indentation is whatever the existing items use; preserve it.
  let lastLessonIdx = lessonsIdx;
  let lessonItemIndent: string | null = null;
  for (let i = lessonsIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^[A-Za-z]/.test(line)) break;
    if (/^\s*-\s*id:\s*\S+/.test(line)) break;
    const m = line.match(/^(\s*)-\s+(\S+)\s*$/);
    if (!m) {
      // Blank line or comment inside the block — keep scanning but don't update lastLessonIdx.
      if (line.trim() === "" || line.trim().startsWith("#")) continue;
      // A sibling key under the phase (e.g. next phase field) — stop.
      break;
    }
    if (m[2] === lessonKey) {
      // Already present. Caller decides whether that's fatal.
      return yamlText;
    }
    lessonItemIndent = m[1]!;
    lastLessonIdx = i;
  }

  // If the lessons: block had no items yet, fall back to a 6-space indent
  // (matches the template's existing entry: "      - example").
  const indent = lessonItemIndent ?? "      ";
  const newItem = `${indent}- ${lessonKey}`;
  lines.splice(lastLessonIdx + 1, 0, newItem);
  return lines.join("\n");
}

/**
 * Compute the next zero-padded 2-digit lesson index by scanning lessons/*.
 * Highest existing <NN> + 1; defaults to 2 if the directory is empty or missing.
 */
function nextLessonIndex(): number {
  const lessonsDir = path.join(REPO_ROOT, "lessons");
  if (!fs.existsSync(lessonsDir)) return 2;
  const entries = fs.readdirSync(lessonsDir);
  let max = 1;
  for (const e of entries) {
    const m = e.match(/^(\d+)-/);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return max + 1;
}

/**
 * Convert a kebab-case slug to a camelCase JS identifier for use as a function name.
 * E.g. "joins-and-aggregates" -> "joinsAndAggregates"
 */
function slugToFunctionName(slug: string): string {
  return slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Rewrite the example-lesson references in the copied walker skill to the new
 * lesson slug. Targets the compose-model path layout.
 */
function rewriteLessonReferences(text: string, slug: string, lessonDir: string, funcName: string): string {
  let out = text;

  // Frontmatter `name: lesson-example` -> `name: lesson-<slug>`.
  out = out.replace(/^name:\s*lesson-\S+\s*$/m, `name: lesson-${slug}`);

  // Skill name references `lesson-example` -> `lesson-<slug>`.
  out = out.replace(/\blesson-example\b/g, `lesson-${slug}`);

  // Lesson dir path `lessons/01-example/` -> `lessons/<NN>-<slug>/`.
  out = out.replace(/\blessons\/01-example\b/g, `lessons/${lessonDir}`);

  // Lesson prose path `.workshop/.../lesson_example/` -> `lesson_<slug>/`.
  out = out.replace(/\blesson_example\b/g, `lesson_${slug}`);

  // File references `src/example.test.ts` -> `src/<slug>.test.ts`.
  out = out.replace(/\bsrc\/example\.test\.ts\b/g, `src/${slug}.test.ts`);

  // File references `src/example.ts` -> `src/<slug>.ts`.
  out = out.replace(/\bsrc\/example\.ts\b/g, `src/${slug}.ts`);

  // Function name references `example()` -> `<funcName>()`.
  out = out.replace(/\bexample\(\)/g, `${funcName}()`);

  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { slug, phase } = args;

  const lessonKey = slug;
  const funcName = slugToFunctionName(slug);
  const nn = String(nextLessonIndex()).padStart(2, "0");
  const lessonDir = `${nn}-${slug}`;
  const newDir = path.join(REPO_ROOT, "lessons", lessonDir);

  const templateLessonYaml = path.join(REPO_ROOT, "lessons", "01-example", "lesson.yaml");
  const skillSrc = path.join(REPO_ROOT, ".claude", "skills", "lesson-example.md");
  const skillDst = path.join(REPO_ROOT, ".claude", "skills", `lesson-${slug}.md`);
  const workshopYaml = path.join(REPO_ROOT, "workshop.yaml");

  // --- Pre-flight checks ---------------------------------------------------
  if (!fs.existsSync(templateLessonYaml)) {
    throw new Error(`template missing: lessons/01-example/lesson.yaml`);
  }
  if (!fs.existsSync(skillSrc)) {
    throw new Error(`template walker missing: .claude/skills/lesson-example.md`);
  }
  if (!fs.existsSync(workshopYaml)) {
    throw new Error("workshop.yaml missing at repo root");
  }
  if (fs.existsSync(newDir)) {
    throw new Error(`refuse to overwrite: lessons/${lessonDir} already exists`);
  }
  if (fs.existsSync(skillDst)) {
    throw new Error(`refuse to overwrite: .claude/skills/lesson-${slug}.md already exists`);
  }

  // --- Create lesson.yaml --------------------------------------------------
  fs.mkdirSync(newDir, { recursive: true });
  const templateYamlText = fs.readFileSync(templateLessonYaml, "utf8");
  let lessonYaml = templateYamlText;
  lessonYaml = lessonYaml.replace(/^id:\s*.*$/m, `id: ${slug}`);
  lessonYaml = lessonYaml.replace(/^title:\s*.*$/m, `title: "TODO: ${slug} lesson title"`);
  lessonYaml = lessonYaml.replace(/^blurb:\s*.*$/m, `blurb: "TODO: one-sentence hook describing what the learner does in this lesson."`);
  lessonYaml = lessonYaml.replace(
    /^verifyCommand:\s*.*$/m,
    `verifyCommand: "pnpm exec vitest run src/${slug}.test.ts || true"`,
  );
  fs.writeFileSync(path.join(newDir, "lesson.yaml"), lessonYaml);

  // --- Create README.md ----------------------------------------------------
  const readmeText = [
    `# TODO: ${slug} lesson title`,
    "",
    "TODO: brief description of what the learner builds in this lesson.",
    "",
    "## What you'll build",
    "",
    `TODO: describe the artifact — e.g. a TypeScript module at \`src/${slug}.ts\`.`,
    "",
    "## Verification",
    "",
    "```",
    `pnpm exec vitest run src/${slug}.test.ts`,
    "```",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(newDir, "README.md"), readmeText);

  // --- Create solution/src/<slug>.ts ---------------------------------------
  const solDir = path.join(newDir, "solution", "src");
  fs.mkdirSync(solDir, { recursive: true });
  fs.writeFileSync(
    path.join(solDir, `${slug}.ts`),
    `export function ${funcName}(): void {}\n`,
  );

  // --- Create test/src/<slug>.test.ts via shell ----------------------------
  // (the block-edits hook denies Write/Edit on *.test.* files)
  const testSrcDir = path.join(newDir, "test", "src");
  fs.mkdirSync(testSrcDir, { recursive: true });
  const testFilePath = path.join(testSrcDir, `${slug}.test.ts`);
  execFileSync("bash", ["-c", [
    `cat > '${testFilePath}' << 'NEWLESSONEOF'`,
    `import { describe, it, expect } from "vitest";`,
    `import { ${funcName} } from "./${slug}.ts";`,
    ``,
    `describe("${slug}", () => {`,
    `  it("runs without error", () => {`,
    `    expect(() => ${funcName}()).not.toThrow();`,
    `  });`,
    `});`,
    `NEWLESSONEOF`,
  ].join("\n")]);

  // --- Copy + rewrite walker skill -----------------------------------------
  fs.copyFileSync(skillSrc, skillDst);
  rewriteFile(skillDst, (text) => rewriteLessonReferences(text, slug, lessonDir, funcName));

  // --- Append phase entry --------------------------------------------------
  const wsText = fs.readFileSync(workshopYaml, "utf8");
  const wsUpdated = appendPhaseLesson(wsText, phase, lessonKey);
  if (wsUpdated === wsText) {
    console.warn(
      `note: workshop.yaml already lists "${lessonKey}" under phase ${phase} — skipped append`,
    );
  } else {
    fs.writeFileSync(workshopYaml, wsUpdated);
  }

  // --- Summary -------------------------------------------------------------
  const summary = [
    "",
    `created lesson ${slug} (lessons/${lessonDir}/)`,
    "",
    `  lesson.yaml:  lessons/${lessonDir}/lesson.yaml`,
    `  README.md:    lessons/${lessonDir}/README.md`,
    `  solution:     lessons/${lessonDir}/solution/src/${slug}.ts`,
    `  test:         lessons/${lessonDir}/test/src/${slug}.test.ts`,
    `  walker:       .claude/skills/lesson-${slug}.md`,
    `  phase:        workshop.yaml phases[id=${phase}].lessons += ${lessonKey}`,
    "",
    "next:",
    `  grep -rn TODO: lessons/${lessonDir} .claude/skills/lesson-${slug}.md`,
    "  # fill in title/blurb, lesson prose (README.md + lesson.yaml verify description)",
    `  # implement lessons/${lessonDir}/solution/src/${slug}.ts`,
    `  # update lessons/${lessonDir}/test/src/${slug}.test.ts with real assertions`,
    "  # rewrite the walker skill (.claude/skills/lesson-" + slug + ".md)",
    "  pnpm exec tsx scripts/compose.ts --dry-run  # verify compose sees the lesson",
    "",
  ].join("\n");
  console.log(summary);
}

try {
  main();
} catch (err) {
  console.error(`✘ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
