// scripts/setup-shared.ts
//
// Provisions cross-lesson seed data in workshop/shared/.
//
// Default: no-op. Most workshops are content-only and don't need shared
// data — this script exits 0 with a message saying so.
//
// Replace this script's body if your workshop has shared seed data.
// Common pattern: download a file via `curl` / `fetch`, verify a
// checksum, write it to `workshop/shared/`. Keep it idempotent — safe
// to re-run, so re-invoking after the data is already present is a
// quick no-op.
//
// Example sketch (pseudocode):
//
//   const target = "workshop/shared/sample.db";
//   if (existsSync(target)) {
//     console.log(`${target} already present — skipping.`);
//     process.exit(0);
//   }
//   // fetch the file, write to `target`, verify checksum
//
// See workshop/shared/README.md for the full pattern.

console.log(
  "No shared workshop data to set up. Edit scripts/setup-shared.ts if your workshop needs seed data.",
);
process.exit(0);
