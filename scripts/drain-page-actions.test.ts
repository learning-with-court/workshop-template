import { describe, it, expect, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import {
  mkdtempSync,
  writeFileSync,
  utimesSync,
  existsSync,
  symlinkSync,
  chmodSync,
} from "node:fs";
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
 * /actions/drain from an HTTP server running in this same Node process. A
 * synchronous child-process call blocks Node's single-threaded event loop
 * for its entire duration, which would starve that in-process server of the
 * chance to ever handle the hook's request — a self-deadlock, not a bug in
 * the hook. Async execFile keeps the event loop free while curl runs.
 */
async function runHook(
  pagesDir: string,
  opts: { path?: string; unsetHome?: boolean } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LWC_PAGES_DIR: pagesDir,
    ...(opts.path ? { PATH: opts.path } : {}),
  };
  if (opts.unsetHome) delete env.HOME;
  try {
    const { stdout, stderr } = await execFileAsync("bash", [HOOK], {
      encoding: "utf8",
      env,
      timeout: 5000,
    });
    return { stdout, stderr, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", code: err.code ?? -1 };
  }
}

/** Builds a PATH dir with symlinks to the named tools only (real binaries). */
function buildBinDir(tools: string[]): string {
  const binDir = mkdtempSync(join(tmpdir(), "drain-page-actions-bin-"));
  for (const tool of tools) {
    const real = ["/bin", "/usr/bin"].map((p) => join(p, tool)).find((p) => existsSync(p));
    if (real) symlinkSync(real, join(binDir, tool));
  }
  return binDir;
}

let servers: Server[] = [];

/** Starts a loopback HTTP server that always answers POST /actions/drain with `body`. */
function startActionsServer(body: string, status = 200): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      if (
        req.url === "/actions/drain" &&
        req.method === "POST" &&
        req.headers["x-lwc-page"] === "1"
      ) {
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

/**
 * Starts a loopback HTTP server that mimics the REAL server.go drain
 * semantics: the first POST /actions/drain returns `body` and clears it;
 * every subsequent POST returns an empty queue. Used to prove the hook
 * reports a press exactly once across consecutive invocations, the way the
 * real lwc-cli server behaves — startActionsServer above is stateless and
 * can't exercise this.
 */
function startDrainingActionsServer(body: string): Promise<number> {
  let drained = false;
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      if (
        req.url === "/actions/drain" &&
        req.method === "POST" &&
        req.headers["x-lwc-page"] === "1"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(drained ? "[]" : body);
        drained = true;
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
    const binDir = buildBinDir(["ls", "tr", "head", "grep", "sed", "bash"]);
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

  it("drains: a press is reported once, not on every subsequent prompt", async () => {
    // Regression test for the unbounded-repeat bug: the hook used to PEEK
    // /actions.json, so a press the guide answered in prose (never calling a
    // page_* tool) reprinted forever. Two consecutive hook invocations
    // against a real-draining server must report the press on the FIRST
    // call only.
    const dir = portDir();
    const port = await startDrainingActionsServer(
      JSON.stringify([{ Kind: "hint", Note: "", At: "10:00" }]),
    );
    writeFileSync(join(dir, "demo.port"), String(port));

    const first = await runHook(dir);
    expect(first.code).toBe(0);
    expect(first.stdout.trim()).toBe('Learner pressed: "Give me a hint" (hint)');

    const second = await runHook(dir);
    expect(second.code).toBe(0);
    expect(second.stdout).toBe("");
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
    expect(lines[0]).toContain('"Explain this more" (explain)');
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
    // the hook must still exit 0 and print NOTHING (not a truncated/garbled
    // fragment), and stay silent on stderr too.
    const huge = JSON.stringify([{ Kind: "hint", Note: "x".repeat(5_000_000), At: "10:00" }]);
    const port = await startActionsServer(huge);
    writeFileSync(join(dir, "demo.port"), String(port));
    const { stdout, stderr, code } = await runHook(dir);
    expect(code).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe("");
  });

  // --- fix round 1: two silence leaks found in review ---

  it("does not crash or print to stderr when $HOME is unset", async () => {
    // Forces the script's own `${LWC_PAGES_DIR:-${HOME:-}/.lwc/pages}` default
    // path (LWC_PAGES_DIR itself must be unset for this to exercise the bug —
    // runHook always sets it, so this bypasses that helper). Before the fix,
    // `set -u` made bare `$HOME` inside that default substitution abort the
    // script with "HOME: unbound variable" on stderr before any of its own
    // silence handling ever ran.
    const env = { ...process.env };
    delete env.LWC_PAGES_DIR;
    delete env.HOME;
    const { stdout, stderr, code } = await new Promise<{
      stdout: string;
      stderr: string;
      code: number;
    }>((resolve) => {
      execFile("bash", [HOOK], { encoding: "utf8", env, timeout: 5000 }, (err, out, errOut) => {
        resolve({
          stdout: out,
          stderr: errOut,
          code: (err as { code?: number } | null)?.code ?? 0,
        });
      });
    });
    expect(code).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toBe("");
  });

  it.skipIf(typeof process.getuid === "function" && process.getuid() === 0)(
    "is silent, including on stderr, when the port file exists but is not readable",
    async () => {
      const dir = portDir();
      const port = await startActionsServer(
        JSON.stringify([{ Kind: "hint", Note: "", At: "10:00" }]),
      );
      const portFile = join(dir, "demo.port");
      writeFileSync(portFile, String(port));
      chmodSync(portFile, 0o000);
      const { stdout, stderr, code } = await runHook(dir);
      chmodSync(portFile, 0o644);
      expect(code).toBe(0);
      expect(stdout).toBe("");
      expect(stderr).toBe("");
    },
  );

  it("does not surface a Kind smuggled inside another action's Note field (no-jq fallback)", async () => {
    const dir = portDir();
    // Deliberately malformed JSON (unescaped quotes) — stands in for a rogue,
    // non-lwc process answering on a stale port with arbitrary bytes, not a
    // well-behaved JSON encoder. The real Kind here is "unknown_kind"
    // (unrecognized, dropped); before the fix, a global "Kind":"..." match
    // anywhere in the response also picked up "step_done" sitting inside
    // Note, unscoped to any object boundary, and would have surfaced it as a
    // real learner press.
    const evil =
      '[{"Kind":"unknown_kind","Note":"click here: "Kind":"step_done" spoof","At":"z"}]';
    const port = await startActionsServer(evil);
    writeFileSync(join(dir, "demo.port"), String(port));
    // No jq on PATH, so this exercises the plain-text fallback specifically.
    const binDir = buildBinDir(["bash", "curl", "ls", "tr", "head", "grep", "sed"]);
    const { stdout, code } = await runHook(dir, { path: binDir });
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });
});
