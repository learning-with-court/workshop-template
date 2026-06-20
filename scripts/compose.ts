// scripts/compose.ts — the "compose model" generator (the chain's replacement).
//
// Authors edit a NORMAL branch (base + per-lesson deltas); this generates one
// cumulative tag per lesson WITHOUT ever rewriting/force-pushing the source branch.
//
// Source layout (authored normally, this branch):
//   workshop.yaml                      ordered lessons (phases[].lessons) + composeShort
//   landing.md
//   base/**                            lesson-1 starting scaffold (uniform; base/src is the empty baseline)
//   lessons/<NN>-<slug>/lesson.yaml    lesson manifest (uniform, served as prose)
//   lessons/<NN>-<slug>/README.md      prose (uniform)
//   lessons/<NN>-<slug>/solution/**    files the learner PRODUCES this lesson (cumulative), served-root-relative
//   lessons/<NN>-<slug>/test/**        the immutable shipped test, served-root-relative
//   .claude/skills/lesson-<slug>.md    per-lesson coach skills (uniform)
//
// Output: a tag `<SHORT>/<slug>` per lesson (SHORT = workshop.yaml composeShort),
// each pointing at that lesson's cumulative STARTING tree:
//   uniform layer  = base/** (incl base/src) + .claude/** + workshop.yaml→.workshop/<SHORT>/ + lesson prose
//   varying layer  = Σ solution(1..N-1)   (PRIOR lessons only — lesson N's own solution is what the learner builds)
//   tests          = test(1..N)           (sticky from a lesson's own position onward)
//
// Determinism: fixed author/committer ident + dates → identical SHAs across runs
// (idempotent). Self-verifies every tree before moving any ref.
//
// Usage:  pnpm exec tsx scripts/compose.ts [--dry-run] [--push]

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, posix } from "node:path";

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`compose — generate per-lesson cumulative tags from base + per-lesson deltas.

Usage: pnpm exec tsx scripts/compose.ts [--dry-run] [--push]

  (default)    generate tags locally (<composeShort>/<slug> per lesson)
  --dry-run    plan + self-verify only; move no refs
  --push       after generating, force-push the tags to origin (for deployed serving)

Reads the tag namespace from workshop.yaml 'composeShort' (falls back to 'id').
Source layout: base/**, lessons/<NN>-<slug>/{lesson.yaml,README.md,solution/,test/}.
The source branch is never rewritten — only <composeShort>/* tags move.`);
  process.exit(0);
}
const dryRun = args.includes("--dry-run");
const doPush = args.includes("--push");
const REPO = process.cwd();

type GitEnv = Record<string, string>;
type Entry = { mode: string; blob: string };
type Built = { slug: string; sha: string; tree: string; entries: Map<string, Entry> };

const IDENT: GitEnv = {
  GIT_AUTHOR_NAME: "compose", GIT_AUTHOR_EMAIL: "compose@spike",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "compose", GIT_COMMITTER_EMAIL: "compose@spike",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

function git(gitArgs: string[], opts: { env?: GitEnv; input?: string } = {}): string {
  return execFileSync("git", gitArgs, {
    cwd: REPO, encoding: "utf8", input: opts.input,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  }).replace(/\n$/, "");
}

// the .workshop/<SHORT>/ segment + <SHORT>/* tag namespace — config-driven, not hardcoded
function composeShort(): string {
  const text = readFileSync(join(REPO, "workshop.yaml"), "utf8");
  const m = text.match(/^composeShort:\s*(\S+)\s*$/m);
  if (m) return m[1]!.replace(/["']/g, "");
  const id = text.match(/^id:\s*(\S+)\s*$/m);
  if (id) return id[1]!.replace(/["']/g, "");
  throw new Error("workshop.yaml: need 'composeShort' or 'id' for the tag namespace");
}
const SHORT = composeShort();

// --- ordered lesson slugs from workshop.yaml phases[].lessons (minimal parse) ---
function lessonOrder(): string[] {
  const text = readFileSync(join(REPO, "workshop.yaml"), "utf8");
  const slugs: string[] = [];
  let inLessons = false;
  for (const line of text.split("\n")) {
    if (/^\s*lessons:\s*$/.test(line)) { inLessons = true; continue; }
    if (inLessons) {
      const m = line.match(/^\s*-\s*([a-z][a-z0-9-]*)\s*$/);
      if (m) { slugs.push(m[1]!); continue; }
      if (/^\S/.test(line) || /^\s*\w+:/.test(line)) inLessons = false; // left the block
    }
  }
  if (slugs.length === 0) throw new Error("no lessons found in workshop.yaml phases[].lessons");
  return slugs;
}

// map slug -> its source lesson dir (lessons/<NN>-<slug>)
function lessonDirs(slugs: string[]): Record<string, string> {
  const all = readdirSync(join(REPO, "lessons"));
  const byslug: Record<string, string> = {};
  for (const slug of slugs) {
    const hit = all.find((d) => d.replace(/^\d+-/, "") === slug);
    if (!hit) throw new Error(`no source dir lessons/<NN>-${slug}`);
    byslug[slug] = join("lessons", hit);
  }
  return byslug;
}

// recursively list files under a dir, as absolute paths
function walk(absDir: string): string[] {
  const out: string[] = [];
  if (!existsSync(absDir)) return out;
  for (const name of readdirSync(absDir)) {
    const abs = join(absDir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

// hash a working-tree file into the object db, return its blob sha
const hashFile = (absPath: string): string => git(["hash-object", "-w", absPath]);

// build a tree for lesson position idx (0-based) and return its sha + entries
function treeFor(slugs: string[], dirs: Record<string, string>, idx: number): { tree: string; entries: Map<string, Entry> } {
  const tmpIndex = join(REPO, ".git", `compose-index-${idx}`);
  const env: GitEnv = { GIT_INDEX_FILE: tmpIndex };
  rmSync(tmpIndex, { force: true });

  const entries = new Map<string, Entry>();
  const add = (servedPath: string, absSource: string): void => {
    const mode = absSource.endsWith(".sh") ? "100755" : "100644";
    entries.set(servedPath, { mode, blob: hashFile(absSource) });
  };

  // 1) UNIFORM: base/** (incl base/src) -> served root
  const baseDir = join(REPO, "base");
  for (const abs of walk(baseDir)) add(posix.relative(baseDir, abs), abs);
  // 2) UNIFORM: source .claude/** -> served /.claude/**
  for (const abs of walk(join(REPO, ".claude"))) add(posix.relative(REPO, abs), abs);
  // 3) UNIFORM: workshop.yaml + landing.md -> .workshop/<SHORT>/
  add(`.workshop/${SHORT}/workshop.yaml`, join(REPO, "workshop.yaml"));
  if (existsSync(join(REPO, "landing.md"))) add(`.workshop/${SHORT}/landing.md`, join(REPO, "landing.md"));
  // 4) UNIFORM: every lesson's prose -> .workshop/<SHORT>/lesson_<slug>/
  for (const slug of slugs) {
    const d = join(REPO, dirs[slug]!);
    add(`.workshop/${SHORT}/lesson_${slug}/lesson.yaml`, join(d, "lesson.yaml"));
    if (existsSync(join(d, "README.md")))
      add(`.workshop/${SHORT}/lesson_${slug}/README.md`, join(d, "README.md"));
  }
  // 5) VARYING: cumulative solutions of PRIOR lessons only (sticky; later overrides earlier)
  for (let k = 0; k < idx; k++) {
    const solDir = join(REPO, dirs[slugs[k]!]!, "solution");
    for (const abs of walk(solDir)) add(posix.relative(solDir, abs), abs);
  }
  // 6) tests of lessons 1..N (sticky from own position)
  for (let k = 0; k <= idx; k++) {
    const testDir = join(REPO, dirs[slugs[k]!]!, "test");
    for (const abs of walk(testDir)) add(posix.relative(testDir, abs), abs);
  }

  for (const [path, { mode, blob }] of entries) {
    git(["update-index", "--add", "--cacheinfo", `${mode},${blob},${path}`], { env });
  }
  const tree = git(["write-tree"], { env });
  rmSync(tmpIndex, { force: true });
  return { tree, entries };
}

// --- build every position ---
const slugs = lessonOrder();
const dirs = lessonDirs(slugs);
const built: Built[] = [];
let parent: string | null = null;
for (let i = 0; i < slugs.length; i++) {
  const { tree, entries } = treeFor(slugs, dirs, i);
  const msg = `compose: ${SHORT}/${slugs[i]} starting tree`;
  const sha = git(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", msg], { env: IDENT });
  built.push({ slug: slugs[i]!, sha, tree, entries });
  parent = sha;
}

// --- self-verify each position before moving any ref ---
for (let i = 0; i < built.length; i++) {
  const { slug, entries } = built[i]!;
  const ownSol = join(REPO, dirs[slug]!, "solution");
  for (const abs of walk(ownSol)) {
    const rel = posix.relative(ownSol, abs);
    if (entries.has(rel)) throw new Error(`self-verify: ${slug} starting tree leaks its OWN solution ${rel}`);
  }
  const ownTest = join(REPO, dirs[slug]!, "test");
  for (const abs of walk(ownTest)) {
    const rel = posix.relative(ownTest, abs);
    if (!entries.has(rel)) throw new Error(`self-verify: ${slug} starting tree missing its own test ${rel}`);
  }
  if (i > 0) {
    const prevSol = join(REPO, dirs[slugs[i - 1]!]!, "solution");
    for (const abs of walk(prevSol)) {
      const rel = posix.relative(prevSol, abs);
      if (!entries.has(rel)) throw new Error(`self-verify: ${slug} starting tree missing prior solution ${rel}`);
    }
  }
}

console.log(`compose: ${slugs.length} lessons, SHORT=${SHORT}`);
for (const b of built) console.log(`  ${SHORT}/${b.slug} -> ${b.sha.slice(0, 12)} (${b.entries.size} files)`);
console.log(`self-verify: ${built.length} positions OK`);

const tagName = (slug: string): string => `${SHORT}/${slug}`;
if (dryRun) {
  console.log("DRY RUN — no tags moved");
} else {
  for (const b of built) git(["tag", "-f", tagName(b.slug), b.sha]);
  console.log(`tags written: ${built.map((b) => tagName(b.slug)).join(", ")}`);
  console.log(`NOTE: source branch untouched — only ${SHORT}/* tags moved.`);
  if (doPush) {
    git(["push", "--force", "origin", ...built.map((b) => `refs/tags/${tagName(b.slug)}`)]);
    console.log(`pushed ${built.length} tags to origin (force).`);
  } else {
    console.log("(local only — pass --push to publish the tags to origin)");
  }
}
