import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let repo: string;
const run = (...a: string[]) =>
  execFileSync("npx", ["-y", "tsx", "scripts/add-workshop.ts", ...a], { cwd: repo, encoding: "utf8" });

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "add-workshop-"));
  writeFileSync(join(repo, "series.yaml"),
    `id: s\nshort: s\ntitle: S\nworkshops:\n  - id: w1\n    order: 1\n`);
  // example scaffold to copy from
  const ex = join(repo, "workshops", "example", "lessons", "01-example");
  mkdirSync(join(ex, "solution", "src"), { recursive: true });
  mkdirSync(join(ex, "test", "src"), { recursive: true });
  writeFileSync(join(repo, "workshops", "example", "workshop.yaml"),
    `id: example\ntitle: "Example"\nstatus: available\nrepo: learning-with-court/x\ntagline: t\nsummary: s\ndifficulty: beginner\ntags:\n  - t\ninstall: i\nyouWillBuild:\n  - b\nprerequisites:\n  - term: t\n    desc: d\nphases:\n  - id: A\n    title: A\n    lessons:\n      - example\n`);
  writeFileSync(join(repo, "workshops", "example", "landing.md"), "# Example\n");
  writeFileSync(join(ex, "lesson.yaml"), `id: example\ntitle: Example\nblurb: b\n`);
  writeFileSync(join(ex, "README.md"), "# Example\n");
  writeFileSync(join(ex, "coach.md"), `---\nname: example-example\ndescription: d\n---\nx\n`);
  writeFileSync(join(ex, "solution", "src", "example.ts"), "export const example = 1\n");
  writeFileSync(join(ex, "test", "src", "example.test.ts"), "// t\n");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  cpSync(join(__dirname, "add-workshop.ts"), join(repo, "scripts", "add-workshop.ts"));
});

describe("add-workshop", () => {
  it("appends the workshop to series.yaml and scaffolds it", () => {
    const out = run("w2");
    const sy = readFileSync(join(repo, "series.yaml"), "utf8");
    expect(sy).toMatch(/-\s*id:\s*w2/);
    expect(sy).toMatch(/order:\s*2/);
    expect(existsSync(join(repo, "workshops", "w2", "workshop.yaml"))).toBe(true);
    expect(existsSync(join(repo, "workshops", "w2", "landing.md"))).toBe(true);
    // first lesson scaffolded
    const lessons = join(repo, "workshops", "w2", "lessons");
    expect(existsSync(lessons)).toBe(true);
    // new workshop.yaml id rewritten to w2
    expect(readFileSync(join(repo, "workshops", "w2", "workshop.yaml"), "utf8")).toMatch(/^id:\s*w2/m);
    expect(out).toMatch(/w2/);
  });

  it("refuses to overwrite an existing workshop", () => {
    expect(() => run("w1")).toThrow();
  });
});
