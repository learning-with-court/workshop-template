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
  subdomains: z.object({
    dev: z.string().min(1),
    prod: z.string().min(1),
  }),
  youWillBuild: z.array(z.string()),
  prerequisites: z.array(Prereq),
  phases: z.array(Phase),
});
const Verify = z.object({
  description: z.string(),
  mustInclude: z.array(z.string()).min(1),
  mustNotInclude: z.array(z.string()).optional(),
});
const Lesson = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  blurb: z.string(),
  prerequisites: z.array(z.number().int().positive()),
  targetFiles: z.array(z.string()),
  verifyCommand: z.string(),
  verify: Verify,
  onPass: z.object({
    advanceTo: z.number().int().positive().optional(),
    feedback: z.string(),
  }),
});

export interface LintResult {
  errors: string[];
}

export async function lintManifest(opts: { repoRoot: string }): Promise<LintResult> {
  const errors: string[] = [];
  const root = opts.repoRoot;

  // 1. workshop.yaml exists + parses
  const wsPath = path.join(root, "workshop.yaml");
  if (!fs.existsSync(wsPath)) {
    errors.push("workshop.yaml missing at repo root");
    return { errors };
  }
  const wsRaw = fs.readFileSync(wsPath, "utf8");
  const wsParse = Workshop.safeParse(YAML.load(wsRaw));
  if (!wsParse.success) {
    errors.push(`workshop.yaml: ${wsParse.error.toString()}`);
    return { errors };
  }
  const workshop = wsParse.data;

  // 2. landing.md exists
  if (!fs.existsSync(path.join(root, "landing.md"))) {
    errors.push("landing.md missing at repo root");
  }

  // 3. for every phase-referenced lesson key, the lesson dir + lesson.yaml exist
  const lessonKeys = workshop.phases.flatMap((p) => p.lessons);
  const declaredIds = new Set<number>();
  for (const key of lessonKeys) {
    const dir = lessonDirForKey(key);
    const lessonRoot = path.join(root, "workshop", dir);
    if (!fs.existsSync(lessonRoot)) {
      errors.push(`phase references "${key}" but ${path.join("workshop", dir)} doesn't exist`);
      continue;
    }
    const yamlPath = path.join(lessonRoot, "lesson.yaml");
    if (!fs.existsSync(yamlPath)) {
      errors.push(`${path.join("workshop", dir)}/lesson.yaml missing`);
      continue;
    }
    const lessonParse = Lesson.safeParse(YAML.load(fs.readFileSync(yamlPath, "utf8")));
    if (!lessonParse.success) {
      errors.push(`${path.join("workshop", dir)}/lesson.yaml: ${lessonParse.error.toString()}`);
      continue;
    }
    const lesson = lessonParse.data;
    if (declaredIds.has(lesson.id)) {
      errors.push(`duplicate lesson id ${lesson.id} (in ${dir})`);
    }
    declaredIds.add(lesson.id);

    // targetFiles all exist
    for (const tf of lesson.targetFiles) {
      if (!fs.existsSync(path.join(root, tf))) {
        errors.push(`${dir}/lesson.yaml: targetFile "${tf}" does not exist`);
      }
    }

    // verifyCommand resolves — pnpm filter
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

    // walker skill exists
    const skillPath = path.join(
      root,
      ".claude",
      "skills",
      `lesson-${String(lesson.id).padStart(2, "0")}.md`,
    );
    if (!fs.existsSync(skillPath)) {
      errors.push(`walker skill missing: .claude/skills/lesson-${String(lesson.id).padStart(2, "0")}.md`);
    }

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
  // "01-setup" -> "lesson_01_setup"
  const m = key.match(/^(\d+)-(.+)$/);
  if (!m) return key;
  return `lesson_${m[1]}_${m[2]!.replace(/-/g, "_")}`;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  lintManifest({ repoRoot: process.cwd() }).then((r) => {
    if (r.errors.length === 0) {
      console.log("✔ manifest lint passed");
      process.exit(0);
    }
    for (const e of r.errors) console.error(`✘ ${e}`);
    process.exit(1);
  });
}
