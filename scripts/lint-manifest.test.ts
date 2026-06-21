// scripts/lint-manifest.test.ts
import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { lintManifest } from "./lint-manifest.js";

// Resolve repo root from this test file's location so the test passes
// regardless of cwd (works under both `pnpm test:scripts` and `pnpm -r test`).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(__dirname, "lint-manifest.ts");

describe("lintManifest", () => {
  it("passes on the canonical example workshop (unified compose layout)", async () => {
    const result = await lintManifest({ repoRoot: REPO_ROOT, workshopRoot: "workshops/example" });
    expect(result.errors).toEqual([]);
  });

  it("rejects a malformed series.settings.overlay.json in --workshopRoot (single-workshop) mode", () => {
    // Reproduces the single-workshop dispatch branch: the repo-level overlay check must
    // run even when a specific workshopRoot is targeted.
    const repo = mkdtempSync(path.join(tmpdir(), "lint-series-overlay-"));
    const d = path.join(repo, "workshops", "w1", "lessons", "01-w1a");
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(repo, "series.yaml"),
      `id: s\nshort: s\ntitle: S\nworkshops:\n  - id: w1\n    order: 1\n`);
    writeFileSync(path.join(repo, "workshops", "w1", "workshop.yaml"),
      `id: w1\ntitle: "w1"\nstatus: available\nrepo: x/y\ntagline: "t"\nsummary: "s"\n` +
      `difficulty: beginner\ntags:\n  - t\ninstall: "i"\nyouWillBuild:\n  - "b"\n` +
      `prerequisites: []\nphases:\n  - id: A\n    title: A\n    lessons:\n      - w1a\n`);
    writeFileSync(path.join(repo, "workshops", "w1", "landing.md"), `# w1\n`);
    writeFileSync(path.join(d, "lesson.yaml"),
      `id: w1a\ntitle: "w1a"\nblurb: "b"\nprerequisites: []\ntargetFiles:\n  - src/x.ts\n` +
      `verifyCommand: "true"\nverify:\n  description: "d"\n  mustInclude:\n    - "x"\n` +
      `onPass:\n  feedback: "f"\n`);
    writeFileSync(path.join(d, "README.md"), `# w1a\n`);
    writeFileSync(path.join(d, "coach.md"), `---\nname: w1-w1a\ndescription: coach\n---\nbody\n`);
    // MALFORMED repo-level overlay
    writeFileSync(path.join(repo, "series.settings.overlay.json"), "{ not json");

    let threw = false;
    try {
      execFileSync("npx", ["-y", "tsx", SCRIPT, "--workshopRoot", "workshops/w1"], {
        cwd: repo, encoding: "utf8",
      });
    } catch {
      threw = true;
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
    expect(threw).toBe(true);
  }, 30000);
});
