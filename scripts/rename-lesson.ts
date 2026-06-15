// scripts/rename-lesson.ts
//
// Rename an existing lesson's slug. Sibling to scripts/new-lesson.ts.
//
// Lessons are identified by slug (kebab-case) — there is no lesson number.
// See docs/WORKSHOP_STANDARD.md for the full identity contract.
//
// Usage:
//   pnpm rename-lesson <old-slug> <new-slug>
//
// Example:
//   pnpm rename-lesson joins aggregates-and-joins
//
// What it does (in this order — all edits buffered in memory, then written,
// directory rename happens LAST so an interrupt mid-run can't corrupt state):
//   - Finds `workshop/lesson_<old-slug>/`. Errors if not found, or if
//     `workshop/lesson_<new-slug>/` already exists (refuses to auto-swap).
//   - Rewrites the lesson's `lesson.yaml` `id` to the new slug.
//   - Rewrites the lesson's `package.json` name to `@workshop/lesson-<new-slug>`.
//   - Renames `.claude/skills/lesson-<old-slug>.md` -> `lesson-<new-slug>.md`,
//     rewrites frontmatter `name:` and the obvious slug references.
//   - Rewrites `workshop.yaml`: replaces the `<old-slug>` key in
//     `phases[].lessons[]` with `<new-slug>`, preserving the phase position.
//   - Rewrites `prerequisites` / `onPass.advanceTo` in every OTHER lesson's
//     `lesson.yaml` that references the old slug, swapping it to the new slug.
//   - Renames the lesson directory LAST.
//   - Prints a summary of every path touched.
//
// Intentional non-goals:
//   - No auto-swap when the target slot is occupied. That's a different
//     command and would need a temp-slot dance.
//   - No content rewriting of walker prose beyond the mechanical slug swaps.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Canonical lesson slug. Keep in sync with scripts/lint-manifest.ts.
const SLUG_RE = /^[a-z][a-z0-9-]*$/;

type Args = { oldSlug: string; newSlug: string };

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  for (const a of argv) {
    if (a === "-h" || a === "--help") printUsageAndExit(0);
    positional.push(a);
  }
  if (positional.length < 2) printUsageAndExit(1);
  const [oldSlug, newSlug] = positional;
  if (!SLUG_RE.test(oldSlug!)) {
    throw new Error(`<old-slug> must be slug-form (lowercase letter first, then lowercase alphanumeric + hyphens), got "${oldSlug}"`);
  }
  if (!SLUG_RE.test(newSlug!)) {
    throw new Error(`<new-slug> must be slug-form (lowercase letter first, then lowercase alphanumeric + hyphens), got "${newSlug}"`);
  }
  if (oldSlug === newSlug) {
    throw new Error(`<old-slug> and <new-slug> are the same (${oldSlug}) — nothing to do`);
  }
  return { oldSlug: oldSlug!, newSlug: newSlug! };
}

function printUsageAndExit(code: number): never {
  const msg = [
    "Usage: pnpm rename-lesson <old-slug> <new-slug>",
    "",
    "  <old-slug>  current lesson slug, e.g. joins",
    "  <new-slug>  desired lesson slug, e.g. aggregates-and-joins",
    "",
    "Example:",
    "  pnpm rename-lesson joins aggregates-and-joins",
  ].join("\n");
  (code === 0 ? console.log : console.error)(msg);
  process.exit(code);
}

function rel(p: string): string {
  return path.relative(REPO_ROOT, p);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const { oldSlug, newSlug } = parseArgs(process.argv.slice(2));

  const oldDirName = `lesson_${oldSlug}`;
  const newDirName = `lesson_${newSlug}`;
  const oldDir = path.join(REPO_ROOT, "workshop", oldDirName);
  const newDir = path.join(REPO_ROOT, "workshop", newDirName);

  // --- Locate source --------------------------------------------------------
  if (!fs.existsSync(oldDir)) {
    throw new Error(
      `no lesson directory at workshop/${oldDirName}/ — nothing to rename`,
    );
  }

  // --- Refuse if target slot is occupied -----------------------------------
  if (fs.existsSync(newDir)) {
    throw new Error(
      `target slot occupied: workshop/${newDirName}/ already exists. ` +
        `Move it elsewhere first (this command does not auto-swap).`,
    );
  }

  const oldPkgName = `@workshop/lesson-${oldSlug}`;
  const newPkgName = `@workshop/lesson-${newSlug}`;
  const oldKey = oldSlug;
  const newKey = newSlug;

  const oldSkill = path.join(REPO_ROOT, ".claude", "skills", `lesson-${oldSlug}.md`);
  const newSkill = path.join(REPO_ROOT, ".claude", "skills", `lesson-${newSlug}.md`);
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
    let updated = text.replace(/^id:\s*\S+\s*$/m, `id: ${newSlug}`);
    if (updated === text) {
      throw new Error(
        `${rel(lessonYamlPath)}: could not find \`id: <slug>\` line to rewrite`,
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
      // try to swap the slug segment.
      const swapped = String(pkg.name).replace(
        new RegExp(`(@workshop/lesson-)${escapeRe(oldSlug)}($|[^a-z0-9-])`),
        `$1${newSlug}$2`,
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

  // 2b. README.md — swap the `pnpm --filter @workshop/lesson-<old>` references.
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
    out = out.replace(/^name:\s*lesson-\S+\s*$/m, `name: lesson-${newSlug}`);
    out = out.replace(new RegExp(`\\blesson_${escapeRe(oldSlug)}\\b`, "g"), `lesson_${newSlug}`);
    out = out.replace(new RegExp(`\\blesson-${escapeRe(oldSlug)}\\b`, "g"), `lesson-${newSlug}`);
    out = out.replaceAll(oldPkgName, newPkgName);
    writes.push({ path: oldSkill, contents: out, label: "walker contents" });
    renames.push({ from: oldSkill, to: newSkill, label: "walker filename" });
  }

  // 4. workshop.yaml phase entry
  {
    const text = fs.readFileSync(workshopYaml, "utf8");
    const updated = rewriteWorkshopYamlLessonKey(text, oldKey, newKey);
    writes.push({ path: workshopYaml, contents: updated, label: `workshop.yaml ${oldKey} -> ${newKey}` });
  }

  // 5. prerequisites + advanceTo in *other* lesson.yaml files
  const workshopDir = path.join(REPO_ROOT, "workshop");
  const peerEntries = fs.readdirSync(workshopDir, { withFileTypes: true });
  for (const e of peerEntries) {
    if (!e.isDirectory()) continue;
    if (!e.name.startsWith("lesson_")) continue;
    const peerYaml = path.join(workshopDir, e.name, "lesson.yaml");
    if (!fs.existsSync(peerYaml)) continue;
    if (path.resolve(peerYaml) === path.resolve(lessonYamlPath)) continue;

    const text = fs.readFileSync(peerYaml, "utf8");
    const updated = rewriteSlugRefs(text, oldSlug, newSlug);
    if (updated !== text) {
      writes.push({
        path: peerYaml,
        contents: updated,
        label: `${e.name}/lesson.yaml prerequisites/advanceTo`,
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
    `renamed lesson ${oldSlug} -> ${newSlug}`,
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
 * Rewrite a slug reference inside a YAML `prerequisites:` list and the
 * `onPass.advanceTo:` scalar. Supports both inline (`prerequisites: [a, b]`)
 * and block-style (`prerequisites:\n  - a\n  - b`) lists. Only touches those
 * keys — never blindly substitutes the slug elsewhere in the file (the
 * lesson's own `id:` is handled separately).
 */
function rewriteSlugRefs(text: string, oldSlug: string, newSlug: string): string {
  const lines = text.split("\n");
  let i = 0;
  let changed = false;
  while (i < lines.length) {
    const line = lines[i]!;

    // advanceTo: <slug>
    const adv = line.match(/^(\s*advanceTo:\s*)(\S+)(\s*)$/);
    if (adv && adv[2] === oldSlug) {
      lines[i] = `${adv[1]}${newSlug}${adv[3]}`;
      changed = true;
      i++;
      continue;
    }

    // Inline form: prerequisites: [a, b, c]
    const inline = line.match(/^(\s*prerequisites:\s*)\[([^\]]*)\](\s*)$/);
    if (inline) {
      const items = inline[2]!
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const remapped = items.map((s) => (s === oldSlug ? newSlug : s));
      if (remapped.join(",") !== items.join(",")) {
        lines[i] = `${inline[1]}[${remapped.join(", ")}]${inline[3]}`;
        changed = true;
      }
      i++;
      continue;
    }
    // Block form
    if (/^\s*prerequisites:\s*$/.test(line)) {
      let j = i + 1;
      while (j < lines.length) {
        const item = lines[j]!;
        const m = item.match(/^(\s*-\s+)(\S+)(\s*)$/);
        if (m) {
          if (m[2] === oldSlug) {
            lines[j] = `${m[1]}${newSlug}${m[3]}`;
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
