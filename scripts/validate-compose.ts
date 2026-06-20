// scripts/validate-compose.ts — validate a compose-model workshop's SOURCE layout.
//
// Checks the authoring layout is well-formed, then delegates the cumulative-tree
// correctness to `compose --dry-run` (which self-verifies every position). Run in CI
// + locally before generating/shipping.
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

// --- workshop.yaml: composeShort + ordered lessons ---
const ws = read("workshop.yaml");
if (!ws) {
  errors.push("workshop.yaml missing at repo root");
} else {
  if (!/^composeShort:\s*\S+/m.test(ws))
    errors.push("workshop.yaml: missing required `composeShort` (the tag namespace + .workshop/<short>/ segment)");

  // ordered lesson slugs from phases[].lessons
  const slugs: string[] = [];
  let inLessons = false;
  for (const line of ws.split("\n")) {
    if (/^\s*lessons:\s*$/.test(line)) { inLessons = true; continue; }
    if (inLessons) {
      const m = line.match(/^\s*-\s*([a-z][a-z0-9-]*)\s*$/);
      if (m) { slugs.push(m[1]!); continue; }
      if (/^\S/.test(line) || /^\s*\w+:/.test(line)) inLessons = false;
    }
  }
  if (slugs.length === 0) {
    errors.push("workshop.yaml: no lessons under phases[].lessons");
  } else {
    // each slug must have a lessons/<NN>-<slug>/ dir with the required files
    const lessonDirs = existsSync(join(REPO, "lessons")) ? readdirSync(join(REPO, "lessons")) : [];
    for (const slug of slugs) {
      const dir = lessonDirs.find((d) => d.replace(/^\d+-/, "") === slug);
      if (!dir) { errors.push(`lesson "${slug}": no lessons/<NN>-${slug}/ source dir`); continue; }
      const base = `lessons/${dir}`;
      if (!read(`${base}/lesson.yaml`)) errors.push(`${base}/lesson.yaml missing`);
      if (!read(`${base}/README.md`)) errors.push(`${base}/README.md missing`);
      // a shipped test is required (the verification contract)
      const testDir = join(REPO, base, "test");
      const hasTest = existsSync(testDir) &&
        readdirSync(testDir, { recursive: true } as never).some((f) => String(f).includes(".test."));
      if (!hasTest) errors.push(`${base}/test/: no *.test.* shipped test found`);
      // solution/ is the cumulative answer — warn (not error) if absent
      if (!existsSync(join(REPO, base, "solution")))
        warnings.push(`${base}/solution/: absent — downstream lessons won't inherit this lesson's work`);
      // lesson.yaml should use an advisory vitest verifyCommand
      const ly = read(`${base}/lesson.yaml`) ?? "";
      if (ly && !/verifyCommand:.*vitest run.*\|\|\s*true/.test(ly))
        warnings.push(`${base}/lesson.yaml: verifyCommand isn't the advisory form (pnpm exec vitest run … || true)`);
    }
  }
}

// --- base/ scaffold present ---
if (!existsSync(join(REPO, "base"))) errors.push("base/ scaffold dir missing");
if (!existsSync(join(REPO, "scripts", "compose.ts"))) errors.push("scripts/compose.ts (the generator) missing");

// --- delegate cumulative correctness to compose --dry-run (self-verifies every position) ---
if (errors.length === 0) {
  try {
    const out = execFileSync("pnpm", ["exec", "tsx", "scripts/compose.ts", "--dry-run"], {
      cwd: REPO, encoding: "utf8",
    });
    if (!/self-verify:.*OK/.test(out)) errors.push("compose --dry-run did not report self-verify OK:\n" + out);
  } catch (e) {
    errors.push("compose --dry-run failed:\n" + (e instanceof Error ? e.message : String(e)));
  }
}

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length === 0) {
  console.log("✔ compose-model layout valid");
  process.exit(0);
}
for (const e of errors) console.error(`✘ ${e}`);
process.exit(1);
