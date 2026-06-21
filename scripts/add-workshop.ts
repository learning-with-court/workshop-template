// scripts/add-workshop.ts
//
// Grow a compose-series by adding a new workshop.
//
// Usage:
//   pnpm exec tsx scripts/add-workshop.ts <ws> [--first-lesson <slug>]
//
// Example:
//   pnpm exec tsx scripts/add-workshop.ts my-workshop --first-lesson intro
//
// <ws>           is the new workshop's kebab-case id.
// --first-lesson is the first lesson's slug (default: "intro").
//
// What it does:
//   - Validates <ws> is slug-form and not already in series.yaml
//   - Appends "- id: <ws> / order: <maxOrder+1>" to series.yaml workshops:
//   - Copies workshops/example/ → workshops/<ws>/ (skips node_modules)
//   - Rewrites workshop.yaml: id→<ws>, title→"TODO: <ws>"
//   - Renames 01-example → 01-<first-lesson>, rewrites lesson.yaml id,
//     coach.md name:, README H1
//   - Refuses if workshops/<ws>/ already exists

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Canonical slug regex — keep in sync with lint-manifest.ts and new-lesson.ts
const SLUG_RE = /^[a-z][a-z0-9-]*$/;

type Args = { ws: string; firstLesson: string };

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let firstLesson = "intro";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--first-lesson") {
      const v = argv[++i];
      if (!v) throw new Error("--first-lesson requires a value");
      firstLesson = v;
    } else if (a.startsWith("--first-lesson=")) {
      firstLesson = a.slice("--first-lesson=".length);
    } else if (a === "-h" || a === "--help") {
      printUsageAndExit(0);
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 1) {
    printUsageAndExit(1);
  }
  const [ws] = positional;
  if (!SLUG_RE.test(ws!)) {
    throw new Error(
      `<ws> must be slug-form (lowercase letter first, then lowercase letters, digits, hyphens), got "${ws}"`,
    );
  }
  if (!SLUG_RE.test(firstLesson)) {
    throw new Error(
      `--first-lesson must be slug-form, got "${firstLesson}"`,
    );
  }
  return { ws: ws!, firstLesson };
}

function printUsageAndExit(code: number): never {
  const msg = [
    "Usage: pnpm exec tsx scripts/add-workshop.ts <ws> [--first-lesson <slug>]",
    "",
    "  <ws>             new workshop id (kebab-case slug)",
    "  --first-lesson   first lesson slug (default: intro)",
    "",
    "Example:",
    "  pnpm exec tsx scripts/add-workshop.ts my-workshop --first-lesson intro",
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
 * Parse series.yaml and return workshops as [{id, order}] sorted by order.
 */
function parseSeriesWorkshops(text: string): { id: string; order: number }[] {
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
  return ids.sort((a, b) => a.order - b.order);
}

/**
 * Append a new workshop entry to series.yaml workshops: list,
 * line-preserving, matching the existing list indentation.
 */
function appendWorkshopEntry(yamlText: string, wsId: string, order: number): string {
  const lines = yamlText.split("\n");

  // Find `workshops:` line
  let workshopsIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^workshops:\s*$/.test(lines[i]!)) {
      workshopsIdx = i;
      break;
    }
  }
  if (workshopsIdx === -1) {
    throw new Error("series.yaml: could not find top-level `workshops:` key");
  }

  // Walk forward to find the last workshop entry and detect indentation
  let lastEntryIdx = workshopsIdx;
  let itemIndent: string | null = null;
  let orderIndent: string | null = null;

  for (let i = workshopsIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    // Top-level non-workshops key ends the block
    if (/^[A-Za-z]/.test(line)) break;
    const idMatch = line.match(/^(\s*)-\s*id:\s*\S+/);
    if (idMatch) {
      itemIndent = idMatch[1]!;
      lastEntryIdx = i;
      continue;
    }
    const orderMatch = line.match(/^(\s*)order:\s*\d+/);
    if (orderMatch) {
      orderIndent = orderMatch[1]!;
      lastEntryIdx = i;
      continue;
    }
  }

  // Fall back to 2-space / 4-space indents if we couldn't detect
  const ii = itemIndent ?? "  ";
  const oi = orderIndent ?? "    ";

  const newLines = [
    `${ii}- id: ${wsId}`,
    `${oi}order: ${order}`,
  ];

  lines.splice(lastEntryIdx + 1, 0, ...newLines);
  return lines.join("\n");
}

/**
 * Rewrite the lessons list in a workshop.yaml, replacing one lesson slug with another.
 * Only touches lines inside `lessons:` blocks under `phases:`. Line-preserving.
 */
function rewriteLessonSlugInWorkshopYaml(yamlText: string, oldSlug: string, newSlug: string): string {
  const lines = yamlText.split("\n");
  let inLessons = false;
  let phasesDepth = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^phases:\s*$/.test(line)) {
      phasesDepth = true;
      inLessons = false;
      continue;
    }
    if (phasesDepth) {
      // A new top-level key exits phases block
      if (/^[A-Za-z]/.test(line)) {
        phasesDepth = false;
        inLessons = false;
        continue;
      }
      if (/^\s*lessons:\s*$/.test(line)) {
        inLessons = true;
        continue;
      }
      if (inLessons) {
        // A sibling key or next phase entry ends the lessons block
        if (/^\s*\w+:/.test(line) && !/^\s*-/.test(line)) {
          inLessons = false;
          continue;
        }
        if (/^\s*-\s*id:\s*\S+/.test(line)) {
          inLessons = false;
          continue;
        }
        // Lesson item line
        const m = line.match(/^(\s*-\s*)(\S+)(\s*)$/);
        if (m && m[2] === oldSlug) {
          lines[i] = `${m[1]}${newSlug}${m[3]}`;
        }
      }
    }
  }
  return lines.join("\n");
}

/**
 * Copy src dir → dst dir recursively, skipping node_modules.
 */
function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function main() {
  const { ws, firstLesson } = parseArgs(process.argv.slice(2));

  // --- Load and validate series.yaml ---
  const seriesYaml = path.join(REPO_ROOT, "series.yaml");
  if (!fs.existsSync(seriesYaml)) {
    throw new Error("series.yaml not found at repo root");
  }
  const seriesText = fs.readFileSync(seriesYaml, "utf8");
  const existing = parseSeriesWorkshops(seriesText);
  const existingIds = existing.map((e) => e.id);

  if (existingIds.includes(ws)) {
    throw new Error(
      `workshop "${ws}" is already listed in series.yaml (workshops: ${existingIds.join(", ")})`,
    );
  }

  // --- Refuse if target dir already exists ---
  const targetDir = path.join(REPO_ROOT, "workshops", ws);
  if (fs.existsSync(targetDir)) {
    throw new Error(
      `refuse to overwrite: workshops/${ws}/ already exists`,
    );
  }

  // --- Compute next order ---
  const maxOrder = existing.reduce((m, e) => Math.max(m, e.order), 0);
  const newOrder = maxOrder + 1;

  // --- Source: workshops/example/ ---
  const exampleDir = path.join(REPO_ROOT, "workshops", "example");
  if (!fs.existsSync(exampleDir)) {
    throw new Error("workshops/example/ not found — it is the scaffold template");
  }

  // --- Copy example → target ---
  copyDir(exampleDir, targetDir);

  // --- Rewrite workshop.yaml: id + title ---
  const wsYamlPath = path.join(targetDir, "workshop.yaml");
  if (!fs.existsSync(wsYamlPath)) {
    throw new Error(`workshops/example/workshop.yaml was not copied correctly`);
  }
  rewriteFile(wsYamlPath, (text) => {
    let out = text;
    out = out.replace(/^id:\s*.*$/m, `id: ${ws}`);
    out = out.replace(/^title:\s*.*$/m, `title: "TODO: ${ws}"`);
    // Also rewrite repo field placeholder
    out = out.replace(/^repo:\s*.*$/m, `repo: learning-with-court/workshop-${ws}`);
    return out;
  });

  // --- Rename 01-example lesson dir → 01-<firstLesson> and rewrite contents ---
  const lessonsDir = path.join(targetDir, "lessons");
  const exampleLessonDir = path.join(lessonsDir, "01-example");
  const newLessonDir = path.join(lessonsDir, `01-${firstLesson}`);

  if (fs.existsSync(exampleLessonDir)) {
    fs.renameSync(exampleLessonDir, newLessonDir);

    // Rewrite lesson.yaml: id → firstLesson, title → "TODO: <firstLesson>"
    const lessonYamlPath = path.join(newLessonDir, "lesson.yaml");
    if (fs.existsSync(lessonYamlPath)) {
      rewriteFile(lessonYamlPath, (text) => {
        let out = text;
        out = out.replace(/^id:\s*.*$/m, `id: ${firstLesson}`);
        out = out.replace(/^title:\s*.*$/m, `title: "TODO: ${firstLesson} lesson title"`);
        return out;
      });
    }

    // Rewrite coach.md: frontmatter name: → <ws>-<firstLesson>
    const coachPath = path.join(newLessonDir, "coach.md");
    if (fs.existsSync(coachPath)) {
      rewriteFile(coachPath, (text) =>
        text.replace(/^name:\s*\S+\s*$/m, `name: ${ws}-${firstLesson}`),
      );
    }

    // Rewrite README.md: H1 title
    const readmePath = path.join(newLessonDir, "README.md");
    if (fs.existsSync(readmePath)) {
      rewriteFile(readmePath, (text) =>
        text.replace(/^#\s+.*$/m, `# TODO: ${firstLesson} lesson title`),
      );
    }

    // Rename solution and test files from example.* → <firstLesson>.*
    const solSrc = path.join(newLessonDir, "solution", "src");
    if (fs.existsSync(solSrc)) {
      const oldSol = path.join(solSrc, "example.ts");
      if (fs.existsSync(oldSol)) {
        fs.renameSync(oldSol, path.join(solSrc, `${firstLesson}.ts`));
      }
    }
    const testSrc = path.join(newLessonDir, "test", "src");
    if (fs.existsSync(testSrc)) {
      const oldTest = path.join(testSrc, "example.test.ts");
      if (fs.existsSync(oldTest)) {
        fs.renameSync(oldTest, path.join(testSrc, `${firstLesson}.test.ts`));
      }
    }
  }

  // --- Also rewrite workshop.yaml phases lessons: example → firstLesson ---
  // Use targeted line-preserving rewriter that only touches the lessons: block
  rewriteFile(wsYamlPath, (text) =>
    rewriteLessonSlugInWorkshopYaml(text, "example", firstLesson),
  );

  // --- Append to series.yaml ---
  const updated = appendWorkshopEntry(seriesText, ws, newOrder);
  fs.writeFileSync(seriesYaml, updated);

  // --- Summary ---
  const summary = [
    "",
    `created workshop ${ws} (workshops/${ws}/)`,
    "",
    `  series.yaml:   added workshops[id=${ws}, order=${newOrder}]`,
    `  workshop.yaml: workshops/${ws}/workshop.yaml (id + title rewritten)`,
    `  landing.md:    workshops/${ws}/landing.md`,
    `  first lesson:  workshops/${ws}/lessons/01-${firstLesson}/`,
    "",
    "next:",
    `  grep -rn TODO workshops/${ws}`,
    "  # fill in workshop.yaml fields (title, tagline, summary, etc.)",
    "  # fill in landing.md",
    `  # fill in workshops/${ws}/lessons/01-${firstLesson}/ (lesson.yaml, README.md, coach.md, solution, test)`,
    `  pnpm exec tsx scripts/new-lesson.ts ${ws} <slug>   # add more lessons`,
    "  pnpm exec tsx scripts/compose.ts --dry-run         # verify compose sees all lessons",
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
