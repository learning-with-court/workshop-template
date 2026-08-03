import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { lintText, checkInvariants, KNOWN_BUILD_KEYS } from "./lint-notebook-mechanics.ts";

/** A minimal document that passes everything, for tests to perturb. */
const OK = `
version: 1
medium: python-notebook
mode: presented
env:
  python: "3.12"
  reuse:
    - ".venv"
  build:
    - name: "Installing workshop dependencies"
      editable: true
      install: ["."]
    - name: "Materializing lesson notebooks"
      mkdir: "notebooks"
      run: ["jupytext", "--quiet", "--sync", "src/*.py"]
verify:
  collect: ".venv/bin/pytest --collect-only -q tests/"
  notBuiltPatterns: ["not materialized"]
  shipsBrokenPatterns: ["ImportError"]
`;

describe("lintText", () => {
  it("accepts a well-formed document", () => {
    expect(lintText(OK)).toEqual([]);
  });

  it("reports invalid YAML rather than throwing", () => {
    const issues = lintText("medium: [unclosed");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(/not valid YAML/);
  });

  it("requires the notebook medium", () => {
    const issues = lintText(OK.replace("medium: python-notebook", "medium: sql"));
    expect(issues.some((i) => i.path === "medium")).toBe(true);
  });

  // An unquoted 3.10 parses as the float 3.1, silently requesting 3.1.
  it("rejects an unquoted python version", () => {
    const issues = lintText(OK.replace('python: "3.12"', "python: 3.10"));
    expect(issues.some((i) => i.path === "env.python")).toBe(true);
  });

  it("requires the verify classification patterns", () => {
    const issues = lintText(OK.replace('notBuiltPatterns: ["not materialized"]', "notBuiltPatterns: []"));
    expect(issues.some((i) => i.path === "env.verify.notBuiltPatterns" || i.path === "verify.notBuiltPatterns")).toBe(true);
  });
});

// The hard rule: pedagogy is none of this linter's business. If any of these
// start failing, the template has begun dictating teaching style.
describe("pedagogy passthrough", () => {
  it("accepts either mode without comment", () => {
    expect(lintText(OK)).toEqual([]);
    expect(lintText(OK.replace("mode: presented", "mode: builder"))).toEqual([]);
  });

  it("accepts a document carrying judgeNotes, contentNotes and learnerBrief", () => {
    const withPedagogy =
      OK +
      `
learnerBrief: ".workshop/learner-brief.md"
contentNotes: |
  Read these artifacts as courseware.
judgeNotes: |
  This workshop DOES quiz, deliberately.
`;
    expect(lintText(withPedagogy)).toEqual([]);
  });

  it("does not require mode at all", () => {
    expect(lintText(OK.replace("mode: presented\n", ""))).toEqual([]);
  });
});

describe("checkInvariants", () => {
  const doc = (yaml: string) => {
    // Reuse lintText's schema pass by asserting the fixture is otherwise valid,
    // then inspect invariants directly.
    return yaml;
  };

  it("rejects reusing notebooks/ across lesson checkouts", () => {
    for (const bad of ["notebooks", "notebooks/"]) {
      const issues = lintText(OK.replace('- ".venv"', `- ".venv"\n    - "${bad}"`));
      expect(issues.some((i) => i.path === "env.reuse")).toBe(true);
    }
  });

  it("flags an unknown build step key as silently ignored", () => {
    const issues = lintText(OK.replace("editable: true", "editible: true"));
    expect(issues.some((i) => /unknown build step key "editible"/.test(i.message))).toBe(true);
  });

  it("names the known keys in the error so the typo is fixable", () => {
    const issues = lintText(OK.replace("editable: true", "nonsense: true"));
    const msg = issues.find((i) => /unknown build step key/.test(i.message))!.message;
    for (const k of KNOWN_BUILD_KEYS) expect(msg).toContain(k);
  });

  it("requires a jupytext step, without which notebooks/ never exists", () => {
    const issues = lintText(OK.replace('run: ["jupytext", "--quiet", "--sync", "src/*.py"]', 'run: ["true"]'));
    expect(issues.some((i) => i.path === "env.build" && /jupytext/.test(i.message))).toBe(true);
  });

  it("requires a remedy alongside a probeImport", () => {
    const withProbe = OK.replace(
      '    - name: "Materializing lesson notebooks"',
      '    - name: "Checking OpenMP"\n      probeImport: "xgboost"\n    - name: "Materializing lesson notebooks"',
    );
    const issues = lintText(withProbe);
    expect(issues.some((i) => /probeImport "xgboost" has no remedy/.test(i.message))).toBe(true);
  });

  it("accepts a probeImport that does carry a remedy", () => {
    const withProbe = OK.replace(
      '    - name: "Materializing lesson notebooks"',
      '    - name: "Checking OpenMP"\n      probeImport: "xgboost"\n      remedy:\n        darwin: "brew install libomp"\n    - name: "Materializing lesson notebooks"',
    );
    expect(lintText(withProbe)).toEqual([]);
  });

  it("is callable directly on a parsed doc", () => {
    expect(checkInvariants({ env: { build: [{ name: "x", run: ["jupytext"] }] } })).toEqual([]);
  });
});

// The reference file ships as the thing authors copy. If it stops passing its
// own linter, every workshop scaffolded from it starts out broken.
describe("the shipped reference file", () => {
  it("passes its own linter", () => {
    const text = readFileSync(new URL("../notebook-base/mechanics.reference.yaml", import.meta.url), "utf8");
    expect(lintText(text)).toEqual([]);
  });
});

// The linter's key list mirrors pyenv's parseStep switch across a repo and a
// language boundary, so nothing can enforce the coupling automatically. Pinning
// the exact set at least makes a drift a deliberate edit with a failing test,
// rather than a silent divergence that ships a broken env build to learners.
//
// Re-derive with, from the lwc-cli checkout:
//   grep -oE '^\t\tcase "[a-zA-Z]+"' internal/pyenv/build.go
describe("KNOWN_BUILD_KEYS provenance", () => {
  it("matches pyenv's parseStep switch exactly", () => {
    // Sorted for comparison; declaration order in the linter is pyenv's order.
    expect([...KNOWN_BUILD_KEYS].sort()).toEqual([
      "copy",
      "copyTree",
      "editable",
      "fatal",
      "indexUrl",
      "install",
      "mkdir",
      "name",
      "noDeps",
      "note",
      "optional",
      "probeImport",
      "remedy",
      "run",
      "to",
    ]);
  });

  it("still rejects a key pyenv would abort the build on", () => {
    // The concrete failure mode: a typo that pyenv refuses. Left unlinted it
    // aborts the whole env build, so learners get no Python environment.
    const withTypo = `
version: 1
medium: python-notebook
env:
  python: "3.12"
  build:
    - name: "Checking OpenMP"
      probeImport: "xgboost"
      fatel: true
      remedy:
        darwin: "brew install libomp"
    - name: "Materializing notebooks"
      run: ["jupytext", "--sync", "src/*.py"]
verify:
  collect: "pytest"
  notBuiltPatterns: ["x"]
  shipsBrokenPatterns: ["y"]
`;
    const issues = lintText(withTypo);
    expect(issues.some((i) => /unknown build step key "fatel"/.test(i.message))).toBe(true);
  });
});
