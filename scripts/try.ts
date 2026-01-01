// base/scripts/try.ts — lesson-aware fixture runner (served at repo-root scripts/try.ts).
//
// `pnpm try` gives every lesson with a live single-call demo ONE uniform command:
// it resolves the learner's active lesson from local on-disk lwc state, looks up
// that lesson's optional `try:` declaration in its served lesson.yaml, dynamically
// imports the deliverable export from src/, runs it on the declared fixture, and
// prints the result.
//
// Why in-project (not a throwaway script): it runs as part of the served tree, so
// `type: module` applies and TS/ESM resolution Just Works — no top-level-await or
// CommonJS/ESM breakage of a hand-rolled runner.
//
// No network, no MCP: a plain tsx process cannot call the lwc MCP `where_am_i`
// tool. It reads the SAME local state the lwc CLI writes — the active-workshop
// marker and the pinned-tag marker — so resolution is deterministic and offline.
//
// Served layout this relies on:
//   <repoRoot>/.workshop/active                         active workshop id (monorepo series)
//   <repoRoot>/.workshop/<ws>/workshop.yaml             per-workshop manifest (lesson order)
//   <repoRoot>/.workshop/<ws>/lesson_<slug>/lesson.yaml served lesson manifest (carries `try:`)
//   <repoRoot>/.git/lwc/pinned-tag-<workshopId>         "<short>/<ws>/<slug>" — current lesson
//   <repoRoot>/src/<module>.ts                          the deliverable
//
// `try:` schema (optional, in lesson.yaml):
//   try:
//     module: review               # → src/review.ts (no extension)
//     export: reviewWithCritic     # the named export to call
//     fixture: fixtures/sample.json # relative to .workshop/<ws>/lesson_<slug>/
//     fixtureAs: json              # "json" (parsed, default) | "text" (raw string)

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import * as YAML from "js-yaml";

export interface TryDecl {
  module: string;
  export: string;
  fixture: string;
  fixtureAs?: "json" | "text";
}

export interface ActiveWorkshop {
  workshopId: string;
  /** Absolute path to the served workshop dir, i.e. <repoRoot>/.workshop/<ws>. */
  wsDir: string;
}

/** Read a trimmed file, or null if absent/unreadable. */
function readMaybe(p: string): string | null {
  try {
    return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the active workshop's id + served dir from local state, with no
 * network. Order:
 *   1. <repoRoot>/.workshop/active names the active workshop id; find the
 *      .workshop/<dir>/ whose workshop.yaml `id` matches.
 *   2. If exactly one .workshop/<dir>/ has a workshop.yaml, use it.
 * Returns null when neither resolves (caller surfaces a friendly message).
 */
export function resolveActiveWorkshop(repoRoot: string): ActiveWorkshop | null {
  const workshopBase = join(repoRoot, ".workshop");
  if (!existsSync(workshopBase)) return null;

  const dirsWithManifest = readdirSync(workshopBase)
    .map((d) => join(workshopBase, d))
    .filter((p) => {
      try {
        return statSync(p).isDirectory() && existsSync(join(p, "workshop.yaml"));
      } catch {
        return false;
      }
    });
  if (dirsWithManifest.length === 0) return null;

  const idOf = (wsDir: string): string | null => {
    const raw = readMaybe(join(wsDir, "workshop.yaml"));
    if (!raw) return null;
    try {
      const doc = YAML.load(raw) as { id?: unknown } | null;
      return doc && typeof doc.id === "string" ? doc.id : null;
    } catch {
      return null;
    }
  };

  const activeId = readMaybe(join(workshopBase, "active"));
  if (activeId) {
    for (const wsDir of dirsWithManifest) {
      if (idOf(wsDir) === activeId) return { workshopId: activeId, wsDir };
    }
  }

  if (dirsWithManifest.length === 1) {
    const wsDir = dirsWithManifest[0]!;
    const id = idOf(wsDir);
    if (id) return { workshopId: id, wsDir };
  }

  return null;
}

/**
 * Derive the current lesson slug from the pinned-tag marker
 * (.git/lwc/pinned-tag-<workshopId>), which holds "<short>/<ws>/<slug>" — the
 * lesson is the last path segment. Falls back to the first lesson declared in
 * the workshop's workshop.yaml when no marker exists yet (learner on lesson 1).
 * Returns null only when neither is resolvable.
 */
export function resolveCurrentLesson(
  repoRoot: string,
  wsDir: string,
  workshopId: string,
): string | null {
  const marker = readMaybe(
    join(repoRoot, ".git", "lwc", `pinned-tag-${workshopId}`),
  );
  if (marker) {
    const parts = marker.split("/").filter((p) => p.length > 0);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return firstLessonSlug(wsDir);
}

/** First lesson slug from workshop.yaml's phases[].lessons[], or null. */
export function firstLessonSlug(wsDir: string): string | null {
  const raw = readMaybe(join(wsDir, "workshop.yaml"));
  if (!raw) return null;
  try {
    const doc = YAML.load(raw) as
      | { phases?: Array<{ lessons?: unknown }> }
      | null;
    const phases = doc?.phases ?? [];
    for (const phase of phases) {
      const lessons = Array.isArray(phase.lessons) ? phase.lessons : [];
      for (const l of lessons) {
        if (typeof l === "string" && l.length > 0) return l;
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Load the optional `try:` declaration for a lesson from its served lesson.yaml.
 * Returns null when the lesson.yaml is missing OR declares no `try:` block (most
 * lessons have no live demo — that's fine).
 */
export function loadTryDecl(wsDir: string, slug: string): TryDecl | null {
  const raw = readMaybe(join(wsDir, `lesson_${slug}`, "lesson.yaml"));
  if (!raw) return null;
  let doc: { try?: unknown } | null;
  try {
    doc = YAML.load(raw) as { try?: unknown } | null;
  } catch {
    return null;
  }
  const t = doc?.try as Partial<TryDecl> | undefined;
  if (!t || typeof t !== "object") return null;
  if (typeof t.module !== "string" || typeof t.export !== "string" || typeof t.fixture !== "string") {
    throw new Error(
      `lesson "${slug}" declares a try: block but it's missing required fields (module, export, fixture).`,
    );
  }
  return {
    module: t.module,
    export: t.export,
    fixture: t.fixture,
    fixtureAs: t.fixtureAs === "text" ? "text" : "json",
  };
}

/** Load + decode a fixture as JSON (default) or raw text. */
export function loadFixture(absPath: string, as: "json" | "text"): unknown {
  if (!existsSync(absPath)) {
    throw new Error(`fixture not found: ${absPath}`);
  }
  const raw = readFileSync(absPath, "utf8");
  if (as === "text") return raw;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `fixture ${absPath} is not valid JSON (use fixtureAs: text for raw input): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/** Format a returned value for printing: strings raw, everything else as indented JSON. */
export function formatResult(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

/**
 * Run a lesson's `try:` demo: import the export from src/<module>.ts, feed it
 * the fixture, await the result, return the formatted output. Side-effect-free
 * except the dynamic import — kept separate from main() so tests can drive it
 * against a temp tree.
 */
export async function runTry(
  repoRoot: string,
  wsDir: string,
  slug: string,
  decl: TryDecl,
): Promise<string> {
  const modPath = resolve(repoRoot, "src", `${decl.module}.ts`);
  if (!existsSync(modPath)) {
    throw new Error(
      `lesson "${slug}" try: points at src/${decl.module}.ts, but that file doesn't exist yet — build it first, then run \`pnpm try\`.`,
    );
  }
  const mod = (await import(pathToFileURL(modPath).href)) as Record<string, unknown>;
  const fn = mod[decl.export];
  if (typeof fn !== "function") {
    throw new Error(
      `lesson "${slug}" try: expects export \`${decl.export}\` from src/${decl.module}.ts, but it isn't a function (found: ${typeof fn}).`,
    );
  }
  const fixtureAbs = join(wsDir, `lesson_${slug}`, decl.fixture);
  const input = loadFixture(fixtureAbs, decl.fixtureAs ?? "json");
  const result = await (fn as (x: unknown) => unknown)(input);
  return formatResult(result);
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const ws = resolveActiveWorkshop(repoRoot);
  if (!ws) {
    console.error(
      "pnpm try: couldn't find an active workshop. Run this from your workshop project root after `lwc setup`.",
    );
    process.exit(1);
  }
  const slug = resolveCurrentLesson(repoRoot, ws.wsDir, ws.workshopId);
  if (!slug) {
    console.error(
      "pnpm try: couldn't resolve the current lesson from local state. Try `run verify` instead.",
    );
    process.exit(1);
  }
  const decl = loadTryDecl(ws.wsDir, slug);
  if (!decl) {
    console.log(
      `Lesson "${slug}" has no \`pnpm try\` demo — use \`run verify\` to run its tests.`,
    );
    return;
  }
  try {
    const out = await runTry(repoRoot, ws.wsDir, slug, decl);
    console.log(out);
  } catch (err) {
    console.error(`pnpm try: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  void main();
}
