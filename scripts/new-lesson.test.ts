import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let repo: string;
const run = (...a: string[]) =>
  execFileSync("npx", ["-y", "tsx", "scripts/new-lesson.ts", ...a], { cwd: repo, encoding: "utf8" });

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "new-lesson-"));
  writeFileSync(join(repo, "series.yaml"),
    `id: s\nshort: s\ntitle: S\nworkshops:\n  - id: w1\n    order: 1\n`);
  const seed = join(repo, "workshops", "w1", "lessons", "01-seed");
  mkdirSync(join(seed, "solution", "src"), { recursive: true });
  mkdirSync(join(seed, "test", "src"), { recursive: true });
  writeFileSync(join(repo, "workshops", "w1", "workshop.yaml"),
    `id: w1\ntitle: W1\nstatus: available\nphases:\n  - id: A\n    title: A\n    lessons:\n      - seed\n`);
  writeFileSync(join(repo, "workshops", "w1", "landing.md"), "# W1\n");
  writeFileSync(join(seed, "lesson.yaml"), `id: seed\ntitle: Seed\nblurb: b\n`);
  writeFileSync(join(seed, "README.md"), "# Seed\n");
  writeFileSync(join(seed, "coach.md"), `---\nname: w1-seed\ndescription: d\n---\nx\n`);
  writeFileSync(join(seed, "solution", "src", "seed.ts"), "export const seed = 1\n");
  writeFileSync(join(seed, "test", "src", "seed.test.ts"), "// t\n");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  cpSync(join(__dirname, "new-lesson.ts"), join(repo, "scripts", "new-lesson.ts"));
});

describe("new-lesson (suite-aware)", () => {
  it("scaffolds a lesson into the named workshop + registers it", () => {
    const out = run("w1", "joins", "--phase", "A");
    const d = join(repo, "workshops", "w1", "lessons", "02-joins");
    expect(existsSync(join(d, "lesson.yaml"))).toBe(true);
    expect(existsSync(join(d, "README.md"))).toBe(true);
    expect(existsSync(join(d, "coach.md"))).toBe(true);
    expect(existsSync(join(d, "solution"))).toBe(true);
    expect(existsSync(join(d, "test"))).toBe(true);
    // registered in workshop.yaml phase A
    expect(readFileSync(join(repo, "workshops", "w1", "workshop.yaml"), "utf8")).toMatch(/-\s+joins/);
    // coach frontmatter name rewritten to <ws>-<slug>
    expect(readFileSync(join(d, "coach.md"), "utf8")).toMatch(/name:\s*w1-joins/);
    expect(out).toMatch(/joins/);
  });

  it("rejects an unknown workshop", () => {
    expect(() => run("nope", "x")).toThrow();
  });

  it("refuses to duplicate an existing slug", () => {
    expect(() => run("w1", "seed")).toThrow();
  });
});
