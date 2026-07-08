// Vitest setupFile: load the repo's .env into process.env BEFORE test files are
// imported, so env-gated tests (test.skipIf(!process.env.ANTHROPIC_API_KEY)) see the
// key the platform writes into .env. Self-contained on purpose — it must work in
// every workshop that syncs this base. Walks up from this file to the first directory
// holding both `.env` and `.workshop/` (the served repo root; `base/` in the template).
import * as fs from "node:fs";
import * as path from "node:path";

let dir = path.dirname(new URL(import.meta.url).pathname);
for (let depth = 0; depth < 8; depth++) {
  const envPath = path.join(dir, ".env");
  if (fs.existsSync(envPath) && fs.existsSync(path.join(dir, ".workshop"))) {
    process.loadEnvFile(envPath);
    break;
  }
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
