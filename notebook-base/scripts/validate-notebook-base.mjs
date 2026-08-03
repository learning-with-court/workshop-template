#!/usr/bin/env node
// Member-side NOTEBOOK base drift check. Sibling of validate-base.mjs, and
// deliberately a separate file rather than a flag on it: the two carry
// independent version lines (base-vN vs notebook-base-vN), and sync-base is
// the tool that corrupted itself during the base-v20 work, so its member-side
// twin is not somewhere to add a second concept.
//
// Re-hashes every path recorded in notebook-base.lock and fails if any differs
// or is missing. No network, no dependencies: the workflow runs bare `node`
// with no install, and Python notebook workshops have no node_modules at all.
// Being BEHIND the template is not drift; LOCAL divergence from the last sync
// is.
//
// What this does NOT check: .workshop/mechanics.yaml. That file is not synced,
// because it mixes chassis (env.*, verify.*) with pedagogy (mode, judgeNotes),
// and a template must never ship one workshop's teaching philosophy as if it
// were a technical constraint. Its SHAPE is validated at authoring time by
// lint-notebook-mechanics.ts in workshop-template, which can afford a YAML
// parser.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

export function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Marks the start of a member-owned section in an otherwise-synced file.
 *  Everything ABOVE is shared and overwritten by sync-notebook-base;
 *  everything BELOW belongs to the member and survives every sync.
 *
 *  Intentionally the SAME string the code base uses. No file appears in both
 *  base.manifest and notebook-base.manifest, so there is no ambiguity, and one
 *  sentinel means one rule for authors to remember rather than two.
 *
 *  Keep byte-identical to LOCAL_SENTINEL in the workspace's
 *  scripts/sync-base.ts (which sync-notebook-base.ts imports) and in
 *  validate-base.mjs. Different repos, no shared import, so they agree by
 *  convention. Changing it requires a notebook-base cut. */
export const LOCAL_SENTINEL =
  "# ── sync-base: local rules below this line are preserved ──";

/** Index of the sentinel, but ONLY where it begins a line.
 *
 *  Without the line-start requirement this splitting corrupts any file that
 *  DEFINES the sentinel, by splicing sharedPart(source) + localPart(target)
 *  together in the middle of a string literal and emitting an unterminated
 *  string. That happened for real on the base-v20 sync (SyntaxError at
 *  validate-base.mjs:26). Real opt-in usage always puts the sentinel on its own
 *  line, so line-start matching keeps that working and excludes the
 *  accidental self-match. */
function sentinelIndex(content) {
  for (let from = 0; ; ) {
    const i = content.indexOf(LOCAL_SENTINEL, from);
    if (i === -1) return -1;
    if (i === 0 || content[i - 1] === "\n") return i;
    from = i + 1;
  }
}

/** The synced portion: everything through the sentinel, or the whole file when
 *  absent. Hashing only this lets a member edit its local section freely while
 *  still catching edits to shared content. */
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

// CLI: node scripts/validate-notebook-base.mjs  (run from a member repo root)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync("notebook-base.lock")) {
    console.log(
      "validate-notebook-base: no notebook-base.lock — not a notebook workshop, or not yet synced. Skipping."
    );
    process.exit(0);
  }
  const lock = JSON.parse(readFileSync("notebook-base.lock", "utf8"));
  const mismatches = checkDrift(lock, (p) =>
    existsSync(p) ? readFileSync(p, "utf8") : null
  );
  if (mismatches.length) {
    console.error(
      `validate-notebook-base: ${mismatches.length} notebook base file(s) drifted from ${lock.version}:`
    );
    for (const m of mismatches) console.error(`  ${m.reason}: ${m.path}`);
    console.error(
      "Fix: revert the edit, or change it in workshop-template and re-run sync-notebook-base to adopt an intended change."
    );
    process.exit(1);
  }
  console.log(
    `validate-notebook-base: OK — ${Object.keys(lock.hashes).length} notebook base file(s) match ${lock.version}.`
  );
}
