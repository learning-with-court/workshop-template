import { describe, it, expect } from "vitest";
import { checkDrift, sha256 } from "./validate-base.mjs";

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
