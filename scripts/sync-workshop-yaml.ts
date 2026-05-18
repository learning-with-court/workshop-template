// scripts/sync-workshop-yaml.ts
//
// Rebuild workshop.yaml `phases[].lessons[]` arrays from filesystem state.
//
// Usage:
//   pnpm sync-workshop-yaml           # dry-run, print diff
//   pnpm sync-workshop-yaml --write   # apply rebuild to workshop.yaml
//   pnpm sync-workshop-yaml --check   # diff-only; exit non-zero if drift
//
// What it does:
//   - Scans workshop/lesson_<NN>_<slug>/ dirs for lesson.yaml files.
//     Each becomes manifest key "<NN>-<slug-with-dashes>".
//   - Reads workshop.yaml, records which phase each existing key sits in.
//   - Builds new phases[].lessons[]:
//       * filesystem lesson present in workshop.yaml -> keep its phase
//       * filesystem lesson missing from workshop.yaml -> phase A + warn
//       * manifest key with no matching dir -> drop + warn
//       * within each phase, sort by NN ascending
//   - Diff vs current, with +/-/~ prefixes.
//
// YAML preservation: we only rewrite the trailing `phases:` block (it's the
// last top-level key in workshop.yaml by convention). Every other byte of
// the file is preserved verbatim.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

type Phase = { id: string; title: string; lessons: string[] };
type Workshop = { phases: Phase[]; [k: string]: unknown };

type Args = { write: boolean; check: boolean };

function parseArgs(argv: string[]): Args {
  let write = false;
  let check = false;
  for (const a of argv) {
    if (a === "--write") write = true;
    else if (a === "--check") check = true;
    else if (a === "-h" || a === "--help") {
      printUsageAndExit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      printUsageAndExit(1);
    }
  }
  if (write && check) {
    console.error("--write and --check are mutually exclusive");
    process.exit(1);
  }
  return { write, check };
}

function printUsageAndExit(code: number): never {
  const msg = [
    "Usage: pnpm sync-workshop-yaml [--write|--check]",
    "",
    "  (no flag)  dry-run; print diff of workshop.yaml vs filesystem",
    "  --write    apply the rebuild to workshop.yaml",
    "  --check    exit non-zero if there is drift (CI/lefthook use)",
  ].join("\n");
  (code === 0 ? console.log : console.error)(msg);
  process.exit(code);
}

function dirToKey(dir: string): { key: string; nn: string } | null {
  // "lesson_03_joins_and_aggregates" -> { key: "03-joins-and-aggregates", nn: "03" }
  const m = dir.match(/^lesson_(\d{2})_(.+)$/);
  if (!m) return null;
  return { key: `${m[1]}-${m[2]!.replace(/_/g, "-")}`, nn: m[1]! };
}

function scanFilesystemLessons(repoRoot: string): { key: string; nn: string }[] {
  const workshopDir = path.join(repoRoot, "workshop");
  if (!fs.existsSync(workshopDir)) return [];
  const entries = fs.readdirSync(workshopDir, { withFileTypes: true });
  const found: { key: string; nn: string }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (!e.name.startsWith("lesson_")) continue;
    const yamlPath = path.join(workshopDir, e.name, "lesson.yaml");
    if (!fs.existsSync(yamlPath)) continue;
    const parsed = dirToKey(e.name);
    if (!parsed) continue;
    found.push(parsed);
  }
  return found.sort((a, b) => a.nn.localeCompare(b.nn));
}

function nnOfKey(key: string): string {
  const m = key.match(/^(\d{2})-/);
  return m ? m[1]! : "99";
}

/**
 * Surgically replace the `phases:` block (a top-level key) in the original
 * text with the freshly serialized version. Assumes `phases:` is the last
 * top-level key (current convention in workshop.yaml).
 */
function replacePhasesBlock(originalText: string, phases: Phase[]): string {
  const lines = originalText.split("\n");
  // Find the line index where `phases:` starts at column 0.
  let phasesStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^phases:\s*$/.test(lines[i]!)) {
      phasesStart = i;
      break;
    }
  }
  if (phasesStart < 0) {
    throw new Error("workshop.yaml: could not locate top-level `phases:` key");
  }
  // Find the line where phases block ends — next top-level key (a line that
  // starts with a non-whitespace, non-`#` char, has a colon, and isn't a
  // YAML list marker). Otherwise EOF.
  let phasesEnd = lines.length;
  for (let i = phasesStart + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.length === 0) continue;
    if (/^[A-Za-z_][\w-]*\s*:/.test(l)) {
      phasesEnd = i;
      break;
    }
  }
  // Render new phases block. js-yaml emits "phases:\n  - id: ..." etc.
  const dumped = YAML.dump({ phases }, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
  });
  // Trim trailing newline; we'll reattach the original suffix.
  const dumpedTrimmed = dumped.endsWith("\n") ? dumped.slice(0, -1) : dumped;

  const before = lines.slice(0, phasesStart);
  const after = lines.slice(phasesEnd);
  return [...before, ...dumpedTrimmed.split("\n"), ...after].join("\n");
}

interface SyncResult {
  current: Phase[];
  rebuilt: Phase[];
  diffLines: string[];
  warnings: string[];
  changed: boolean;
}

function syncPhases(workshop: Workshop, fsLessons: { key: string; nn: string }[]): SyncResult {
  const warnings: string[] = [];
  const currentPhases: Phase[] = workshop.phases.map((p) => ({
    id: p.id,
    title: p.title,
    lessons: [...p.lessons],
  }));

  // key -> phase id in current workshop.yaml
  const keyToPhase = new Map<string, string>();
  for (const p of currentPhases) {
    for (const k of p.lessons) {
      keyToPhase.set(k, p.id);
    }
  }

  const fsKeys = new Set(fsLessons.map((l) => l.key));

  // Manifest keys that point at nothing on disk
  const dropped: { key: string; phase: string }[] = [];
  for (const [key, phaseId] of keyToPhase.entries()) {
    if (!fsKeys.has(key)) {
      dropped.push({ key, phase: phaseId });
      warnings.push(
        `- "${key}" referenced in phase ${phaseId} but no matching workshop/lesson_* dir exists — dropping`,
      );
    }
  }

  // Build rebuilt phases by copying current shape and reassigning lessons
  const phaseIds = currentPhases.map((p) => p.id);
  const defaultPhaseId = phaseIds[0] ?? "A";
  const rebuilt: Phase[] = currentPhases.map((p) => ({
    id: p.id,
    title: p.title,
    lessons: [],
  }));
  const findPhase = (id: string): Phase => {
    const found = rebuilt.find((p) => p.id === id);
    if (found) return found;
    // Phase referenced by map but no longer in rebuilt (shouldn't happen since
    // we cloned from current). Fall back to default phase.
    return rebuilt.find((p) => p.id === defaultPhaseId)!;
  };

  for (const { key } of fsLessons) {
    const prevPhase = keyToPhase.get(key);
    if (prevPhase !== undefined) {
      findPhase(prevPhase).lessons.push(key);
    } else {
      const target = rebuilt.find((p) => p.id === defaultPhaseId);
      if (!target) {
        warnings.push(
          `+ "${key}" found on disk but no phases exist in workshop.yaml — cannot place`,
        );
        continue;
      }
      target.lessons.push(key);
      warnings.push(
        `+ "${key}" found on disk but missing from workshop.yaml — placed in phase ${defaultPhaseId}. Move to a different phase if needed.`,
      );
    }
  }

  // Sort each phase's lessons by NN
  for (const p of rebuilt) {
    p.lessons.sort((a, b) => nnOfKey(a).localeCompare(nnOfKey(b)));
  }

  // Build the diff
  const diffLines: string[] = [];
  const currentByKey = new Map<string, { phase: string; index: number }>();
  for (const p of currentPhases) {
    p.lessons.forEach((k, i) => currentByKey.set(k, { phase: p.id, index: i }));
  }
  const rebuiltByKey = new Map<string, { phase: string; index: number }>();
  for (const p of rebuilt) {
    p.lessons.forEach((k, i) => rebuiltByKey.set(k, { phase: p.id, index: i }));
  }

  const allKeys = new Set<string>([...currentByKey.keys(), ...rebuiltByKey.keys()]);
  const sortedKeys = [...allKeys].sort((a, b) => nnOfKey(a).localeCompare(nnOfKey(b)) || a.localeCompare(b));
  for (const key of sortedKeys) {
    const cur = currentByKey.get(key);
    const next = rebuiltByKey.get(key);
    if (cur && !next) {
      diffLines.push(`- ${key}  (was in phase ${cur.phase}; removed — no matching dir)`);
    } else if (!cur && next) {
      diffLines.push(`+ ${key}  (added to phase ${next.phase})`);
    } else if (cur && next) {
      if (cur.phase !== next.phase) {
        diffLines.push(`~ ${key}  (moved phase ${cur.phase} -> ${next.phase})`);
      } else if (cur.index !== next.index) {
        diffLines.push(`~ ${key}  (resorted within phase ${cur.phase}: index ${cur.index} -> ${next.index})`);
      }
    }
  }

  const changed = diffLines.length > 0;
  return { current: currentPhases, rebuilt, diffLines, warnings, changed };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const wsPath = path.join(REPO_ROOT, "workshop.yaml");
  if (!fs.existsSync(wsPath)) {
    console.error("workshop.yaml not found at repo root");
    process.exit(1);
  }
  const wsText = fs.readFileSync(wsPath, "utf8");
  const wsParsed = YAML.load(wsText) as Workshop | null;
  if (!wsParsed || typeof wsParsed !== "object" || !Array.isArray((wsParsed as Workshop).phases)) {
    console.error("workshop.yaml: missing or invalid `phases` array");
    process.exit(1);
  }

  const fsLessons = scanFilesystemLessons(REPO_ROOT);
  const result = syncPhases(wsParsed as Workshop, fsLessons);

  for (const w of result.warnings) {
    console.warn(`warn: ${w}`);
  }

  if (!result.changed) {
    console.log("workshop.yaml is in sync with filesystem.");
    process.exit(0);
  }

  console.log("");
  console.log("diff (workshop.yaml -> filesystem-rebuilt):");
  for (const line of result.diffLines) {
    console.log(`  ${line}`);
  }
  console.log("");

  if (args.check) {
    console.error("drift detected; run `pnpm sync-workshop-yaml --write` to apply.");
    process.exit(1);
  }

  if (args.write) {
    let next = replacePhasesBlock(wsText, result.rebuilt);
    // Preserve trailing-newline policy of the original file.
    if (wsText.endsWith("\n") && !next.endsWith("\n")) next += "\n";
    fs.writeFileSync(wsPath, next);
    console.log("workshop.yaml updated.");
    process.exit(0);
  }

  console.log("(dry-run — pass --write to apply.)");
  process.exit(0);
}

main();
