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
const Lesson = z.object({
  id: Slug,
  title: z.string(),
  blurb: z.string(),
  prerequisites: z.array(Slug),
  targetFiles: z.array(z.string()),
  verifyCommand: z.string(),
  verify: Verify,
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
  // Lesson dirs: monorepo workshopRoots hold lesson_*/ directly; single-workshop
  // repos nest them under a workshop/ subdir.
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

  // 3. for every phase-referenced lesson key, the lesson dir + lesson.yaml exist
  const lessonKeys = workshop.phases.flatMap((p) => p.lessons);
  const declaredIds = new Set<string>();
  for (const key of lessonKeys) {
    const dir = lessonDirForKey(key);
    const lessonRoot = path.join(lessonsBase, dir);
    const lessonRelPath = path.relative(root, lessonRoot);

    if (!fs.existsSync(lessonRoot)) {
      errors.push(`phase references "${key}" but ${lessonRelPath} doesn't exist`);
      continue;
    }
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

// CLI entry
// Usage: tsx scripts/lint-manifest.ts [--workshopRoot .workshop/claude-code]
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let workshopRoot: string | undefined;
  const wrIdx = args.indexOf("--workshopRoot");
  if (wrIdx !== -1 && args[wrIdx + 1]) {
    workshopRoot = args[wrIdx + 1];
  }

  lintManifest({ repoRoot: process.cwd(), workshopRoot }).then((r) => {
    if (r.errors.length === 0) {
      console.log("✔ manifest lint passed");
      process.exit(0);
    }
    for (const e of r.errors) console.error(`✘ ${e}`);
    process.exit(1);
  });
}
