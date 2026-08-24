import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync, utimesSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(
  __dirname,
  "..",
  "base",
  ".claude",
  "hooks",
  "drain-page-actions.sh",
);

/**
 * Run the real hook with a fabricated PAGES_DIR (and optionally a PATH that
 * hides curl/jq), exactly the way it runs in a lesson: no stdin it cares
 * about, stdout is the entire contract.
 *
 * MUST run async (execFile, not execFileSync): several tests below serve
 * /actions.json from an HTTP server running in this same Node process. A
 * synchronous child-process call blocks Node's single-threaded event loop
 * for its entire duration, which would starve that in-process server of the
 * chance to ever handle the hook's request — a self-deadlock, not a bug in
 * the hook. Async execFile keeps the event loop free while curl runs.
 */
async function runHook(
  pagesDir: string,
  opts: { path?: string } = {},
): Promise<{ stdout: string; code: number }> {
  try {
    const { stdout } = await execFileAsync("bash", [HOOK], {
      encoding: "utf8",
      env: {
        ...process.env,
        LWC_PAGES_DIR: pagesDir,
        ...(opts.path ? { PATH: opts.path } : {}),
      },
      timeout: 5000,
    });
    return { stdout, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; code?: number };
    return { stdout: err.stdout ?? "", code: err.code ?? -1 };
  }
}

let servers: Server[] = [];

/** Starts a loopback HTTP server that always answers /actions.json with `body`. */
function startActionsServer(body: string, status = 200): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      if (req.url === "/actions.json" && req.headers["x-lwc-page"] === "1") {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(body);
        return;
      }
      res.writeHead(400);
      res.end();
    });
    servers.push(srv);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
}

afterEach(() => {
  for (const s of servers) s.close();
  servers = [];
});

function portDir(): string {
  return mkdtempSync(join(tmpdir(), "drain-page-actions-"));
}

describe("drain-page-actions.sh", () => {
  it("is silent when the pages dir does not exist", async () => {
    const { stdout, code } = await runHook(join(tmpdir(), "definitely-not-there-xyz"));
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("is silent when the pages dir has no *.port file", async () => {
    const dir = portDir();
    const { stdout, code } = await runHook(dir);
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("is silent when the port file points at nothing (connection refused)", async () => {
    const dir = portDir();
    // Port 1 is a privileged/reserved port almost never bound in test envs.
    writeFileSync(join(dir, "demo.port"), "1\n");
    const { stdout, code } = await runHook(dir);
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("is silent when the port file is garbage (not a number)", async () => {
    const dir = portDir();
    const port = await startActionsServer(JSON.stringify([{ Kind: "hint", Note: "", At: "10:00" }]));
    writeFileSync(join(dir, "demo.port"), "not-a-port");
    const { stdout, code } = await runHook(dir);
    expect(code).toBe(0);
    expect(stdout).toBe("");
    void port;
  });

  it("is silent when the server returns an empty queue", async () => {
    const dir = portDir();
    const port = await startActionsServer("[]");
    writeFileSync(join(dir, "demo.port"), String(port));
    const { stdout, code } = await runHook(dir);
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("is silent when the server returns malformed JSON", async () => {
    const dir = portDir();
    const port = await startActionsServer("{not json at all");
    writeFileSync(join(dir, "demo.port"), String(port));
    const { stdout, code } = await runHook(dir);
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("is silent when curl is not on PATH", async () => {
    const dir = portDir();
    const port = await startActionsServer(JSON.stringify([{ Kind: "hint", Note: "", At: "10:00" }]));
    writeFileSync(join(dir, "demo.port"), String(port));
    // A PATH pointing only at a bin dir carrying symlinks to every tool the
    // hook needs (bash's builtins cover the rest) EXCEPT curl — this stands
    // in for a learner machine that genuinely lacks it, since macOS/Linux
    // both ship curl in a standard location we can't just omit from PATH.
    const binDir = mkdtempSync(join(tmpdir(), "no-curl-bin-"));
    for (const tool of ["ls", "cat", "tr", "head", "grep", "sed", "bash"]) {
      const real = ["/bin", "/usr/bin"]
        .map((p) => join(p, tool))
        .find((p) => existsSync(p));
      if (real) symlinkSync(real, join(binDir, tool));
    }
    const { stdout, code } = await runHook(dir, { path: binDir });
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("prints one line naming a single queued action", async () => {
    const dir = portDir();
    const port = await startActionsServer(
      JSON.stringify([{ Kind: "step_done", Note: "", At: "10:00" }]),
    );
    writeFileSync(join(dir, "demo.port"), String(port));
    const { stdout, code } = await runHook(dir);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('Learner pressed: "I\'m done with this step" (step_done)');
  });

  it("folds multiple queued actions into one line", async () => {
    const dir = portDir();
    const port = await startActionsServer(
      JSON.stringify([
        { Kind: "hint", Note: "", At: "10:00" },
        { Kind: "explain", Note: "", At: "10:01" },
      ]),
    );
    writeFileSync(join(dir, "demo.port"), String(port));
    const { stdout } = await runHook(dir);
    const lines = stdout.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('"Give me a hint" (hint)');
    expect(lines[0]).toContain('"Explain this step" (explain)');
  });

  it("drops an unrecognized action kind rather than surfacing it raw", async () => {
    const dir = portDir();
    const port = await startActionsServer(
      JSON.stringify([{ Kind: "some_future_kind", Note: "", At: "10:00" }]),
    );
    writeFileSync(join(dir, "demo.port"), String(port));
    const { stdout, code } = await runHook(dir);
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("reads only the most recently modified port file when several exist", async () => {
    const dir = portDir();
    const stalePort = await startActionsServer(
      JSON.stringify([{ Kind: "hint", Note: "", At: "09:00" }]),
    );
    const freshPort = await startActionsServer(
      JSON.stringify([{ Kind: "step_done", Note: "", At: "10:00" }]),
    );

    const staleFile = join(dir, "stale-workshop.port");
    const freshFile = join(dir, "fresh-workshop.port");
    writeFileSync(staleFile, String(stalePort));
    writeFileSync(freshFile, String(freshPort));

    // Force an unambiguous mtime ordering regardless of filesystem timestamp
    // resolution (some filesystems only resolve to 1s).
    const old = new Date(Date.now() - 60_000);
    const recent = new Date();
    utimesSync(staleFile, old, old);
    utimesSync(freshFile, recent, recent);

    const { stdout } = await runHook(dir);
    expect(stdout).toContain("step_done");
    expect(stdout).not.toContain("hint");
  });

  it("caps a huge response instead of dumping it into the conversation", async () => {
    const dir = portDir();
    // A single well-formed action followed by megabytes of padding the
    // 64KB read cap should truncate before jq/grep ever see valid JSON —
    // the hook must still exit 0 and print nothing, not crash or hang.
    const huge = JSON.stringify([{ Kind: "hint", Note: "x".repeat(5_000_000), At: "10:00" }]);
    const port = await startActionsServer(huge);
    writeFileSync(join(dir, "demo.port"), String(port));
    const { code } = await runHook(dir);
    expect(code).toBe(0);
  });
});
