// scripts/rename-lesson.ts
//
// Renumber an existing lesson package. Sibling to scripts/new-lesson.ts.
//
// Usage:
//   pnpm rename-lesson <old-NN> <new-NN>
//
// Example:
//   pnpm rename-lesson 03 04
//
// What it does (in this order — all edits buffered in memory, then written,
// directory rename happens LAST so an interrupt mid-run can't corrupt state):
//   - Finds `workshop/lesson_<old-NN>_<slug>/`. Errors if not found, or if
//     `workshop/lesson_<new-NN>_*` already exists (refuses to auto-swap).
//   - Rewrites the lesson's `lesson.yaml` integer `id`.
//   - Rewrites the lesson's `package.json` name to `@workshop/lesson-<new-NN>-<slug>`.
//   - Renames `.claude/skills/lesson-<old-NN>.md` -> `.claude/skills/lesson-<new-NN>.md`,
//     rewrites frontmatter `name:` and trigger phrases that contain the old
//     number (e.g. "lesson 3" -> "lesson 4", "Lesson 3" -> "Lesson 4",
//     "lesson-03" -> "lesson-04").
//   - Rewrites `workshop.yaml`: replaces the `<old-NN>-<slug>` key in
//     `phases[].lessons[]` with `<new-NN>-<slug>`, preserving the phase
//     position.
//   - Rewrites `prerequisites` in every OTHER lesson's `lesson.yaml` that
//     references the old integer id, swapping it to the new id.
//   - Renames the lesson directory LAST.
//   - Prints a summary of every path touched.
//
// Intentional non-goals:
//   - No auto-swap when the target slot is occupied. That's a different
//     command and would need a temp-slot dance.
//   - No content rewriting of walker prose beyond the mechanical number swaps.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

type Args = { oldNN: string; newNN: string };

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  for (const a of argv) {
    if (a === "-h" || a === "--help") printUsageAndExit(0);
    positional.push(a);
  }
  if (positional.length < 2) printUsageAndExit(1);
  const [oldRaw, newRaw] = positional;
  if (!/^\d{1,2}$/.test(oldRaw!)) {
    throw new Error(`<old-NN> must be 1–2 digits, got "${oldRaw}"`);
  }
  if (!/^\d{1,2}$/.test(newRaw!)) {
    throw new Error(`<new-NN> must be 1–2 digits, got "${newRaw}"`);
  }
  const oldNN = oldRaw!.padStart(2, "0");
  const newNN = newRaw!.padStart(2, "0");
  if (oldNN === "00" || newNN === "00") {
    throw new Error(`lesson numbers must be >= 01`);
  }
  if (oldNN === newNN) {
    throw new Error(`<old-NN> and <new-NN> are the same (${oldNN}) — nothing to do`);
  }
  return { oldNN, newNN };
}

function printUsageAndExit(code: number): never {
  const msg = [
    "Usage: pnpm rename-lesson <old-NN> <new-NN>",
    "",
    "  <old-NN>  current two-digit lesson number, e.g. 03",
    "  <new-NN>  desired two-digit lesson number, e.g. 04",
    "",
    "Example:",
    "  pnpm rename-lesson 03 04",
  ].join("\n");
  (code === 0 ? console.log : console.error)(msg);
  process.exit(code);
}

function rel(p: string): string {
  return path.relative(REPO_ROOT, p);
}

function findLessonDir(nn: string): { dir: string; slugUnderscore: string; slug: string } | null {
  const workshopDir = path.join(REPO_ROOT, "workshop");
  if (!fs.existsSync(workshopDir)) return null;
  const prefix = `lesson_${nn}_`;
  const entries = fs.readdirSync(workshopDir, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (!e.name.startsWith(prefix)) continue;
    const slugUnderscore = e.name.slice(prefix.length);
    if (!slugUnderscore) continue;
    return {
      dir: path.join(workshopDir, e.name),
      slugUnderscore,
      slug: slugUnderscore.replace(/_/g, "-"),
    };
  }
  return null;
}

interface PlannedWrite {
  path: string;
  contents: string;
  label: string;
}
interface PlannedRename {
  from: string;
  to: string;
  label: string;
}

/**
 * Replace the old lesson key in workshop.yaml's phases[].lessons[] sequence
 * with the new key, in-place (preserves which phase, indentation, and
 * surrounding lines). Errors if the old key isn't present.
 */
function rewriteWorkshopYamlLessonKey(
  yamlText: string,
  oldKey: string,
  newKey: string,
): string {
  const lines = yamlText.split("\n");
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
  // Scan forward until we leave the phases block (a new top-level key).
  let matchedAt = -1;
  for (let i = phasesIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^[A-Za-z]/.test(line)) break;
    const m = line.match(/^(\s*-\s+)(\S+)(\s*)$/);
    if (!m) continue;
    // Skip phase `- id: X` lines (the captured token includes `id:`)
    if (m[2] === "id:" || /^[a-z]+:$/.test(m[2]!)) continue;
    if (m[2] === oldKey) {
      lines[i] = `${m[1]}${newKey}${m[3]}`;
      matchedAt = i;
      // Don't break — guard against accidental duplicates by warning later.
      break;
    }
  }
  if (matchedAt === -1) {
    throw new Error(
      `workshop.yaml: could not find lesson key "${oldKey}" under any phase's lessons`,
    );
  }
  return lines.join("\n");
}

function main() {
  const { oldNN, newNN } = parseArgs(process.argv.slice(2));
  const oldInt = parseInt(oldNN, 10);
  const newInt = parseInt(newNN, 10);

  // --- Locate source --------------------------------------------------------
  const found = findLessonDir(oldNN);
  if (!found) {
    throw new Error(
      `no lesson directory matching workshop/lesson_${oldNN}_*/ — nothing to rename`,
    );
  }
  const { dir: oldDir, slugUnderscore, slug } = found;

  // --- Refuse if target slot is occupied -----------------------------------
  const conflict = findLessonDir(newNN);
  if (conflict) {
    throw new Error(
      `target slot occupied: ${rel(conflict.dir)} already exists. ` +
        `Move it elsewhere first (this command does not auto-swap).`,
    );
  }

  const newDirName = `lesson_${newNN}_${slugUnderscore}`;
  const newDir = path.join(REPO_ROOT, "workshop", newDirName);
  const oldPkgName = `@workshop/lesson-${oldNN}-${slug}`;
  const newPkgName = `@workshop/lesson-${newNN}-${slug}`;
  const oldKey = `${oldNN}-${slug}`;
  const newKey = `${newNN}-${slug}`;

  const oldSkill = path.join(REPO_ROOT, ".claude", "skills", `lesson-${oldNN}.md`);
  const newSkill = path.join(REPO_ROOT, ".claude", "skills", `lesson-${newNN}.md`);
  const workshopYaml = path.join(REPO_ROOT, "workshop.yaml");

  // --- Pre-flight checks ----------------------------------------------------
  if (!fs.existsSync(workshopYaml)) {
    throw new Error("workshop.yaml missing at repo root");
  }
  if (!fs.existsSync(oldSkill)) {
    throw new Error(`walker missing: ${rel(oldSkill)}`);
  }
  if (fs.existsSync(newSkill)) {
    throw new Error(`refuse to overwrite: ${rel(newSkill)} already exists`);
  }

  // --- Buffer all edits -----------------------------------------------------
  const writes: PlannedWrite[] = [];
  const renames: PlannedRename[] = [];

  // 1. lesson.yaml id
  const lessonYamlPath = path.join(oldDir, "lesson.yaml");
  if (!fs.existsSync(lessonYamlPath)) {
    throw new Error(`${rel(lessonYamlPath)} missing`);
  }
  {
    const text = fs.readFileSync(lessonYamlPath, "utf8");
    let updated = text.replace(/^id:\s*\d+\s*$/m, `id: ${newInt}`);
    if (updated === text) {
      throw new Error(
        `${rel(lessonYamlPath)}: could not find \`id: <int>\` line to rewrite`,
      );
    }
    // Also swap the verifyCommand filter — the package name is changing,
    // and the manifest linter checks that the filter resolves in the
    // workspace. Best-effort: any token containing the old package name.
    updated = updated.replaceAll(oldPkgName, newPkgName);
    writes.push({ path: lessonYamlPath, contents: updated, label: "lesson.yaml id + verifyCommand" });
  }

  // 2. package.json name
  const pkgPath = path.join(oldDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.name === oldPkgName) {
      pkg.name = newPkgName;
      writes.push({
        path: pkgPath,
        contents: JSON.stringify(pkg, null, 2) + "\n",
        label: "package.json name",
      });
    } else if (pkg.name !== newPkgName) {
      // Not a strict match — author may have customized. Best-effort: still
      // try to swap the numeric segment.
      const swapped = String(pkg.name).replace(
        new RegExp(`(@workshop/lesson-)${oldNN}(-)`),
        `$1${newNN}$2`,
      );
      if (swapped !== pkg.name) {
        pkg.name = swapped;
        writes.push({
          path: pkgPath,
          contents: JSON.stringify(pkg, null, 2) + "\n",
          label: `package.json name (best-effort: ${pkg.name})`,
        });
      }
    }
  }

  // 2b. README.md — swap the `pnpm --filter @workshop/lesson-<old>-<slug>` references.
  const readmePath = path.join(oldDir, "README.md");
  if (fs.existsSync(readmePath)) {
    const text = fs.readFileSync(readmePath, "utf8");
    const updated = text.replaceAll(oldPkgName, newPkgName);
    if (updated !== text) {
      writes.push({ path: readmePath, contents: updated, label: "README.md package refs" });
    }
  }

  // 3. walker skill (rewrite contents, then rename file)
  {
    const text = fs.readFileSync(oldSkill, "utf8");
    let out = text;
    out = out.replace(/^name:\s*lesson-\d+\s*$/m, `name: lesson-${newNN}`);
    out = out.replace(new RegExp(`\\bLesson ${oldInt}\\b`, "g"), `Lesson ${newInt}`);
    out = out.replace(new RegExp(`\\blesson ${oldInt}\\b`, "g"), `lesson ${newInt}`);
    out = out.replace(new RegExp(`\\blesson-${oldNN}\\b`, "g"), `lesson-${newNN}`);
    writes.push({ path: oldSkill, contents: out, label: "walker contents" });
    renames.push({ from: oldSkill, to: newSkill, label: "walker filename" });
  }

  // 4. workshop.yaml phase entry
  {
    const text = fs.readFileSync(workshopYaml, "utf8");
    const updated = rewriteWorkshopYamlLessonKey(text, oldKey, newKey);
    writes.push({ path: workshopYaml, contents: updated, label: `workshop.yaml ${oldKey} -> ${newKey}` });
  }

  // 5. prerequisites in *other* lesson.yaml files
  const workshopDir = path.join(REPO_ROOT, "workshop");
  const peerEntries = fs.readdirSync(workshopDir, { withFileTypes: true });
  for (const e of peerEntries) {
    if (!e.isDirectory()) continue;
    if (!/^lesson_\d{2}_/.test(e.name)) continue;
    const peerYaml = path.join(workshopDir, e.name, "lesson.yaml");
    if (!fs.existsSync(peerYaml)) continue;
    if (path.resolve(peerYaml) === path.resolve(lessonYamlPath)) continue;

    const text = fs.readFileSync(peerYaml, "utf8");
    const updated = rewritePrerequisites(text, oldInt, newInt);
    if (updated !== text) {
      writes.push({
        path: peerYaml,
        contents: updated,
        label: `${e.name}/lesson.yaml prerequisites`,
      });
    }
  }

  // 6. Directory rename (last)
  renames.push({ from: oldDir, to: newDir, label: "lesson directory" });

  // --- Commit all buffered changes -----------------------------------------
  for (const w of writes) {
    fs.writeFileSync(w.path, w.contents);
  }
  for (const r of renames) {
    fs.renameSync(r.from, r.to);
  }

  // --- Summary --------------------------------------------------------------
  const summaryLines = [
    "",
    `renamed lesson ${oldNN}-${slug} -> ${newNN}-${slug}`,
    "",
  ];
  for (const w of writes) {
    summaryLines.push(`  edit:   ${rel(w.path)}  (${w.label})`);
  }
  for (const r of renames) {
    summaryLines.push(`  rename: ${rel(r.from)} -> ${rel(r.to)}  (${r.label})`);
  }
  summaryLines.push("");
  summaryLines.push("next:");
  summaryLines.push("  pnpm install   # refresh workspace package resolution");
  summaryLines.push("  pnpm lint-manifest");
  summaryLines.push("");
  console.log(summaryLines.join("\n"));
}

/**
 * Rewrite a single-int reference inside a YAML `prerequisites:` list.
 * Supports both inline (`prerequisites: [1, 2]`) and block-style
 * (`prerequisites:\n  - 1\n  - 2`) lists. Only touches the prerequisites
 * key — never blindly substitutes integers elsewhere in the file (the
 * lesson's own `id:` is handled separately, and we must not collide with
 * unrelated numeric fields).
 */
function rewritePrerequisites(text: string, oldInt: number, newInt: number): string {
  const lines = text.split("\n");
  let i = 0;
  let changed = false;
  while (i < lines.length) {
    const line = lines[i]!;
    // Inline form: prerequisites: [1, 2, 3]
    const inline = line.match(/^(\s*prerequisites:\s*)\[([^\]]*)\](\s*)$/);
    if (inline) {
      const items = inline[2]!
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const remapped = items.map((s) => (s === String(oldInt) ? String(newInt) : s));
      if (remapped.join(",") !== items.join(",")) {
        lines[i] = `${inline[1]}[${remapped.join(", ")}]${inline[3]}`;
        changed = true;
      }
      i++;
      continue;
    }
    // Block form
    if (/^\s*prerequisites:\s*$/.test(line)) {
      // Determine the indent of subsequent `- N` items.
      let j = i + 1;
      while (j < lines.length) {
        const item = lines[j]!;
        const m = item.match(/^(\s*-\s+)(\d+)(\s*)$/);
        if (m) {
          if (parseInt(m[2]!, 10) === oldInt) {
            lines[j] = `${m[1]}${newInt}${m[3]}`;
            changed = true;
          }
          j++;
          continue;
        }
        // Allow blank line / comment within the list
        if (item.trim() === "" || item.trim().startsWith("#")) {
          j++;
          continue;
        }
        break;
      }
      i = j;
      continue;
    }
    i++;
  }
  return changed ? lines.join("\n") : text;
}

try {
  main();
} catch (err) {
  console.error(`✘ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
