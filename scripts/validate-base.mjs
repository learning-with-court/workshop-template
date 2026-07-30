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

/** Marks the start of a member-owned section in an otherwise-synced file.
 *  Everything ABOVE is shared and overwritten by sync-base; everything BELOW
 *  belongs to the member and is preserved across syncs.
 *
 *  Exists because a verbatim file cannot hold local additions: the next sync
 *  silently drops them. `.gitignore` is the case that forced it — ignore rules
 *  describe the artifacts a workshop's OWN toolchain leaves behind, so they are
 *  legitimately local, but the file still carries shared rules worth syncing.
 *
 *  Keep this string byte-identical to LOCAL_SENTINEL in the workspace's
 *  scripts/sync-base.ts — the two live in different repos and cannot import
 *  each other, so they agree by convention. Changing it is a base cut. */
export const LOCAL_SENTINEL =
  "# ── sync-base: local rules below this line are preserved ──";

/** The synced portion of a file: everything through the sentinel, or the whole
 *  file when there is no sentinel. Hashing only this lets a member edit its
 *  local section freely while still catching edits to shared content. */
/** Index of the sentinel, but ONLY where it begins a line.
 *
 *  Without the line-start requirement, this splitting corrupts the very files
 *  that DEFINE the sentinel: this file and the workspace's sync-base.ts both
 *  contain the literal string, indented inside a string assignment. sync-base's
 *  mergeLocal would then write sharedPart(source) + localPart(target), splicing
 *  the halves together mid string-literal and emitting an unterminated string.
 *  Observed for real on the base-v20 sync: SyntaxError at line 26 of this file.
 *  Real opt-in usage (.gitignore) always puts the sentinel on its own line, so
 *  line-start matching keeps that working and excludes the self-match.
 *
 *  Keep this behaviour identical to sentinelIndex in the workspace's
 *  scripts/sync-base.ts — the two cannot import each other. */
function sentinelIndex(content) {
  for (let from = 0; ; ) {
    const i = content.indexOf(LOCAL_SENTINEL, from);
    if (i === -1) return -1;
    if (i === 0 || content[i - 1] === "\n") return i;
    from = i + 1;
  }
}

export function sharedPart(content) {
  const i = sentinelIndex(content);
  if (i === -1) return content;
  return content.slice(0, i + LOCAL_SENTINEL.length) + "\n";
}

/** The member-owned portion: everything after the sentinel. "" when absent. */
export function localPart(content) {
  const i = sentinelIndex(content);
  if (i === -1) return "";
  return content.slice(i + LOCAL_SENTINEL.length).replace(/^\n/, "");
}

export function checkDrift(lock, readFile) {
  const out = [];
  for (const [path, expected] of Object.entries(lock.hashes)) {
    const content = readFile(path);
    if (content == null) {
      out.push({ path, reason: "missing" });
    } else if (sha256(sharedPart(content)) !== expected) {
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
