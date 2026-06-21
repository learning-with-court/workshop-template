// scripts/compose.ts — unified suite-capable compose generator (canonical layout).
//
// Authors edit a NORMAL branch; this generates per-lesson cumulative tags for a SERIES
// of workshops WITHOUT ever rewriting/force-pushing the source branch.
//
// Source layout (canonical; task 1):
//   series.yaml                          { id, short, title, workshops: [{id, order}] }
//   series.settings.overlay.json         optional — deep-merged onto base/.claude/settings.json
//                                        for EVERY tag (series-wide settings; ws overlay wins on top)
//   base/**                              uniform baseline (incl base/.claude/skills/)
//   workshops/<ws>/workshop.yaml         { id, phases: [{id, lessons: [slug...]}] }
//   workshops/<ws>/landing.md
//   workshops/<ws>/lessons/<NN>-<slug>/
//     lesson.yaml                        lesson manifest (prose)
//     README.md                          lesson prose
//     coach.md                           per-lesson coach skill
//     solution/**                        files the learner PRODUCES (root-relative)
//     test/**                            immutable shipped tests (root-relative)
//
// Output tags (all derivable, deterministic SHAs):
//   <short>/<ws>/<slug>   per lesson — starting tree = base + prose(all) + coach(all)
//                         + Σ solution(prior lessons, whole series) + Σ test(0..idx)
//   <short>/series/v0     series start = base + prose(all) + coach(all)
//   <short>/<ws>/v1       finished state = base + prose(all) + coach(all)
//                         + Σ solution(through ws's last lesson) + sticky tests
//
// Determinism: fixed ident/dates → stable SHAs. Self-verifies before moving refs.
// Usage: tsx scripts/compose.ts [--dry-run] [--push]

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, posix } from "node:path";

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`compose — generate per-lesson cumulative tags for a workshop series.

Usage: tsx scripts/compose.ts [--dry-run] [--push]

  (default)   generate tags locally (<short>/<ws>/<slug>, <short>/<ws>/v1, <short>/series/v0)
  --dry-run   plan + self-verify only; move no refs
  --push      force-push generated tags to origin

Reads the tag namespace from series.yaml 'short'.
Source layout: series.yaml, base/**, workshops/<ws>/workshop.yaml, workshops/<ws>/lessons/<NN>-<slug>/.
The source branch is never rewritten — only <short>/* tags move.`);
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const doPush = args.includes("--push");
const REPO = process.cwd();

type GitEnv = Record<string, string>;
type Entry = { mode: string; blob: string };

const IDENT: GitEnv = {
  GIT_AUTHOR_NAME: "compose", GIT_AUTHOR_EMAIL: "compose@spike",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "compose", GIT_COMMITTER_EMAIL: "compose@spike",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

const git = (a: string[], opts: { env?: GitEnv } = {}): string =>
  execFileSync("git", a, {
    cwd: REPO, encoding: "utf8", maxBuffer: 1 << 30,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  }).replace(/\n$/, "");

// --- config: read series.yaml at repo root ---
function seriesShort(): string {
  const text = readFileSync(join(REPO, "series.yaml"), "utf8");
  const m = text.match(/^short:\s*(\S+)/m);
  if (!m) throw new Error("series.yaml: need 'short' field for the tag namespace");
  return m[1]!.replace(/["']/g, "");
}

// --- ordered workshops from series.yaml ---
function seriesWorkshops(): { ws: string; order: number }[] {
  const text = readFileSync(join(REPO, "series.yaml"), "utf8");
  const out: { ws: string; order: number }[] = [];
  let cur: { ws?: string; order?: number } | null = null;
  let inWorkshops = false;
  for (const line of text.split("\n")) {
    if (/^workshops:\s*$/.test(line)) { inWorkshops = true; continue; }
    if (!inWorkshops) continue;
    if (/^\s*-\s*id:\s*(\S+)/.test(line)) {
      if (cur?.ws !== undefined) out.push({ ws: cur.ws!, order: cur.order ?? 0 });
      const idMatch = line.match(/^\s*-\s*id:\s*(\S+)/);
      cur = { ws: idMatch![1]!.replace(/["']/g, "") };
      continue;
    }
    const ord = line.match(/^\s*order:\s*(\d+)\s*$/);
    if (ord && cur) cur.order = +ord[1]!;
    if (/^\S/.test(line) && !/^workshops:/.test(line)) inWorkshops = false;
  }
  if (cur?.ws !== undefined) out.push({ ws: cur.ws!, order: cur.order ?? 0 });
  return out.sort((a, b) => a.order - b.order);
}

// --- lesson order from workshops/<ws>/workshop.yaml ---
function lessonOrder(ws: string): string[] {
  const text = readFileSync(join(REPO, "workshops", ws, "workshop.yaml"), "utf8");
  const slugs: string[] = [];
  let inLessons = false;
  for (const line of text.split("\n")) {
    if (/^\s*lessons:\s*$/.test(line)) { inLessons = true; continue; }
    if (inLessons) {
      const m = line.match(/^\s*-\s*([a-z][a-z0-9-]*)\s*$/);
      if (m) { slugs.push(m[1]!); continue; }
      if (/^\S/.test(line) || /^\s*\w+:/.test(line)) inLessons = false;
    }
  }
  return slugs;
}

// --- resolve solution dir by slug under workshops/<ws>/lessons/ ---
function solDirFor(ws: string, slug: string): string {
  const wsLessons = join(REPO, "workshops", ws, "lessons");
  if (existsSync(wsLessons)) {
    const hit = readdirSync(wsLessons).find((d) => d.replace(/^\d+-/, "") === slug);
    if (hit) return join(wsLessons, hit, "solution");
  }
  return join(wsLessons, slug, "solution"); // nonexistent placeholder => empty
}

// --- resolve lesson dir by slug under workshops/<ws>/lessons/ ---
function lessonDirFor(ws: string, slug: string): string {
  const wsLessons = join(REPO, "workshops", ws, "lessons");
  if (existsSync(wsLessons)) {
    const hit = readdirSync(wsLessons).find((d) => d.replace(/^\d+-/, "") === slug);
    if (hit) return join(wsLessons, hit);
  }
  return join(wsLessons, slug); // nonexistent placeholder
}

// --- resolve test dir ---
function testDirFor(ws: string, slug: string): string {
  return join(lessonDirFor(ws, slug), "test");
}

// recursively list absolute file paths
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

const hashFile = (abs: string): string => git(["hash-object", "-w", abs]);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && !Array.isArray(v) && v !== null;

function deepMerge(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const k of Object.keys(b)) {
    out[k] = isPlainObject(a[k]) && isPlainObject(b[k])
      ? deepMerge(a[k] as Record<string, unknown>, b[k] as Record<string, unknown>)
      : b[k];
  }
  return out;
}

function hashContent(s: string): string {
  return execFileSync("git", ["hash-object", "-w", "--stdin"], {
    input: s, cwd: REPO, encoding: "utf8",
  }).trim();
}

// --- flat ordered lesson list across the whole series ---
type L = { ws: string; slug: string };
const SHORT = seriesShort();
const workshops = seriesWorkshops();
const flat: L[] = [];
const wsLastIdx: Record<string, number> = {};
for (const { ws } of workshops) {
  for (const slug of lessonOrder(ws)) {
    flat.push({ ws, slug });
    wsLastIdx[ws] = flat.length - 1;
  }
}
if (flat.length === 0) throw new Error("No lessons found across all workshops in series.yaml");

// --- build a tree for position upTo (prior solutions only) ---
// solUpTo: solutions k < solUpTo; testUpTo: sticky tests k <= testUpTo (defaults to solUpTo)
// overlayWs: the workshop whose per-workshop settings.overlay.json (if any) merges last; the repo-root
//            series.settings.overlay.json always merges first, so it applies even when overlayWs is undefined
function buildTree(solUpTo: number, idxLabel: string, testUpTo: number = solUpTo, overlayWs?: string): { tree: string; entries: Map<string, Entry> } {
  const upTo = solUpTo;
  const tmpIndex = join(REPO, ".git", `compose-index-${idxLabel}`);
  const env: GitEnv = { GIT_INDEX_FILE: tmpIndex };
  rmSync(tmpIndex, { force: true });

  const entries = new Map<string, Entry>();
  const add = (served: string, abs: string): void =>
    void entries.set(served, { mode: abs.endsWith(".sh") ? "100755" : "100644", blob: hashFile(abs) });

  // 1) base/** → served root (includes base/.claude/skills/)
  const baseDir = join(REPO, "base");
  for (const abs of walk(baseDir)) add(posix.relative(baseDir, abs), abs);

  // 1b) settings overlays: chassis settings.json <- series overlay <- per-workshop overlay (deep-merged).
  //     The series overlay (repo-root series.settings.overlay.json) applies to EVERY tag — including
  //     series/v0 (which has no workshop). The per-workshop overlay applies only to that workshop's
  //     tags and wins on conflict. base wins where no overlay touches a key.
  const seriesOverlayPath = join(REPO, "series.settings.overlay.json");
  const wsOverlayPath = overlayWs ? join(REPO, "workshops", overlayWs, "settings.overlay.json") : null;
  const hasSeriesOverlay = existsSync(seriesOverlayPath);
  const hasWsOverlay = wsOverlayPath !== null && existsSync(wsOverlayPath);
  if (hasSeriesOverlay || hasWsOverlay) {
    const baseSettingsPath = join(REPO, "base", ".claude", "settings.json");
    let merged = existsSync(baseSettingsPath)
      ? JSON.parse(readFileSync(baseSettingsPath, "utf8")) as Record<string, unknown>
      : {};
    if (hasSeriesOverlay)
      merged = deepMerge(merged, JSON.parse(readFileSync(seriesOverlayPath, "utf8")) as Record<string, unknown>);
    if (hasWsOverlay)
      merged = deepMerge(merged, JSON.parse(readFileSync(wsOverlayPath!, "utf8")) as Record<string, unknown>);
    const mergedStr = JSON.stringify(merged, null, 2) + "\n";
    entries.set(".claude/settings.json", { mode: "100644", blob: hashContent(mergedStr) });
  }

  // 2) UNIFORM prose + coach for EVERY lesson in the series
  //    workshops/<ws>/lessons/<NN>-<slug>/lesson.yaml + README.md → .workshop/<ws>/lesson_<slug>/
  //    workshops/<ws>/lessons/<NN>-<slug>/coach.md → .claude/skills/<ws>-<slug>.md
  for (const { ws, slug } of flat) {
    const d = lessonDirFor(ws, slug);
    const lessonYaml = join(d, "lesson.yaml");
    if (existsSync(lessonYaml)) add(`.workshop/${ws}/lesson_${slug}/lesson.yaml`, lessonYaml);
    const readme = join(d, "README.md");
    if (existsSync(readme)) add(`.workshop/${ws}/lesson_${slug}/README.md`, readme);
    const coach = join(d, "coach.md");
    if (existsSync(coach)) add(`.claude/skills/${ws}-${slug}.md`, coach);
    // per-lesson fixtures: workshops/<ws>/lessons/<NN>-<slug>/fixtures/** → .workshop/<ws>/lesson_<slug>/fixtures/**
    const lessonFixtures = join(d, "fixtures");
    for (const abs of walk(lessonFixtures))
      add(`.workshop/${ws}/lesson_${slug}/fixtures/${posix.relative(lessonFixtures, abs)}`, abs);
  }

  // 2b) UNIFORM per-workshop fixtures: workshops/<ws>/fixtures/** → .workshop/<ws>/fixtures/**
  for (const { ws } of workshops) {
    const fixturesDir = join(REPO, "workshops", ws, "fixtures");
    for (const abs of walk(fixturesDir))
      add(`.workshop/${ws}/fixtures/${posix.relative(fixturesDir, abs)}`, abs);
  }

  // 3) series.yaml → .workshop/series.yaml; per-ws workshop.yaml + landing.md
  const seriesYaml = join(REPO, "series.yaml");
  if (existsSync(seriesYaml)) add(".workshop/series.yaml", seriesYaml);
  for (const { ws } of workshops) {
    const wsYaml = join(REPO, "workshops", ws, "workshop.yaml");
    if (existsSync(wsYaml)) add(`.workshop/${ws}/workshop.yaml`, wsYaml);
    const landing = join(REPO, "workshops", ws, "landing.md");
    if (existsSync(landing)) add(`.workshop/${ws}/landing.md`, landing);
  }

  // 4) Σ solution(0..upTo-1) across the series (cumulative; later overrides earlier)
  for (let k = 0; k < upTo; k++) {
    const solDir = solDirFor(flat[k]!.ws, flat[k]!.slug);
    for (const abs of walk(solDir)) add(posix.relative(solDir, abs), abs);
  }

  // 5) sticky tests: for every lesson at-or-before testUpTo position, ship its test/ → root
  for (let k = 0; k <= testUpTo && k < flat.length; k++) {
    const testDir = testDirFor(flat[k]!.ws, flat[k]!.slug);
    for (const abs of walk(testDir)) add(posix.relative(testDir, abs), abs);
  }

  for (const [path, { mode, blob }] of entries)
    git(["update-index", "--add", "--cacheinfo", `${mode},${blob},${path}`], { env });
  const tree = git(["write-tree"], { env });
  rmSync(tmpIndex, { force: true });
  return { tree, entries };
}

// --- compute all tag trees ---
type Built = { tag: string; tree: string; entries: Map<string, Entry> };
const built: Built[] = [];

// per-lesson tags: tree = base + prose(all) + Σ solution(0..idx-1) + sticky tests(0..idx)
flat.forEach((l, idx) => {
  const { tree, entries } = buildTree(idx, `L${idx}`, idx, l.ws);
  built.push({ tag: `${SHORT}/${l.ws}/${l.slug}`, tree, entries });
});

// series/v0 = first lesson's starting tree (base + prose + coach + that lesson's test; no solutions).
{
  const { tree, entries } = buildTree(0, "v0");
  built.push({ tag: `${SHORT}/series/v0`, tree, entries });
}

// <ws>/v1 = base + prose + Σ solution(0..lastIdxOfWs) + sticky tests(0..lastIdxOfWs)
// solUpTo = e+1 (solutions for all lessons through e), testUpTo = e (tests only through that ws's last lesson)
for (const { ws } of workshops) {
  const e = wsLastIdx[ws]!;
  const { tree, entries } = buildTree(e + 1, `v1-${ws}`, e, ws);
  built.push({ tag: `${SHORT}/${ws}/v1`, tree, entries });
}

// --- self-verify ---
flat.forEach((l, idx) => {
  const b = built[idx]!;
  // own solution must NOT be in the starting tree
  const ownSol = solDirFor(l.ws, l.slug);
  for (const abs of walk(ownSol)) {
    const rel = posix.relative(ownSol, abs);
    if (b.entries.has(rel)) throw new Error(`self-verify: ${b.tag} leaks its OWN solution ${rel}`);
  }
  // own test MUST be present
  const ownTest = testDirFor(l.ws, l.slug);
  for (const abs of walk(ownTest)) {
    const rel = posix.relative(ownTest, abs);
    if (!b.entries.has(rel)) throw new Error(`self-verify: ${b.tag} missing its own test ${rel}`);
  }
  // prior lesson's solution must be present (cumulative)
  if (idx > 0) {
    const prev = flat[idx - 1]!;
    const prevSol = solDirFor(prev.ws, prev.slug);
    for (const abs of walk(prevSol)) {
      const rel = posix.relative(prevSol, abs);
      if (!b.entries.has(rel)) throw new Error(`self-verify: ${b.tag} missing prior solution ${rel}`);
    }
  }
});

// self-verify <ws>/v1: ws's own last solution present; next-ws first lesson's test absent
for (let wi = 0; wi < workshops.length; wi++) {
  const ws = workshops[wi]!.ws;
  const v1Tag = `${SHORT}/${ws}/v1`;
  const v1Built = built.find((b) => b.tag === v1Tag);
  if (!v1Built) throw new Error(`self-verify: ${v1Tag} not found in built`);

  // own last solution MUST be present
  const lastIdx = wsLastIdx[ws]!;
  const lastSolDir = solDirFor(flat[lastIdx]!.ws, flat[lastIdx]!.slug);
  for (const abs of walk(lastSolDir)) {
    const rel = posix.relative(lastSolDir, abs);
    if (!v1Built.entries.has(rel))
      throw new Error(`self-verify: ${v1Tag} missing own last solution ${rel}`);
  }

  // next workshop's first lesson's test must NOT be present
  if (wi + 1 < workshops.length) {
    const nextWs = workshops[wi + 1]!.ws;
    const nextSlugs = lessonOrder(nextWs);
    if (nextSlugs.length > 0) {
      const nextTestDir = testDirFor(nextWs, nextSlugs[0]!);
      for (const abs of walk(nextTestDir)) {
        const rel = posix.relative(nextTestDir, abs);
        if (v1Built.entries.has(rel))
          throw new Error(`self-verify: ${v1Tag} leaks next-workshop test ${rel} (off-by-one in testUpTo)`);
      }
    }
  }
}

// self-verify series/v0: must contain no solution files
const v0Built = built.find((b) => b.tag === `${SHORT}/series/v0`);
if (!v0Built) throw new Error(`self-verify: ${SHORT}/series/v0 not found in built`);
for (const { ws, slug } of flat) {
  const solDir = solDirFor(ws, slug);
  for (const abs of walk(solDir)) {
    const rel = posix.relative(solDir, abs);
    if (v0Built.entries.has(rel))
      throw new Error(`self-verify: ${SHORT}/series/v0 must not contain solution file ${rel}`);
  }
}

// --- commit-tree + emit ---
let parent: string | null = null;
const shas: Record<string, string> = {};
for (const b of built) {
  const sha = git(["commit-tree", b.tree, ...(parent ? ["-p", parent] : []), "-m", `compose: ${b.tag}`], { env: IDENT });
  shas[b.tag] = sha;
  parent = sha;
}

console.log(`compose: ${flat.length} lessons, ${built.length} tags, SHORT=${SHORT}`);
for (const b of built) console.log(`  ${b.tag} -> ${shas[b.tag]!.slice(0, 12)} (${b.entries.size} files)`);
console.log(`self-verify: ${flat.length} positions OK`);

if (dryRun) {
  console.log("DRY RUN — no tags moved");
} else {
  for (const b of built) git(["tag", "-f", b.tag, shas[b.tag]!]);
  console.log(`tags written: ${built.length}`);
  if (doPush) {
    git(["push", "--force", "origin", ...built.map((b) => `refs/tags/${b.tag}`)]);
    console.log("pushed.");
  } else {
    console.log("(local only — pass --push to publish)");
  }
}
