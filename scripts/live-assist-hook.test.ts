import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, "..", "base", ".claude", "hooks", "live-assist.sh");

/**
 * Run the real hook with a fabricated PATH, so we control whether `lwc` exists
 * and what it does. Returns stdout and the exit code — the hook's entire
 * contract is "what did you print, and did you exit 0".
 */
function runHook(
  args: string[],
  opts: { lwc?: string; input?: string } = {},
): { stdout: string; code: number } {
  const bin = mkdtempSync(join(tmpdir(), "live-assist-bin-"));
  if (opts.lwc !== undefined) {
    const p = join(bin, "lwc");
    writeFileSync(p, opts.lwc);
    chmodSync(p, 0o755);
  }
  try {
    const stdout = execFileSync("bash", [HOOK, ...args], {
      input: opts.input ?? "{}",
      encoding: "utf8",
      // Keep coreutils available, but `lwc` exists only if we wrote one above.
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    });
    return { stdout, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { stdout: err.stdout ?? "", code: err.status ?? -1 };
  }
}

const echoingLwc = `#!/bin/bash\necho "CALLED: $*"\n`;

describe("live-assist.sh", () => {
  it("passes the hook event through to `lwc assist turn`", () => {
    const { stdout, code } = runHook(["UserPromptSubmit"], { lwc: echoingLwc });
    expect(code).toBe(0);
    expect(stdout).toContain("CALLED: assist turn --hook-event UserPromptSubmit");
  });

  it("passes Stop through as its own event", () => {
    const { stdout } = runHook(["Stop"], { lwc: echoingLwc });
    expect(stdout).toContain("CALLED: assist turn --hook-event Stop");
  });

  it("defaults to UserPromptSubmit when invoked with no argument", () => {
    const { stdout, code } = runHook([], { lwc: echoingLwc });
    expect(code).toBe(0);
    expect(stdout).toContain("--hook-event UserPromptSubmit");
  });

  it("forwards the hook payload on stdin", () => {
    const { stdout } = runHook(["UserPromptSubmit"], {
      lwc: `#!/bin/bash\ncat\n`,
      input: '{"prompt":"why is verify failing?"}',
    });
    expect(stdout).toContain("why is verify failing?");
  });

  it("relays assist context so the session can inject it", () => {
    const { stdout } = runHook(["UserPromptSubmit"], {
      lwc: `#!/bin/bash\necho "<lwc-live-assist>"\necho "[operator-whisper] check the .env"\necho "</lwc-live-assist>"\n`,
    });
    expect(stdout).toContain("[operator-whisper] check the .env");
  });

  // --- the fail-quiet contract: a degraded stream must cost the learner nothing

  it("is silent and succeeds when the CLI is not installed", () => {
    const { stdout, code } = runHook(["UserPromptSubmit"]); // no lwc on PATH
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 when the CLI fails", () => {
    const { stdout, code } = runHook(["UserPromptSubmit"], {
      lwc: `#!/bin/bash\nexit 1\n`,
    });
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("swallows CLI stderr rather than surfacing it to the session", () => {
    const { stdout, code } = runHook(["UserPromptSubmit"], {
      lwc: `#!/bin/bash\necho "boom: network unreachable" >&2\nexit 2\n`,
    });
    expect(code).toBe(0);
    expect(stdout).toBe("");
  });

  it("exits 0 even when the CLI is killed by a signal", () => {
    const { code } = runHook(["UserPromptSubmit"], {
      lwc: `#!/bin/bash\nkill -TERM $$\n`,
    });
    expect(code).toBe(0);
  });
});
