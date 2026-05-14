// TEMPLATE: replace with real lesson tests. The smoke test below exercises
// the scaffold's defensive JSON parse so the workshop's reference pattern
// has a passing test from day one. Delete or extend when authoring the
// real lesson.
import { describe, it, expect } from "vitest";
import { extractJson } from "../src/extract.js";

describe("extractJson (defensive JSON parse)", () => {
  it("parses bare JSON", () => {
    expect(extractJson<{ ok: boolean }>('{"ok":true}')).toEqual({ ok: true });
  });

  it("strips ```json fences the model slipped in", () => {
    const fenced = "```json\n{\"ok\":true}\n```";
    expect(extractJson<{ ok: boolean }>(fenced)).toEqual({ ok: true });
  });

  it("strips bare ``` fences (no language tag)", () => {
    const fenced = "```\n{\"ok\":true}\n```";
    expect(extractJson<{ ok: boolean }>(fenced)).toEqual({ ok: true });
  });

  it("surfaces the raw response when parsing fails", () => {
    expect(() => extractJson("not json at all")).toThrow(/Raw response was:/);
  });
});

// ---------------------------------------------------------------------------
// Canonical reference implementation check
// ---------------------------------------------------------------------------
//
// The lesson ships a `src/canonical.<ext>` — the authoritative reference
// implementation. The test below runs BOTH the learner's target AND the
// canonical against the same fixtures and asserts both match
// `expected.json` (or whatever fixture the lesson uses).
//
// Why: this is the only check that catches drift across the three
// pieces that should agree — README prose, canonical implementation,
// and expected fixture. See src/canonical.example and
// workshop/LESSON_TEMPLATE.md for the full rationale.
//
// This test is SKIPPED in the template. The author wires it once they:
//   1. Rename src/canonical.example to src/canonical.<ext>
//   2. Implement `runCanonical()` below — workshop-specific:
//      - SQL:    open the fixture DB, execute the file, collect rows
//      - TS:     dynamic import + invoke the exported function
//      - JSON:   read + parse + normalize
//   3. Replace `it.skip(...)` with `it(...)`.
//
// Read-pedagogy lessons (no learner-edited target — the lesson body IS
// the canonical) can leave this test skipped permanently. Delete it if
// you prefer; the convention is per-lesson, not enforced by the linter.
describe("canonical reference implementation", () => {
  it.skip("canonical matches expected (template — wire per workshop)", async () => {
    // TODO: replace with the workshop-specific executor. Examples:
    //
    //   // SQL workshop:
    //   const sql = fs.readFileSync(path.join(__dirname, "../src/canonical.sql"), "utf8");
    //   const db = openFixtureDb();
    //   const result = db.prepare(sql).all();
    //
    //   // TS code lesson:
    //   const mod = await import("../src/canonical.ts");
    //   const result = mod.run(fixtureInput);
    //
    //   // JSON config lesson:
    //   const result = JSON.parse(fs.readFileSync("../src/canonical.json", "utf8"));
    //
    // const expected = JSON.parse(
    //   fs.readFileSync(path.join(__dirname, "expected.json"), "utf8"),
    // );
    // expect(result).toEqual(expected);
    expect(true).toBe(true);
  });
});
