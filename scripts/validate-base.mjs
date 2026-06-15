#!/usr/bin/env node
// Member-side base drift check. Re-hashes every path recorded in base.lock
// and fails if any differs (or is missing). No network — compares against the
// hashes written by sync-base at the last sync. Being BEHIND the template is
// not drift; LOCAL divergence from the last sync is.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

export function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function checkDrift(lock, readFile) {
  const out = [];
  for (const [path, expected] of Object.entries(lock.hashes)) {
    const content = readFile(path);
    if (content == null) {
      out.push({ path, reason: "missing" });
    } else if (sha256(content) !== expected) {
      out.push({ path, reason: "content drift" });
    }
  }
  return out;
}

// CLI: node scripts/validate-base.mjs  (run from a member repo root)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync("base.lock")) {
    console.error("validate-base: no base.lock at repo root — run sync-base first.");
    process.exit(1);
  }
  const lock = JSON.parse(readFileSync("base.lock", "utf8"));
  const mismatches = checkDrift(lock, (p) =>
    existsSync(p) ? readFileSync(p, "utf8") : null
  );
  if (mismatches.length) {
    console.error(`validate-base: ${mismatches.length} base file(s) drifted from ${lock.version}:`);
    for (const m of mismatches) console.error(`  ${m.reason}: ${m.path}`);
    console.error("Fix: revert the edit, or re-run sync-base to adopt an intended base change.");
    process.exit(1);
  }
  console.log(`validate-base: OK — ${Object.keys(lock.hashes).length} base file(s) match ${lock.version}.`);
}
