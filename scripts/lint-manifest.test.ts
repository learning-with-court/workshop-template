// scripts/lint-manifest.test.ts
import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { lintManifest } from "./lint-manifest.js";

// Resolve repo root from this test file's location so the test passes
// regardless of cwd (works under both `pnpm test:scripts` and `pnpm -r test`).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

describe("lintManifest", () => {
  it("passes on the canonical example workshop (unified compose layout)", async () => {
    const result = await lintManifest({ repoRoot: REPO_ROOT, workshopRoot: "workshops/example" });
    expect(result.errors).toEqual([]);
  });
});
