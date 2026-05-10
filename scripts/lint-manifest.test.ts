// scripts/lint-manifest.test.ts
import { describe, it, expect } from "vitest";
import { lintManifest } from "./lint-manifest.js";

describe("lintManifest", () => {
  it("passes on the real workshop content", async () => {
    const result = await lintManifest({ repoRoot: process.cwd() });
    expect(result.errors).toEqual([]);
  });
});
