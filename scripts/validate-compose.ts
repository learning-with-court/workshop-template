// scripts/validate-compose.ts — validate a compose-model workshop's SOURCE layout
//                              (canonical series layout, task 3).
//
// Checks the authoring layout is well-formed, then delegates cumulative-tree
// correctness to `compose --dry-run` (which self-verifies every position).
// Run in CI + locally before generating/shipping.
//
// Usage: pnpm exec tsx scripts/validate-compose.ts

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const errors: string[] = [];
const warnings: string[] = [];

function read(p: string): string | null {
  try { return readFileSync(join(REPO, p), "utf8"); } catch { return null; }
}

// ---- 1. series.yaml: must have `short` + ≥1 ordered workshop ----
const seriesText = read("series.yaml");
if (!seriesText) {
  errors.push("series.yaml missing at repo root");
} else {
  if (!/^short:\s*\S+/m.test(seriesText))
    errors.push("series.yaml: missing required `short` field (the tag namespace)");

  // parse workshops list: lines under `workshops:` that have `- id: <ws>`
  const wsIds: string[] = [];
  let inWorkshops = false;
  for (const line of seriesText.split("\n")) {
    if (/^workshops:\s*$/.test(line)) { inWorkshops = true; continue; }
    if (!inWorkshops) continue;
    const idMatch = line.match(/^\s*-\s*id:\s*(\S+)/);
    if (idMatch) { wsIds.push(idMatch[1]!.replace(/["']/g, "")); continue; }
    if (/^\S/.test(line) && !/^workshops:/.test(line)) inWorkshops = false;
  }
  if (wsIds.length === 0)
    errors.push("series.yaml: `workshops` list is empty — need ≥1 workshop entry");

  // ---- 1b. optional series.settings.overlay.json (repo-level): must parse as JSON if present ----
  if (existsSync(join(REPO, "series.settings.overlay.json"))) {
    const seriesOverlayText = read("series.settings.overlay.json");
    if (seriesOverlayText !== null) {
      try {
        JSON.parse(seriesOverlayText);
      } catch {
        errors.push("series.settings.overlay.json: invalid JSON — must be a valid JSON object");
      }
    }
  }

  // ---- 2. per-workshop checks ----
  for (const ws of wsIds) {
    const wsDir = `workshops/${ws}`;
    if (!existsSync(join(REPO, wsDir)))
      { errors.push(`workshops/${ws}/: directory missing`); continue; }

    const wsYamlText = read(`${wsDir}/workshop.yaml`);
    if (!wsYamlText) {
      errors.push(`${wsDir}/workshop.yaml missing`);
      continue;
    }

    if (!read(`${wsDir}/landing.md`))
      errors.push(`${wsDir}/landing.md missing`);

    // parse lesson slugs from phases[].lessons
    const slugs: string[] = [];
    let inLessons = false;
    for (const line of wsYamlText.split("\n")) {
      if (/^\s*lessons:\s*$/.test(line)) { inLessons = true; continue; }
      if (inLessons) {
        const m = line.match(/^\s*-\s*([a-z][a-z0-9-]*)\s*$/);
        if (m) { slugs.push(m[1]!); continue; }
        if (/^\S/.test(line) || /^\s*\w+:/.test(line)) inLessons = false;
      }
    }
    if (slugs.length === 0) {
      errors.push(`${wsDir}/workshop.yaml: no lessons under phases[].lessons`);
      continue;
    }

    // ---- 2b. optional settings.overlay.json: must parse as JSON if present ----
    const overlayPath = join(REPO, wsDir, "settings.overlay.json");
    if (existsSync(overlayPath)) {
      const overlayText = read(`${wsDir}/settings.overlay.json`);
      if (overlayText !== null) {
        try {
          JSON.parse(overlayText);
        } catch {
          errors.push(`${wsDir}/settings.overlay.json: invalid JSON — must be a valid JSON object`);
        }
      }
    }
    // fixtures/ is optional and free-form — no assertions needed

    // ---- 3. per-lesson checks ----
    const lessonsRoot = join(REPO, wsDir, "lessons");
    const lessonDirs = existsSync(lessonsRoot) ? readdirSync(lessonsRoot) : [];
    for (const slug of slugs) {
      const dir = lessonDirs.find((d) => d.replace(/^\d+-/, "") === slug);
      if (!dir) {
        errors.push(`${wsDir}/lessons/<NN>-${slug}/: directory missing`);
        continue;
      }
      const base = `${wsDir}/lessons/${dir}`;
      if (!read(`${base}/lesson.yaml`)) errors.push(`${base}/lesson.yaml missing`);
      if (!read(`${base}/README.md`))   errors.push(`${base}/README.md missing`);
      if (!read(`${base}/coach.md`))    errors.push(`${base}/coach.md missing`);
      // solution/ warning (not error) — cumulative downstream needs it
      if (!existsSync(join(REPO, base, "solution")))
        warnings.push(`${base}/solution/: absent — downstream lessons won't inherit this lesson's work`);
    }
  }
}

// ---- 4. structural prerequisites ----
if (!existsSync(join(REPO, "base")))
  errors.push("base/ scaffold dir missing");
if (!existsSync(join(REPO, "scripts", "compose.ts")))
  errors.push("scripts/compose.ts (the generator) missing");

// ---- 5. delegate to compose --dry-run (self-verifies cumulative correctness) ----
if (errors.length === 0) {
  // Use pnpm exec tsx when a pnpm workspace is present; fall back to tsx in PATH
  const hasPnpm = existsSync(join(REPO, "pnpm-workspace.yaml")) || existsSync(join(REPO, "pnpm-lock.yaml"));
  const tsxCmd = hasPnpm ? ["pnpm", "exec", "tsx"] : ["npx", "-y", "tsx"];
  try {
    const out = execFileSync(tsxCmd[0]!, [...tsxCmd.slice(1), "scripts/compose.ts", "--dry-run"], {
      cwd: REPO, encoding: "utf8",
    });
    if (!/self-verify:.*OK/.test(out))
      errors.push("compose --dry-run did not report self-verify OK:\n" + out);
  } catch (e) {
    errors.push("compose --dry-run failed:\n" + (e instanceof Error ? e.message : String(e)));
  }
}

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length === 0) {
  console.log("validate-compose: OK");
  process.exit(0);
}
for (const e of errors) console.error(`✘ ${e}`);
process.exit(1);
