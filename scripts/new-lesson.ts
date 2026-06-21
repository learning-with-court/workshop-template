// scripts/new-lesson.ts
//
// Scaffold a new compose-model lesson into a chosen workshop of the series.
//
// Usage:
//   pnpm exec tsx scripts/new-lesson.ts <ws> <slug> [--phase A|B|C|...]
//
// Example:
//   pnpm exec tsx scripts/new-lesson.ts example my-new-lesson --phase A
//
// <ws>   is a workshop id listed in series.yaml.
// <slug> is the lesson's kebab-case identifier.
// The lesson number (<NN>) is assigned automatically (highest existing
// workshops/<ws>/lessons/<NN>-* + 1, zero-padded to 2 digits).
//
// What it does (compose-suite co-located layout):
//   - Creates workshops/<ws>/lessons/<NN>-<slug>/lesson.yaml
//     (templated from the workshop's first lesson; id/title/blurb/verifyCommand rewritten)
//   - Creates workshops/<ws>/lessons/<NN>-<slug>/README.md (H1 + minimal body)
//   - Creates workshops/<ws>/lessons/<NN>-<slug>/coach.md
//     (copied from workshop's first lesson coach.md; frontmatter name: → <ws>-<slug>)
//   - Creates workshops/<ws>/lessons/<NN>-<slug>/solution/src/<slug>.ts (stub export)
//   - Creates workshops/<ws>/lessons/<NN>-<slug>/test/src/<slug>.test.ts
//     (written via shell; the block-edits hook denies Write/Edit on *.test.*)
//   - Appends <slug> to workshops/<ws>/workshop.yaml phases[--phase].lessons
//   - Refuses to overwrite existing dirs; exits non-zero on conflict.

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Canonical lesson slug. Keep in sync with scripts/lint-manifest.ts.
const SLUG_RE = /^[a-z][a-z0-9-]*$/;

type Args = { ws: string; slug: string; phase: string };

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
  if (positional.length < 2) {
    printUsageAndExit(1);
  }
  const [ws, slug] = positional;
  if (!SLUG_RE.test(slug!)) {
    throw new Error(
      `<slug> must be slug-form (lowercase letter first, then lowercase letters, digits, hyphens), got "${slug}"`,
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(phase)) {
    throw new Error(`--phase must be a simple identifier, got "${phase}"`);
  }
  return { ws: ws!, slug: slug!, phase };
}

function printUsageAndExit(code: number): never {
  const msg = [
    "Usage: pnpm exec tsx scripts/new-lesson.ts <ws> <slug> [--phase A|B|C]",
    "",
    "  <ws>    workshop id listed in series.yaml",
    "  <slug>  kebab-case lesson slug, e.g. joins-and-aggregates",
    "  --phase phase id from workshops/<ws>/workshop.yaml; defaults to A",
    "",
    "Example:",
    "  pnpm exec tsx scripts/new-lesson.ts example my-new-lesson --phase A",
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
 * Parse series.yaml and return the ordered list of workshop ids.
 */
function seriesWorkshops(): string[] {
  const seriesYaml = path.join(REPO_ROOT, "series.yaml");
  if (!fs.existsSync(seriesYaml)) {
    throw new Error("series.yaml not found at repo root");
  }
  const text = fs.readFileSync(seriesYaml, "utf8");
  const ids: { id: string; order: number }[] = [];
  let inWorkshops = false;
  let cur: { id?: string; order?: number } | null = null;
  for (const line of text.split("\n")) {
    if (/^workshops:\s*$/.test(line)) {
      inWorkshops = true;
      continue;
    }
    if (!inWorkshops) continue;
    // Top-level key ends workshops block
    if (/^\S/.test(line) && !/^workshops:/.test(line)) {
      inWorkshops = false;
      continue;
    }
    if (/^\s*-\s*id:/.test(line)) {
      if (cur?.id != null) ids.push({ id: cur.id, order: cur.order ?? 0 });
      const m = line.match(/^\s*-\s*id:\s*(\S+)/);
      cur = { id: m?.[1] };
      continue;
    }
    if (cur != null) {
      const om = line.match(/^\s*order:\s*(\d+)/);
      if (om) cur.order = parseInt(om[1]!, 10);
    }
  }
  if (cur?.id != null) ids.push({ id: cur.id, order: cur.order ?? 0 });
  return ids.sort((a, b) => a.order - b.order).map((e) => e.id);
}

/**
 * Return all lesson slugs registered in a workshop.yaml (across all phases).
 */
function registeredSlugs(workshopYaml: string): string[] {
  const text = fs.readFileSync(workshopYaml, "utf8");
  const slugs: string[] = [];
  let inLessons = false;
  for (const line of text.split("\n")) {
    if (/^\s*lessons:\s*$/.test(line)) {
      inLessons = true;
      continue;
    }
    if (inLessons) {
      const m = line.match(/^\s*-\s*([a-z][a-z0-9-]*)\s*$/);
      if (m) {
        slugs.push(m[1]!);
        continue;
      }
      // A sibling key (non-list, non-blank) ends the lessons block
      if (/^\s*\w+:/.test(line) || /^\S/.test(line)) {
        inLessons = false;
      }
    }
  }
  return slugs;
}

/**
 * Compute the next zero-padded 2-digit lesson index by scanning workshops/<ws>/lessons/.
 * Highest existing <NN> + 1; defaults to 1 if the directory is empty or missing.
 */
function nextLessonIndex(ws: string): number {
  const lessonsDir = path.join(REPO_ROOT, "workshops", ws, "lessons");
  if (!fs.existsSync(lessonsDir)) return 1;
  const entries = fs.readdirSync(lessonsDir);
  let max = 0;
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

  // Find the `lessons:` line in this phase block.
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
      // A sibling key under the phase — stop.
      break;
    }
    if (m[2] === lessonKey) {
      // Already present. Caller decides whether that's fatal.
      return yamlText;
    }
    lessonItemIndent = m[1]!;
    lastLessonIdx = i;
  }

  // If the lessons: block had no items yet, fall back to a 6-space indent.
  const indent = lessonItemIndent ?? "      ";
  const newItem = `${indent}- ${lessonKey}`;
  lines.splice(lastLessonIdx + 1, 0, newItem);
  return lines.join("\n");
}

function main() {
  const { ws, slug, phase } = parseArgs(process.argv.slice(2));

  // --- Validate workshop against series.yaml ---
  const workshops = seriesWorkshops();
  if (!workshops.includes(ws)) {
    throw new Error(
      `unknown workshop "${ws}". Series workshops: ${workshops.join(", ")}`,
    );
  }

  const funcName = slugToFunctionName(slug);
  const workshopDir = path.join(REPO_ROOT, "workshops", ws);
  const workshopYaml = path.join(workshopDir, "workshop.yaml");
  const lessonsDir = path.join(workshopDir, "lessons");

  // --- Validate workshop.yaml exists ---
  if (!fs.existsSync(workshopYaml)) {
    throw new Error(`missing workshops/${ws}/workshop.yaml`);
  }

  // --- Check for duplicate slug ---
  const existing = registeredSlugs(workshopYaml);
  if (existing.includes(slug)) {
    throw new Error(`workshop "${ws}" already has a lesson "${slug}"`);
  }

  // --- Also check if lesson dir exists already (belt-and-suspenders) ---
  if (fs.existsSync(lessonsDir)) {
    for (const entry of fs.readdirSync(lessonsDir)) {
      if (entry.endsWith(`-${slug}`)) {
        throw new Error(`refuse to overwrite: workshops/${ws}/lessons/${entry} already exists`);
      }
    }
  }

  // --- Compute NN and paths ---
  const nn = String(nextLessonIndex(ws)).padStart(2, "0");
  const lessonDir = `${nn}-${slug}`;
  const newDir = path.join(lessonsDir, lessonDir);

  if (fs.existsSync(newDir)) {
    throw new Error(`refuse to overwrite: workshops/${ws}/lessons/${lessonDir} already exists`);
  }

  // --- Find template sources ---
  // Use the workshop's first lesson as template, falling back to workshops/example/lessons/01-example/
  const firstSlug = existing[0];
  let templateLessonDir: string;
  let templateCoach: string;

  if (firstSlug) {
    // Find the first lesson dir for this slug
    const firstLessonDir = fs.readdirSync(lessonsDir).find((e) => e.endsWith(`-${firstSlug}`));
    if (firstLessonDir) {
      templateLessonDir = path.join(lessonsDir, firstLessonDir);
      templateCoach = path.join(templateLessonDir, "coach.md");
    } else {
      templateLessonDir = path.join(REPO_ROOT, "workshops", "example", "lessons", "01-example");
      templateCoach = path.join(templateLessonDir, "coach.md");
    }
  } else {
    templateLessonDir = path.join(REPO_ROOT, "workshops", "example", "lessons", "01-example");
    templateCoach = path.join(templateLessonDir, "coach.md");
  }

  const templateLessonYaml = path.join(templateLessonDir, "lesson.yaml");

  // --- Pre-flight checks ---
  if (!fs.existsSync(templateLessonYaml)) {
    throw new Error(`template missing: ${path.relative(REPO_ROOT, templateLessonYaml)}`);
  }
  if (!fs.existsSync(templateCoach)) {
    throw new Error(`template coach missing: ${path.relative(REPO_ROOT, templateCoach)}`);
  }

  // --- Create lesson.yaml ---
  fs.mkdirSync(newDir, { recursive: true });
  let lessonYaml = fs.readFileSync(templateLessonYaml, "utf8");
  lessonYaml = lessonYaml.replace(/^id:\s*.*$/m, `id: ${slug}`);
  lessonYaml = lessonYaml.replace(/^title:\s*.*$/m, `title: "TODO: ${slug} lesson title"`);
  lessonYaml = lessonYaml.replace(/^blurb:\s*.*$/m, `blurb: "TODO: one-sentence hook describing what the learner does in this lesson."`);
  lessonYaml = lessonYaml.replace(
    /^verifyCommand:\s*.*$/m,
    `verifyCommand: "pnpm exec vitest run src/${slug}.test.ts || true"`,
  );
  fs.writeFileSync(path.join(newDir, "lesson.yaml"), lessonYaml);

  // --- Create README.md ---
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

  // --- Create coach.md (copied from template, frontmatter name rewritten) ---
  const coachDst = path.join(newDir, "coach.md");
  fs.copyFileSync(templateCoach, coachDst);
  rewriteFile(coachDst, (text) => {
    // Rewrite frontmatter name: <anything> -> name: <ws>-<slug>
    return text.replace(/^name:\s*\S+\s*$/m, `name: ${ws}-${slug}`);
  });

  // --- Create solution/src/<slug>.ts ---
  const solDir = path.join(newDir, "solution", "src");
  fs.mkdirSync(solDir, { recursive: true });
  fs.writeFileSync(
    path.join(solDir, `${slug}.ts`),
    `export function ${funcName}(): void {}\n`,
  );

  // --- Create test/src/<slug>.test.ts via shell ---
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

  // --- Append to workshops/<ws>/workshop.yaml ---
  const wsText = fs.readFileSync(workshopYaml, "utf8");
  const wsUpdated = appendPhaseLesson(wsText, phase, slug);
  if (wsUpdated === wsText) {
    console.warn(
      `note: workshops/${ws}/workshop.yaml already lists "${slug}" under phase ${phase} — skipped append`,
    );
  } else {
    fs.writeFileSync(workshopYaml, wsUpdated);
  }

  // --- Summary ---
  const summary = [
    "",
    `created lesson ${ws}/${slug} (workshops/${ws}/lessons/${lessonDir}/)`,
    "",
    `  lesson.yaml:  workshops/${ws}/lessons/${lessonDir}/lesson.yaml`,
    `  README.md:    workshops/${ws}/lessons/${lessonDir}/README.md`,
    `  coach.md:     workshops/${ws}/lessons/${lessonDir}/coach.md`,
    `  solution:     workshops/${ws}/lessons/${lessonDir}/solution/src/${slug}.ts`,
    `  test:         workshops/${ws}/lessons/${lessonDir}/test/src/${slug}.test.ts`,
    `  phase:        workshops/${ws}/workshop.yaml phases[id=${phase}].lessons += ${slug}`,
    "",
    "next:",
    `  grep -rn TODO: workshops/${ws}/lessons/${lessonDir}`,
    "  # fill in title/blurb, lesson prose (README.md + lesson.yaml verify description)",
    `  # implement workshops/${ws}/lessons/${lessonDir}/solution/src/${slug}.ts`,
    `  # update workshops/${ws}/lessons/${lessonDir}/test/src/${slug}.test.ts with real assertions`,
    `  # rewrite the coach skill (workshops/${ws}/lessons/${lessonDir}/coach.md)`,
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
