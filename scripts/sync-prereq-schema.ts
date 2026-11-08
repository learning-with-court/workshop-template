// scripts/sync-prereq-schema.ts
// Refreshes scripts/prerequisite.schema.json, the byte copy of platform's
// generated packages/server/schema/prerequisite.schema.json that
// lint-manifest.ts validates prerequisites against. Run: pnpm sync:prereq-schema
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const text = execFileSync(
  "gh",
  [
    "api",
    "repos/learning-with-court/platform/contents/packages/server/schema/prerequisite.schema.json?ref=dev",
    "-H",
    "Accept: application/vnd.github.raw",
  ],
  { encoding: "utf8" },
);
JSON.parse(text); // refuse to write anything that isn't JSON
const out = new URL("./prerequisite.schema.json", import.meta.url);
writeFileSync(out, text);
console.log(`wrote ${out.pathname}`);
