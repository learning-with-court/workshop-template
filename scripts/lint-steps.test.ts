// scripts/lint-steps.test.ts
import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { lintSteps, lintWorkshopTerms } from "./lint-steps.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

// One lesson whose README Walkthrough has three items; `steps` is appended to lesson.yaml.
function lint(steps: string): string[] {
  const repo = mkdtempSync(path.join(tmpdir(), "lint-steps-"));
  const d = path.join(repo, "workshops", "w1", "lessons", "01-w1a");
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, "lesson.yaml"), `id: w1a\ntitle: "w1a"\n` + steps);
  writeFileSync(path.join(d, "README.md"),
    "# w1a\n\n## Walkthrough\n\n1. **One**\n\n   ```\n   ask one\n   ```\n\n" +
    "2. **Two**\n\n3. **Three**\n\n   Not 4. an item.\n\n## Try this\n\n1. not a step\n");
  try {
    return lintSteps(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

describe("lintSteps", () => {
  it("passes on this repo's lessons", () => {
    expect(lintSteps(REPO_ROOT)).toEqual([]);
  });

  it("passes a lesson with no steps", () => {
    expect(lint("")).toEqual([]);
  });

  it("accepts file and move views, a step with no view, and choices", () => {
    expect(lint(
      "steps:\n  - view: file src/greet.js\n  - {}\n" +
      "  - view: move edited staged\n    choices:\n      - label: A\n        prompt: pa\n      - label: B\n        prompt: pb\n",
    )).toEqual([]);
  });

  it("accepts a commits view, and refuses one with arguments", () => {
    expect(lint("steps:\n  - view: commits\n")).toEqual([]);
    expect(lint("steps:\n  - view: commits main\n")).not.toEqual([]);
  });

  it("accepts a none view, and refuses one with arguments", () => {
    expect(lint("steps:\n  - view: commits\n  - view: none\n")).toEqual([]);
    expect(lint("steps:\n  - view: none src/greet.js\n").join("\n")).toContain("steps[0].view");
  });

  it("rejects a view of an unknown kind", () => {
    expect(lint("steps:\n  - view: diff src/greet.js\n").join("\n")).toContain("steps[0].view");
  });

  it("rejects a move between places that don't exist, or a file view with no path", () => {
    expect(lint("steps:\n  - view: move edited pushed\n").join("\n")).toContain("steps[0].view");
    expect(lint("steps:\n  - view: move staged\n").join("\n")).toContain("steps[0].view");
    expect(lint("steps:\n  - {}\n  - view: file\n").join("\n")).toContain("steps[1].view");
  });

  it("rejects a choice with no prompt", () => {
    expect(lint("steps:\n  - choices:\n      - label: A\n      - label: B\n        prompt: pb\n").join("\n"))
      .toContain("steps[0].choices[0].prompt");
  });

  it("rejects more steps than the README's Walkthrough has items", () => {
    expect(lint("steps:\n  - {}\n  - {}\n  - {}\n  - {}\n").join("\n")).toMatch(/4 steps.*3 Walkthrough items/);
  });
});

// One workshop dir holding whichever of terms.yaml and intro.md are given.
function lintTerms(files: { terms?: string; intro?: string }): string[] {
  const repo = mkdtempSync(path.join(tmpdir(), "lint-terms-"));
  const ws = path.join(repo, "workshops", "w1");
  mkdirSync(ws, { recursive: true });
  if (files.terms !== undefined) writeFileSync(path.join(ws, "terms.yaml"), files.terms);
  if (files.intro !== undefined) writeFileSync(path.join(ws, "intro.md"), files.intro);
  try {
    return lintWorkshopTerms(repo);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

describe("lintWorkshopTerms", () => {
  it("passes on this repo's workshops", () => {
    expect(lintWorkshopTerms(REPO_ROOT)).toEqual([]);
  });

  it("accepts a workshop with neither file, or terms with an intro", () => {
    expect(lintTerms({})).toEqual([]);
    expect(lintTerms({
      terms: "terms:\n  - term: commit\n    means: A snapshot.\n  - term: gh\n    means: A tool.\n    ask: What is gh?\n",
      intro: "# W1\n",
    })).toEqual([]);
  });

  it("rejects an entry with no term or no means", () => {
    expect(lintTerms({ terms: "terms:\n  - means: A snapshot.\n", intro: "x" }).join("\n"))
      .toContain("terms[0].term");
    expect(lintTerms({ terms: "terms:\n  - term: commit\n", intro: "x" }).join("\n"))
      .toContain("terms[0].means");
  });

  it("rejects terms.yaml that doesn't parse", () => {
    expect(lintTerms({ terms: "terms: [\n", intro: "x" }).join("\n")).toContain("terms.yaml");
  });

  it("rejects terms.yaml without an intro.md beside it", () => {
    expect(lintTerms({ terms: "terms:\n  - term: commit\n    means: A snapshot.\n" }).join("\n"))
      .toContain("intro.md is missing");
  });
});
