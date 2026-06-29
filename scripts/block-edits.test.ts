import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, "..", "base", ".claude", "hooks", "block-edits.sh");

/**
 * Invoke the real block-edits.sh hook with a PreToolUse payload and return its
 * parsed decision. The hook prints a JSON object with a `deny` decision when it
 * blocks, and prints nothing (exit 0) when it allows.
 */
function runHook(input: object): { blocked: boolean; reason?: string } {
  const out = execFileSync("bash", [HOOK], {
    input: JSON.stringify(input),
    encoding: "utf8",
  }).trim();
  if (out === "") return { blocked: false };
  const parsed = JSON.parse(out);
  return {
    blocked: parsed?.hookSpecificOutput?.permissionDecision === "deny",
    reason: parsed?.hookSpecificOutput?.permissionDecisionReason,
  };
}

const edit = (repo: string, rel: string) => ({
  tool_name: "Write",
  tool_input: { file_path: join(repo, rel) },
  cwd: repo,
});

describe("block-edits.sh", () => {
  let repo: string; // served layout (.workshop/<id>/lesson_<slug>/)
  let authoringRepo: string; // authoring layout (workshops/<id>/lessons/<NN>-<slug>/)

  beforeAll(() => {
    // --- Served layout fixture (what a learner actually has) ---
    repo = mkdtempSync(join(tmpdir(), "block-edits-served-"));
    const wsDir = join(repo, ".workshop", "demo");
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(
      join(wsDir, "workshop.yaml"),
      [
        "id: demo",
        "protectedPaths:",
        '  - ".claude/skills/*.md"',
        '  - "**/*.test.ts"',
        '  - "scripts/**"',
        "",
      ].join("\n"),
    );
    const lessonDir = join(wsDir, "lesson_skills");
    mkdirSync(lessonDir, { recursive: true });
    writeFileSync(
      join(lessonDir, "lesson.yaml"),
      [
        "id: skills",
        "title: Skills",
        "targetFiles:",
        "  - .claude/skills/review-style-guide.md",
        'verifyCommand: "pnpm exec vitest run src/skills.test.ts || true"',
        "",
      ].join("\n"),
    );

    // --- Authoring layout fixture (workshops/<id>/lessons/<NN>-<slug>/) ---
    authoringRepo = mkdtempSync(join(tmpdir(), "block-edits-authoring-"));
    const awsDir = join(authoringRepo, ".workshop", "demo");
    mkdirSync(awsDir, { recursive: true });
    writeFileSync(
      join(awsDir, "workshop.yaml"),
      ["id: demo", "protectedPaths:", '  - ".claude/skills/*.md"', ""].join("\n"),
    );
    const aLessonDir = join(authoringRepo, "workshops", "demo", "lessons", "04-skills");
    mkdirSync(aLessonDir, { recursive: true });
    writeFileSync(
      join(aLessonDir, "lesson.yaml"),
      [
        "id: skills",
        "targetFiles:",
        "  - .claude/skills/review-style-guide.md",
        "",
      ].join("\n"),
    );
  });

  it("(a) allows a declared targetFile even though it matches a protected glob", () => {
    const r = runHook(edit(repo, ".claude/skills/review-style-guide.md"));
    expect(r.blocked).toBe(false);
  });

  it("(b) still blocks a non-targetFile coaching skill under the same protected glob", () => {
    const r = runHook(edit(repo, ".claude/skills/claude-code-skills.md"));
    expect(r.blocked).toBe(true);
    expect(r.reason).toMatch(/protected path/);
  });

  it("(c) blocks test files unconditionally — even a targetFile would not save them", () => {
    const r = runHook(edit(repo, "src/skills.test.ts"));
    expect(r.blocked).toBe(true);
    expect(r.reason).toMatch(/shipped test/);
  });

  it("(c) blocks test files even with the autopilot marker present", () => {
    writeFileSync(join(repo, ".workshop-autopilot-active"), "");
    try {
      const r = runHook(edit(repo, "src/skills.test.ts"));
      expect(r.blocked).toBe(true);
      expect(r.reason).toMatch(/shipped test/);
    } finally {
      rmSync(join(repo, ".workshop-autopilot-active"));
    }
  });

  it("(d) the marker bypasses a non-targetFile protected path", () => {
    writeFileSync(join(repo, ".workshop-autopilot-active"), "");
    try {
      const r = runHook(edit(repo, ".claude/skills/claude-code-skills.md"));
      expect(r.blocked).toBe(false);
    } finally {
      rmSync(join(repo, ".workshop-autopilot-active"));
    }
  });

  it("targetFiles exemption works in the authoring layout too", () => {
    const r = runHook(edit(authoringRepo, ".claude/skills/review-style-guide.md"));
    expect(r.blocked).toBe(false);
  });

  it("the learner-facing block message does NOT advertise the autopilot marker", () => {
    const r = runHook(edit(repo, ".claude/skills/claude-code-skills.md"));
    expect(r.blocked).toBe(true);
    expect(r.reason).not.toMatch(/workshop-autopilot-active/);
  });

  it("leaves unprotected src/ files writable (Model Y)", () => {
    const r = runHook(edit(repo, "src/prompt.ts"));
    expect(r.blocked).toBe(false);
  });
});
