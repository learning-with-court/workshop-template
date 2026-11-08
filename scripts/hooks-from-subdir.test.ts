// Every hook command in base/.claude/settings.json must still work after the
// learner `cd`s into a subfolder: Claude Code runs hook commands from the
// session's current directory, so a relative `.claude/hooks/...` path breaks
// and the edit guard silently turns off.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_CLAUDE = join(__dirname, "..", "base", ".claude");

interface HookEntry {
  matcher?: string;
  hooks: { type: string; command: string }[];
}

// The environment with every GIT_* variable removed, so git can't resolve to the
// repo running the tests (lefthook's pre-push sets GIT_DIR and friends).
function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  return { ...env, ...extra };
}

describe("hook commands run from a subfolder", () => {
  let root: string;
  let sub: string;
  let commands: { event: string; matcher?: string; command: string }[];

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "hooks-subdir-")));
    cpSync(BASE_CLAUDE, join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, "workshop.yaml"), 'id: demo\nprotectedPaths:\n  - "scripts/**"\n');
    sub = join(root, "project");
    mkdirSync(sub);
    execFileSync("git", ["init", "-q"], { cwd: root, env: cleanEnv({}) });
    const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8")) as {
      hooks: Record<string, HookEntry[]>;
    };
    commands = Object.entries(settings.hooks).flatMap(([event, entries]) =>
      entries.flatMap((e) => e.hooks.map((h) => ({ event, matcher: e.matcher, command: h.command }))),
    );
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function run(command: string) {
    const input = JSON.stringify({
      tool_name: "Edit",
      tool_input: { file_path: join(root, "scripts", "x.ts") },
      cwd: sub,
    });
    return spawnSync("bash", ["-c", command], {
      cwd: sub,
      input,
      encoding: "utf8",
      env: cleanEnv({ CLAUDE_PROJECT_DIR: root }),
    });
  }

  it("uses a git repo inside the temp dir", () => {
    const gitDir = execFileSync("git", ["rev-parse", "--absolute-git-dir"], {
      cwd: sub,
      encoding: "utf8",
      env: cleanEnv({}),
    }).trim();
    expect(gitDir.startsWith(root + "/")).toBe(true);
  });

  it("finds every hook script", () => {
    expect(commands.length).toBeGreaterThan(0);
    for (const { command } of commands) {
      const r = run(command);
      expect(`${r.stdout}${r.stderr}`, command).not.toContain("No such file or directory");
    }
  });

  it("block-edits still blocks a protected path", () => {
    const guards = commands.filter((c) => c.event === "PreToolUse" && c.command.includes("block-edits.sh"));
    expect(guards.map((g) => g.matcher).sort()).toEqual(["Edit", "MultiEdit", "Write"]);
    for (const { command } of guards) {
      const r = run(command);
      expect(r.status).toBe(0);
      const decision = JSON.parse(r.stdout)?.hookSpecificOutput?.permissionDecision;
      expect(decision, command).toBe("deny");
    }
  });
});
