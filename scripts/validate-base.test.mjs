import { describe, it, expect } from "vitest";
import { checkDrift, sha256, sharedPart, localPart, LOCAL_SENTINEL } from "./validate-base.mjs";

const lock = {
  version: "base-v1",
  hashes: { "a.txt": sha256("alpha"), "b.txt": sha256("beta") },
};

describe("checkDrift", () => {
  it("returns no mismatches when files match the lock", () => {
    const files = { "a.txt": "alpha", "b.txt": "beta" };
    const res = checkDrift(lock, (p) => files[p]);
    expect(res).toEqual([]);
  });

  it("flags a file whose content changed", () => {
    const files = { "a.txt": "alpha-EDITED", "b.txt": "beta" };
    const res = checkDrift(lock, (p) => files[p]);
    expect(res).toEqual([{ path: "a.txt", reason: "content drift" }]);
  });

  it("flags a missing file", () => {
    const files = { "b.txt": "beta" };
    const res = checkDrift(lock, (p) => (p in files ? files[p] : null));
    expect(res).toEqual([{ path: "a.txt", reason: "missing" }]);
  });
});

// A verbatim base file cannot hold local additions — the next sync silently
// drops them. The sentinel carves out a member-owned section below the line.
// Drift is judged on the SHARED portion only, so local edits are free.
describe("local section", () => {
  const shared = `# base rules\nnode_modules/\n${LOCAL_SENTINEL}\n`;
  const lockWithLocal = { version: "base-v19", hashes: { ".gitignore": sha256(shared) } };

  it("ignores edits below the sentinel", () => {
    const withLocal = shared + "extensions/*/lib/\n.venv/\n";
    expect(checkDrift(lockWithLocal, () => withLocal)).toEqual([]);
  });

  it("still catches an edit ABOVE the sentinel", () => {
    const tampered = `# base rules\nnode_modules/\nSNUCK_IN\n${LOCAL_SENTINEL}\nlocal/\n`;
    expect(checkDrift(lockWithLocal, () => tampered)).toEqual([
      { path: ".gitignore", reason: "content drift" },
    ]);
  });

  it("treats a file with no sentinel as entirely shared", () => {
    const plain = "alpha";
    expect(sharedPart(plain)).toBe("alpha");
    expect(localPart(plain)).toBe("");
  });

  it("splits shared and local cleanly", () => {
    const f = `A\n${LOCAL_SENTINEL}\nB\nC\n`;
    expect(sharedPart(f)).toBe(`A\n${LOCAL_SENTINEL}\n`);
    expect(localPart(f)).toBe("B\nC\n");
  });

  it("round-trips: shared + local reconstructs the file", () => {
    const f = `A\n${LOCAL_SENTINEL}\nB\n`;
    expect(sharedPart(f) + localPart(f)).toBe(f);
  });
});
