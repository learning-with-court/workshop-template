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
