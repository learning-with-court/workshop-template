// scripts/new-lesson.ts
//
// Scaffold a new lesson package from `workshop/lesson_01_template/`.
//
// Usage:
//   pnpm new-lesson <NN> <slug> [--phase A|B|C|...]
//
// Example:
//   pnpm new-lesson 03 joins-and-aggregates --phase B
//
// What it does:
//   - Copies workshop/lesson_01_template/  -> workshop/lesson_<NN>_<slug_>/
//     (slug underscore-separated in the directory name).
//   - Rewrites the new package.json `name` to @workshop/lesson-<NN>-<slug>.
//   - Rewrites lesson.yaml: `id` to the integer <NN>, blanks title/blurb
//     to TODO placeholders, sets verifyCommand to the new filter.
//   - Rewrites the lesson README H1 to "Lesson <N>: TODO" so the manifest
//     linter doesn't fail on the title check before the author edits it.
//   - Rewrites tests/template.test.ts describe block label.
//   - Carries `src/canonical.example` across as-is. The author renames
//     it to `canonical.<ext>` (sql/ts/json) once they've decided the
//     lesson's reference-implementation format and wires the matching
//     `it.skip("canonical matches expected", ...)` test in
//     tests/template.test.ts. See workshop/LESSON_TEMPLATE.md
//     §canonical-reference-implementation for the full convention.
//   - Copies .claude/skills/lesson-01.md -> lesson-<NN>.md and rewrites
//     frontmatter `name` + trigger phrases for the new number.
//   - Appends <NN>-<slug> to workshop.yaml phases[--phase].lessons.
//   - Refuses to overwrite existing files; exits non-zero on conflict.
//
// Intentional non-goals:
//   - No interactive prompts. Args only.
//   - No content generation. The author / agent fills the scaffold.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

type Args = { nn: string; slug: string; phase: string };

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
  const [nnRaw, slug] = positional;
  if (!/^\d{1,2}$/.test(nnRaw!)) {
    throw new Error(`<NN> must be 1–2 digits, got "${nnRaw}"`);
  }
  const nn = nnRaw!.padStart(2, "0");
  if (nn === "00") {
    throw new Error(`<NN> must be >= 01, got "${nnRaw}"`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug!)) {
    throw new Error(
      `<slug> must be kebab-case (lowercase letters, digits, single hyphens), got "${slug}"`,
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(phase)) {
    throw new Error(`--phase must be a simple identifier, got "${phase}"`);
  }
  return { nn, slug: slug!, phase };
}

function printUsageAndExit(code: number): never {
  const msg = [
    "Usage: pnpm new-lesson <NN> <slug> [--phase A|B|C]",
    "",
    "  <NN>    two-digit lesson number, e.g. 03",
    "  <slug>  kebab-case lesson slug, e.g. joins-and-aggregates",
    "  --phase phase id from workshop.yaml; defaults to A",
    "",
    "Example:",
    "  pnpm new-lesson 03 joins-and-aggregates --phase B",
  ].join("\n");
  (code === 0 ? console.log : console.error)(msg);
  process.exit(code);
}

function copyDirSync(src: string, dst: string, skip: (rel: string) => boolean) {
  fs.mkdirSync(dst, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const e of entries) {
    const rel = e.name;
    if (skip(rel)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) {
      copyDirSync(s, d, (sub) => skip(path.join(rel, sub)));
    } else if (e.isSymbolicLink()) {
      const linkTarget = fs.readlinkSync(s);
      fs.symlinkSync(linkTarget, d);
    } else if (e.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
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

  // Walk forward collecting lesson item lines (e.g. `      - 01-template`).
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
  // (matches the template's existing entry: "      - 01-template").
  const indent = lessonItemIndent ?? "      ";
  const newItem = `${indent}- ${lessonKey}`;
  lines.splice(lastLessonIdx + 1, 0, newItem);
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { nn, slug, phase } = args;
  const nnInt = parseInt(nn, 10);

  const slugUnderscore = slug.replace(/-/g, "_");
  const dirName = `lesson_${nn}_${slugUnderscore}`;
  const pkgName = `@workshop/lesson-${nn}-${slug}`;
  const lessonKey = `${nn}-${slug}`;

  const templateDir = path.join(REPO_ROOT, "workshop", "lesson_01_template");
  const newDir = path.join(REPO_ROOT, "workshop", dirName);
  const skillSrc = path.join(REPO_ROOT, ".claude", "skills", "lesson-01.md");
  const skillDst = path.join(REPO_ROOT, ".claude", "skills", `lesson-${nn}.md`);
  const workshopYaml = path.join(REPO_ROOT, "workshop.yaml");

  // --- Pre-flight checks ---------------------------------------------------
  if (!fs.existsSync(templateDir)) {
    throw new Error(`template missing: ${path.relative(REPO_ROOT, templateDir)}`);
  }
  if (!fs.existsSync(skillSrc)) {
    throw new Error(`template walker missing: ${path.relative(REPO_ROOT, skillSrc)}`);
  }
  if (!fs.existsSync(workshopYaml)) {
    throw new Error("workshop.yaml missing at repo root");
  }
  if (fs.existsSync(newDir)) {
    throw new Error(`refuse to overwrite: ${path.relative(REPO_ROOT, newDir)} already exists`);
  }
  if (fs.existsSync(skillDst)) {
    throw new Error(`refuse to overwrite: ${path.relative(REPO_ROOT, skillDst)} already exists`);
  }

  // --- Copy lesson dir (skip node_modules + build artifacts) ---------------
  copyDirSync(templateDir, newDir, (rel) => {
    const top = rel.split(path.sep)[0]!;
    if (top === "node_modules") return true;
    if (top === "dist") return true;
    if (rel === "tsconfig.tsbuildinfo") return true;
    return false;
  });

  // --- Rewrite package.json -----------------------------------------------
  rewriteFile(path.join(newDir, "package.json"), (text) => {
    const pkg = JSON.parse(text);
    pkg.name = pkgName;
    return JSON.stringify(pkg, null, 2) + "\n";
  });

  // --- Rewrite lesson.yaml -------------------------------------------------
  rewriteFile(path.join(newDir, "lesson.yaml"), (text) => {
    let out = text;
    // id: <int>
    out = out.replace(/^id:\s*.*$/m, `id: ${nnInt}`);
    // title: <placeholder>
    out = out.replace(
      /^title:\s*.*$/m,
      `title: "TODO: Lesson ${nnInt} title"`,
    );
    // blurb
    out = out.replace(
      /^blurb:\s*.*$/m,
      `blurb: "TODO: one-sentence hook describing what the learner does in this lesson."`,
    );
    // verifyCommand — point at the new filter
    out = out.replace(
      /^verifyCommand:\s*.*$/m,
      `verifyCommand: "pnpm --filter ${pkgName} verify"`,
    );
    return out;
  });

  // --- Rewrite README.md ---------------------------------------------------
  rewriteFile(path.join(newDir, "README.md"), (text) => {
    const lines = text.split("\n");
    // H1: "# Lesson <N>: TODO: Lesson <N> title" — substring-matches the
    // lesson.yaml title so the manifest linter passes until the author edits.
    lines[0] = `# Lesson ${nnInt}: TODO: Lesson ${nnInt} title`;
    // Replace the canonical filter reference if present so `pnpm verify`
    // examples line up with the new package.
    return lines
      .join("\n")
      .replace(
        /pnpm --filter @workshop\/lesson-01-template verify/g,
        `pnpm --filter ${pkgName} verify`,
      );
  });

  // --- Rewrite tests/template.test.ts label (best-effort) ------------------
  const testFile = path.join(newDir, "tests", "template.test.ts");
  if (fs.existsSync(testFile)) {
    // Keep the file as-is — it exercises extract.ts and remains useful as a
    // smoke test until the author replaces it. No rename needed.
  }

  // --- Copy + rewrite walker skill ----------------------------------------
  fs.copyFileSync(skillSrc, skillDst);
  rewriteFile(skillDst, (text) => {
    let out = text;
    // Frontmatter `name: lesson-NN`
    out = out.replace(/^name:\s*lesson-\d+\s*$/m, `name: lesson-${nn}`);
    // Frontmatter description: swap "Lesson 1" / "lesson 1" references.
    // The template description carries trigger-phrase examples for lesson 1;
    // rewrite to the new number so the author has matching seeds to refine.
    out = rewriteLessonReferences(out, nnInt);
    return out;
  });

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
    `created lesson ${nn}-${slug}`,
    "",
    `  dir:    workshop/${dirName}/`,
    `  pkg:    ${pkgName}`,
    `  walker: .claude/skills/lesson-${nn}.md`,
    `  phase:  workshop.yaml phases[id=${phase}].lessons += ${lessonKey}`,
    "",
    "next:",
    "  pnpm install",
    "  grep -rn TODO: " + `workshop/${dirName} .claude/skills/lesson-${nn}.md`,
    "  # fill in title/blurb/verifyCommand assertions, walker prose, lesson source",
    `  # rename workshop/${dirName}/src/canonical.example -> canonical.<ext>`,
    "  # (sql/ts/json) and wire the skipped \"canonical matches expected\"",
    `  # test in workshop/${dirName}/tests/template.test.ts. Read-pedagogy`,
    "  # lessons can leave the slot empty.",
    "",
  ].join("\n");
  console.log(summary);
}

/**
 * Rewrite lesson-1 references in the copied walker skill to the new lesson
 * number. Scoped to common patterns in the template scaffold; the author
 * still needs to replace prose, but the mechanical substitutions remove
 * the obvious foot-guns (path references, package filter names, trigger
 * phrases, code-block filenames).
 */
function rewriteLessonReferences(text: string, nnInt: number): string {
  const nn = String(nnInt).padStart(2, "0");
  let out = text;

  // `lesson_01_template` -> `lesson_NN_<slug>` — but we don't know the slug
  // shape here, so leave the body paths alone. The walker is mostly TODO
  // text anyway; the author will rewrite the entire body.
  // (We only touch unambiguous numeric references.)

  // "Lesson 1" / "lesson 1" — both with and without word boundaries in the
  // trigger-phrase context.
  out = out.replace(/\bLesson 1\b/g, `Lesson ${nnInt}`);
  out = out.replace(/\blesson 1\b/g, `lesson ${nnInt}`);

  // Word "lesson-01" in skill name references etc.
  out = out.replace(/\blesson-01\b/g, `lesson-${nn}`);

  // Package filter `@workshop/lesson-01-template` -> placeholder for the new
  // package. The author owns the slug for the verify command, but the digits
  // should match.
  out = out.replace(
    /@workshop\/lesson-01-template/g,
    `@workshop/lesson-${nn}-TODO-slug`,
  );

  // "lesson 2" appears as the *next-step* phrase in the scaffold walker;
  // bump it to the lesson after this one so the seed is right.
  out = out.replace(/\bstart lesson 2\b/g, `start lesson ${nnInt + 1}`);
  out = out.replace(/\blesson 2\b/g, `lesson ${nnInt + 1}`);

  // README path reference `workshop/lesson_01_template/README.md` — we don't
  // know the slug here either; leave it as a visible TODO target.
  return out;
}

try {
  main();
} catch (err) {
  console.error(`✘ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
