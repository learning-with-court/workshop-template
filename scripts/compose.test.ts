import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync, ExecFileSyncOptions } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ESM-safe __dirname resolution (no bare __dirname in ESM modules)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCRIPT = join(__dirname, "compose.ts");
let repo: string;
const git = (a: string[]) => execFileSync("git", a, { cwd: repo, encoding: "utf8" }).trim();
const showTree = (ref: string) =>
  execFileSync("git", ["ls-tree", "-r", "--name-only", ref], { cwd: repo, encoding: "utf8" })
    .split("\n").filter(Boolean).sort();
function writeLesson(ws: string, nn: string, slug: string, body: string) {
  const d = join(repo, "workshops", ws, "lessons", `${nn}-${slug}`);
  mkdirSync(join(d, "solution", "src"), { recursive: true });
  mkdirSync(join(d, "test", "src"), { recursive: true });
  writeFileSync(join(d, "lesson.yaml"), `id: ${slug}\ntitle: "${slug}"\nblurb: "b"\nverifyCommand: "true"\n`);
  writeFileSync(join(d, "README.md"), `# ${slug}\n`);
  writeFileSync(join(d, "coach.md"), `---\nname: ${ws}-${slug}\ndescription: coach ${slug}\n---\nbody\n`);
  writeFileSync(join(d, "solution", "src", `${slug}.ts`), body);
  writeFileSync(join(d, "test", "src", `${slug}.test.ts`), `// test ${slug}\n`);
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "compose-fixture-"));
  git(["init", "-q"]);
  git(["config", "user.email", "t@t"]); git(["config", "user.name", "t"]);
  // base/
  mkdirSync(join(repo, "base", "src"), { recursive: true });
  mkdirSync(join(repo, "base", ".claude", "skills"), { recursive: true });
  writeFileSync(join(repo, "base", "src", ".gitkeep"), "");
  writeFileSync(join(repo, "base", ".claude", "skills", "_walker-base.md"), "walker base\n");
  writeFileSync(join(repo, "base", "package.json"), `{"name":"x"}\n`);
  // series of two workshops
  writeFileSync(join(repo, "series.yaml"),
    `id: s\nshort: s\ntitle: S\nworkshops:\n  - id: w1\n    order: 1\n  - id: w2\n    order: 2\n`);
  for (const ws of ["w1", "w2"]) {
    mkdirSync(join(repo, "workshops", ws), { recursive: true });
    writeFileSync(join(repo, "workshops", ws, "workshop.yaml"),
      `id: ${ws}\ntitle: ${ws}\nphases:\n  - id: A\n    lessons:\n      - ${ws}a\n      - ${ws}b\n`);
    writeFileSync(join(repo, "workshops", ws, "landing.md"), `# ${ws}\n`);
    writeLesson(ws, "01", `${ws}a`, `export const ${ws}a = 1\n`);
    writeLesson(ws, "02", `${ws}b`, `export const ${ws}b = 1\n`);
  }
  // copy the generator under test into the fixture so relative paths resolve
  mkdirSync(join(repo, "scripts"), { recursive: true });
  execFileSync("cp", [SCRIPT, join(repo, "scripts", "compose.ts")]);
  execFileSync("npx", ["-y", "tsx", "scripts/compose.ts"], { cwd: repo, encoding: "utf8" });
}, 60000);

describe("unified compose generator", () => {
  it("emits a tag per lesson + per-ws v1 + series/v0", () => {
    const tags = git(["tag"]).split("\n").filter(Boolean).sort();
    expect(tags).toEqual([
      "s/series/v0",
      "s/w1/v1", "s/w1/w1a", "s/w1/w1b",
      "s/w2/v1", "s/w2/w2a", "s/w2/w2b",
    ].sort());
  });

  it("serves prose + coach for ALL lessons at every tag (uniform)", () => {
    const t = showTree("s/w1/w1a");
    expect(t).toContain(".workshop/series.yaml");
    expect(t).toContain(".workshop/w2/lesson_w2b/README.md");        // other-ws prose present
    expect(t).toContain(".claude/skills/w2-w2b.md");                  // other-ws coach present
    expect(t).toContain(".claude/skills/_walker-base.md");            // base/.claude served
  });

  it("a lesson's STARTING tree excludes its own solution, includes prior ones (cumulative across the series)", () => {
    // w1a is first → no solutions yet
    expect(showTree("s/w1/w1a")).not.toContain("src/w1a.ts");
    // w1b starts after w1a → has w1a's solution
    expect(showTree("s/w1/w1b")).toContain("src/w1a.ts");
    // w2a (workshop 2, lesson 1) starts with ALL of w1's solutions (cumulative across workshops)
    const w2a = showTree("s/w2/w2a");
    expect(w2a).toContain("src/w1a.ts");
    expect(w2a).toContain("src/w1b.ts");
    expect(w2a).not.toContain("src/w2a.ts");
  });

  it("ships each lesson's test from its own position onward (sticky)", () => {
    expect(showTree("s/w1/w1a")).toContain("src/w1a.test.ts");        // own test present at start
    expect(showTree("s/w1/w1b")).toContain("src/w1a.test.ts");        // and later
  });

  it("series/v0 == base only; ws/v1 == workshop finished", () => {
    expect(showTree("s/series/v0")).not.toContain("src/w1a.ts");
    expect(showTree("s/w1/v1")).toContain("src/w1b.ts");              // w1 finished has all w1 solutions
  });

  it("ws/v1 does NOT leak next workshop's first test (M1 off-by-one)", () => {
    // w1/v1 must not carry w2's first lesson's test
    expect(showTree("s/w1/v1")).not.toContain("src/w2a.test.ts");
    // w1/v1 must carry w1's own last solution
    expect(showTree("s/w1/v1")).toContain("src/w1b.ts");
    // w2/v1 must carry w2's own last test
    expect(showTree("s/w2/v1")).toContain("src/w2b.test.ts");
  });
});

const VALIDATE_SCRIPT = join(__dirname, "validate-compose.ts");

describe("validate-compose", () => {
  it("passes on a well-formed canonical repo", () => {
    execFileSync("cp", [VALIDATE_SCRIPT, join(repo, "scripts", "validate-compose.ts")]);
    const out = execFileSync("npx", ["-y", "tsx", "scripts/validate-compose.ts"], {
      cwd: repo, encoding: "utf8",
    } as ExecFileSyncOptions);
    expect(out).toMatch(/validate-compose:\s*OK/i);
  }, 30000);

  it("fails when a lesson is missing coach.md", () => {
    // Build a minimal bad repo
    const badRepo = mkdtempSync(join(tmpdir(), "compose-bad-"));
    const badGit = (a: string[]) => execFileSync("git", a, { cwd: badRepo, encoding: "utf8" }).trim();
    badGit(["init", "-q"]);
    badGit(["config", "user.email", "t@t"]); badGit(["config", "user.name", "t"]);

    // base/
    mkdirSync(join(badRepo, "base", "src"), { recursive: true });
    writeFileSync(join(badRepo, "base", "src", ".gitkeep"), "");

    // series.yaml
    writeFileSync(join(badRepo, "series.yaml"),
      `id: s\nshort: s\ntitle: S\nworkshops:\n  - id: w1\n    order: 1\n`);

    // workshop dir + lesson — MISSING coach.md intentionally
    mkdirSync(join(badRepo, "workshops", "w1", "lessons", "01-w1a"), { recursive: true });
    writeFileSync(join(badRepo, "workshops", "w1", "workshop.yaml"),
      `id: w1\ntitle: w1\nphases:\n  - id: A\n    lessons:\n      - w1a\n`);
    writeFileSync(join(badRepo, "workshops", "w1", "landing.md"), `# w1\n`);
    const d = join(badRepo, "workshops", "w1", "lessons", "01-w1a");
    writeFileSync(join(d, "lesson.yaml"), `id: w1a\ntitle: "w1a"\nblurb: "b"\nverifyCommand: "true"\n`);
    writeFileSync(join(d, "README.md"), `# w1a\n`);
    // no coach.md here

    mkdirSync(join(badRepo, "scripts"), { recursive: true });
    execFileSync("cp", [VALIDATE_SCRIPT, join(badRepo, "scripts", "validate-compose.ts")]);

    let threw = false;
    try {
      execFileSync("npx", ["-y", "tsx", "scripts/validate-compose.ts"], {
        cwd: badRepo, encoding: "utf8",
      } as ExecFileSyncOptions);
    } catch {
      threw = true;
    } finally {
      rmSync(badRepo, { recursive: true, force: true });
    }
    expect(threw).toBe(true);
  }, 30000);
});
