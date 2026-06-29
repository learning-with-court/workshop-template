// scripts/lint-manifest.ts
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import * as YAML from "js-yaml";
import { z } from "zod";

// Vendored schemas — keep in sync with
// platform/packages/server/src/manifest/schema.ts.
// Cross-repo type sharing isn't worth a published package yet.

const Prereq = z.object({ term: z.string(), desc: z.string() });
const Phase = z.object({
  id: z.string(),
  title: z.string(),
  lessons: z.array(z.string()).min(1),
});
const SeriesBlock = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int().positive(),
});
const Workshop = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["available", "coming-soon"]),
  repo: z.string(),
  tagline: z.string(),
  summary: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  tags: z.array(z.string()),
  install: z.string(),
  youWillBuild: z.array(z.string()),
  prerequisites: z.array(Prereq),
  phases: z.array(Phase),
  series: SeriesBlock.optional(),
  /** Optional prefix for walker skill filenames. Default: "lesson". E.g. "tools-mcp-lesson" → .claude/skills/tools-mcp-lesson-01.md */
  skillPrefix: z.string().optional(),
  /** Optional: primary language of the workshop's runnable code. */
  language: z.string().optional(),
  /** Optional: the test runner command pattern (e.g. "vitest", "pytest", "go test"). Informational. */
  testRunner: z.string().optional(),
  /** Optional: glob patterns the block-edits PreToolUse hook enforces as immutable. Read by .claude/hooks/block-edits.sh. */
  protectedPaths: z.array(z.string()).optional(),
});
const Verify = z.object({
  description: z.string(),
  mustInclude: z.array(z.string()).min(1),
  mustNotInclude: z.array(z.string()).optional(),
});
// Canonical lesson slug: lowercase letter first, then lowercase
// alphanumerics + single hyphens. See docs/WORKSHOP_STANDARD.md.
const Slug = z
  .string()
  .min(1)
  .regex(
    /^[a-z][a-z0-9-]*$/,
    "must be slug-form (lowercase letter first, then lowercase alphanumeric + hyphens)",
  );
// Optional per-lesson live-demo declaration, consumed by scripts/try.ts (`pnpm try`).
// `targetFiles` names the file; `try` names the callable + the fixture to feed it.
const Try = z.object({
  /** Deliverable module under src/, no extension. E.g. "review" → src/review.ts */
  module: z.string(),
  /** Named export to call. */
  export: z.string(),
  /** Fixture path relative to the lesson dir's served root (.workshop/<ws>/lesson_<slug>/). */
  fixture: z.string(),
  /** How to pass the fixture: "json" (parsed, default) or "text" (raw string). */
  fixtureAs: z.enum(["json", "text"]).optional(),
});
const Lesson = z.object({
  id: Slug,
  title: z.string(),
  blurb: z.string(),
  prerequisites: z.array(Slug),
  targetFiles: z.array(z.string()),
  verifyCommand: z.string(),
  verify: Verify,
  /** Optional live-demo runner declaration (`pnpm try`). */
  try: Try.optional(),
  onPass: z.object({
    advanceTo: Slug.optional(),
    feedback: z.string(),
  }),
});

export interface LintResult {
  errors: string[];
}

export async function lintManifest(opts: {
  repoRoot: string;
  /** Optional sub-path for monorepo workshops. E.g. ".workshop/claude-code" */
  workshopRoot?: string;
}): Promise<LintResult> {
  const errors: string[] = [];
  const root = opts.repoRoot;
  // workshopRoot is the directory containing workshop.yaml + landing.md.
  // For monorepo workshops it's a sub-path; for single-workshop repos it's the repo root.
  const wsDir = opts.workshopRoot ? path.join(root, opts.workshopRoot) : root;
  // Lesson dirs, by layout:
  //  - compose model: lessons/<NN>-<slug>/ at the repo root (the NN prefix is disk-ordering only)
  //  - unified compose model: <workshopRoot>/lessons/<NN>-<slug>/ (workshopRoot set + lessons/ present)
  //  - monorepo workshopRoots: lesson_*/ directly under the workshopRoot
  //  - legacy single-workshop repos: lesson_*/ under a workshop/ subdir
  const composeMode = !opts.workshopRoot && fs.existsSync(path.join(root, "lessons"));
  const unifiedMode = !!opts.workshopRoot && fs.existsSync(path.join(wsDir, "lessons"));
  const lessonsBase = opts.workshopRoot ? wsDir : path.join(wsDir, "workshop");

  // 1. workshop.yaml exists + parses
  const wsPath = path.join(wsDir, "workshop.yaml");
  if (!fs.existsSync(wsPath)) {
    errors.push(`workshop.yaml missing at ${opts.workshopRoot ?? "repo root"}`);
    return { errors };
  }
  const wsRaw = fs.readFileSync(wsPath, "utf8");
  const wsParse = Workshop.safeParse(YAML.load(wsRaw));
  if (!wsParse.success) {
    errors.push(`workshop.yaml: ${wsParse.error.toString()}`);
    return { errors };
  }
  const workshop = wsParse.data;

  // 2. landing.md exists (in the workshopRoot for monorepo workshops)
  if (!fs.existsSync(path.join(wsDir, "landing.md"))) {
    errors.push("landing.md missing");
  }

  // 2b. optional settings.overlay.json: must parse as JSON if present.
  //     fixtures/ is optional and free-form — no lint assertions.
  const overlayPath = path.join(wsDir, "settings.overlay.json");
  if (fs.existsSync(overlayPath)) {
    try {
      JSON.parse(fs.readFileSync(overlayPath, "utf8"));
    } catch {
      errors.push("settings.overlay.json: invalid JSON — must be a valid JSON object");
    }
  }

  // 3. for every phase-referenced lesson key, the lesson dir + lesson.yaml exist
  const lessonKeys = workshop.phases.flatMap((p) => p.lessons);
  const declaredIds = new Set<string>();
  for (const key of lessonKeys) {
    const lessonRoot = composeMode
      ? composeLessonDir(root, key)
      : unifiedMode
        ? unifiedLessonDir(wsDir, key)
        : path.join(lessonsBase, lessonDirForKey(key));
    if (!lessonRoot || !fs.existsSync(lessonRoot)) {
      errors.push(
        composeMode
          ? `phase references "${key}" but no lessons/<NN>-${key}/ dir exists`
          : unifiedMode
            ? `phase references "${key}" but no <workshopRoot>/lessons/<NN>-${key}/ dir exists`
            : `phase references "${key}" but ${path.relative(root, path.join(lessonsBase, lessonDirForKey(key)))} doesn't exist`,
      );
      continue;
    }
    const dir = path.basename(lessonRoot);
    const lessonRelPath = path.relative(root, lessonRoot);
    const yamlPath = path.join(lessonRoot, "lesson.yaml");
    if (!fs.existsSync(yamlPath)) {
      errors.push(`${lessonRelPath}/lesson.yaml missing`);
      continue;
    }
    const lessonParse = Lesson.safeParse(YAML.load(fs.readFileSync(yamlPath, "utf8")));
    if (!lessonParse.success) {
      errors.push(`${lessonRelPath}/lesson.yaml: ${lessonParse.error.toString()}`);
      continue;
    }
    const lesson = lessonParse.data;
    if (declaredIds.has(lesson.id)) {
      errors.push(`duplicate lesson id ${lesson.id} (in ${dir})`);
    }
    declaredIds.add(lesson.id);
    // targetFiles are learner-created; presence is enforced per-tag by verify.ts.
    void lesson.targetFiles;
    // verifyCommand resolves — pnpm filter (only checked for pnpm-filter style commands;
    // other runner commands, e.g. `pnpm exec vitest run ...`, skip this resolution check).
    const m = lesson.verifyCommand.match(/pnpm --filter (\S+) verify/);
    if (m) {
      const r = spawnSync("pnpm", ["--filter", m[1]!, "exec", "node", "-e", "process.exit(0)"], {
        cwd: root,
        timeout: 30_000,
      });
      if (r.status !== 0) {
        errors.push(
          `${dir}/lesson.yaml: verifyCommand filter "${m[1]}" not found in workspace`,
        );
      }
    }
    // Walker skill presence is checked in Wave 5 (walker-state-aware-pedagogy).
    void workshop.skillPrefix;
    // README.md h1 matches lesson title (loose: starts with "# Lesson N" or contains title)
    const readme = path.join(lessonRoot, "README.md");
    if (fs.existsSync(readme)) {
      const firstLine = fs.readFileSync(readme, "utf8").split("\n")[0] ?? "";
      if (!firstLine.startsWith("#") || !firstLine.toLowerCase().includes(lesson.title.toLowerCase())) {
        errors.push(`${dir}/README.md: H1 "${firstLine}" does not include lesson title "${lesson.title}"`);
      }
    }
  }

  return { errors };
}

function lessonDirForKey(key: string): string {
  // Slug-based layout: "install" -> "lesson_install".
  return `lesson_${key}`;
}

/**
 * Compose model: lessons live at lessons/<NN>-<slug>/ (the NN prefix is disk-ordering
 * only). Resolve a slug to its absolute lesson dir, or null if absent.
 */
function composeLessonDir(root: string, key: string): string | null {
  const lessonsRoot = path.join(root, "lessons");
  if (!fs.existsSync(lessonsRoot)) return null;
  const hit = fs
    .readdirSync(lessonsRoot)
    .find((d) => d.replace(/^\d+-/, "") === key);
  return hit ? path.join(lessonsRoot, hit) : null;
}

/**
 * Unified compose model: lessons live at <workshopRoot>/lessons/<NN>-<slug>/.
 * Resolve a slug to its absolute lesson dir, or null if absent.
 */
function unifiedLessonDir(wsDir: string, key: string): string | null {
  const lessonsRoot = path.join(wsDir, "lessons");
  if (!fs.existsSync(lessonsRoot)) return null;
  const hit = fs
    .readdirSync(lessonsRoot)
    .find((d) => d.replace(/^\d+-/, "") === key);
  return hit ? path.join(lessonsRoot, hit) : null;
}

/**
 * Soft check: if the block-edits PreToolUse hook ships but no settings.json
 * PreToolUse entry references it, the test-file/protected-path immutability
 * contract is silently un-enforced. Returns a warning string (never an error)
 * — settings.json is member-local, so this must not fail the lint.
 *
 * base-v6 moved the served chassis to base/.claude/ (root .claude/ was removed).
 * Checks base/.claude/hooks/block-edits.sh and base/.claude/settings.json.
 */
export function checkHookWired(repoRoot: string): string | null {
  const hook = path.join(repoRoot, "base", ".claude", "hooks", "block-edits.sh");
  if (!fs.existsSync(hook)) return null;
  const settingsPath = path.join(repoRoot, "base", ".claude", "settings.json");
  const settings = fs.existsSync(settingsPath)
    ? fs.readFileSync(settingsPath, "utf8")
    : "";
  if (!/"PreToolUse"/.test(settings) || !/block-edits\.sh/.test(settings)) {
    return "base/.claude/hooks/block-edits.sh exists but no PreToolUse hook in base/.claude/settings.json references it — the immutability contract is not enforced. Wire Edit/Write/MultiEdit PreToolUse matchers to it.";
  }
  return null;
}

// CLI entry
// Usage: tsx scripts/lint-manifest.ts [--workshopRoot .workshop/claude-code]
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let workshopRoot: string | undefined;
  const wrIdx = args.indexOf("--workshopRoot");
  if (wrIdx !== -1 && args[wrIdx + 1]) {
    workshopRoot = args[wrIdx + 1];
  }

  const repoRoot = process.cwd();
  const hookWarning = checkHookWired(repoRoot);
  if (hookWarning) console.warn(`⚠ ${hookWarning}`);

  // Repo-level: optional series.settings.overlay.json must parse as JSON if present.
  function seriesOverlayError(): string | null {
    const p = path.join(repoRoot, "series.settings.overlay.json");
    if (!fs.existsSync(p)) return null;
    try {
      JSON.parse(fs.readFileSync(p, "utf8"));
      return null;
    } catch {
      return "series.settings.overlay.json: invalid JSON — must be a valid JSON object";
    }
  }

  // Unified compose model: workshop.yaml lives under workshops/<ws>/workshop.yaml.
  // Fall through to per-workshop scanning when root workshop.yaml is absent.
  const rootWorkshopYaml = path.join(repoRoot, "workshop.yaml");
  const workshopsDir = path.join(repoRoot, "workshops");

  // Repo-level overlay check runs in every layout mode (computed once).
  const overlayErr = seriesOverlayError();

  async function runLints(): Promise<void> {
    if (workshopRoot || fs.existsSync(rootWorkshopYaml)) {
      // Classic single-workshop or explicit --workshopRoot mode.
      const r = await lintManifest({ repoRoot, workshopRoot });
      const errs = overlayErr ? [overlayErr, ...r.errors] : r.errors;
      if (errs.length === 0) {
        console.log("✔ manifest lint passed");
        process.exit(0);
      }
      for (const e of errs) console.error(`✘ ${e}`);
      process.exit(1);
    } else if (fs.existsSync(workshopsDir)) {
      // Unified compose model: lint each workshops/<ws>/ that has a workshop.yaml.
      // Skip "example" — it's the canonical template scaffold, not a real workshop.
      const workshopDirs = fs
        .readdirSync(workshopsDir)
        .filter((d) => fs.existsSync(path.join(workshopsDir, d, "workshop.yaml")));
      if (workshopDirs.length === 0) {
        console.warn("⚠ no workshop.yaml found at repo root or under workshops/ — nothing to lint");
        process.exit(0);
      }
      let allErrors: string[] = [];
      if (overlayErr) allErrors.push(overlayErr);
      for (const ws of workshopDirs) {
        const r = await lintManifest({ repoRoot: path.join(workshopsDir, ws) });
        if (r.errors.length > 0) {
          for (const e of r.errors) allErrors.push(`[${ws}] ${e}`);
        }
      }
      if (allErrors.length === 0) {
        console.log(`✔ manifest lint passed (${workshopDirs.length} workshop(s))`);
        process.exit(0);
      }
      for (const e of allErrors) console.error(`✘ ${e}`);
      process.exit(1);
    } else {
      if (overlayErr) { console.error(`✘ ${overlayErr}`); process.exit(1); }
      console.warn("⚠ workshop.yaml missing at repo root — nothing to lint");
      process.exit(0);
    }
  }

  runLints().catch((err) => {
    console.error(`✘ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
