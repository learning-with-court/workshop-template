import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveActiveWorkshop,
  resolveCurrentLesson,
  firstLessonSlug,
  loadTryDecl,
  loadFixture,
  formatResult,
  runTry,
} from "../base/scripts/try.ts";

let repo: string;

function mkWorkshop(repoRoot: string, ws: string, opts: { id?: string; lessons?: string[] } = {}) {
  const id = opts.id ?? ws;
  const lessons = opts.lessons ?? ["one", "two"];
  const dir = join(repoRoot, ".workshop", ws);
  mkdirSync(dir, { recursive: true });
  const lessonLines = lessons.map((l) => `      - ${l}`).join("\n");
  writeFileSync(
    join(dir, "workshop.yaml"),
    `id: ${id}\ntitle: ${id}\nphases:\n  - id: p1\n    title: P1\n    lessons:\n${lessonLines}\n`,
  );
  return dir;
}

function mkLesson(wsDir: string, slug: string, body: string) {
  const dir = join(wsDir, `lesson_${slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "lesson.yaml"), body);
  return dir;
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "try-test-"));
});

describe("resolveActiveWorkshop", () => {
  it("returns null when there is no .workshop dir", () => {
    expect(resolveActiveWorkshop(repo)).toBeNull();
  });

  it("auto-detects the single workshop when only one exists", () => {
    mkWorkshop(repo, "solo", { id: "solo" });
    const got = resolveActiveWorkshop(repo);
    expect(got?.workshopId).toBe("solo");
    expect(got?.wsDir).toBe(join(repo, ".workshop", "solo"));
  });

  it("uses .workshop/active to pick among multiple workshops", () => {
    mkWorkshop(repo, "first", { id: "first" });
    mkWorkshop(repo, "second", { id: "second" });
    writeFileSync(join(repo, ".workshop", "active"), "second\n");
    const got = resolveActiveWorkshop(repo);
    expect(got?.workshopId).toBe("second");
    expect(got?.wsDir).toBe(join(repo, ".workshop", "second"));
  });

  it("returns null with multiple workshops and no active marker", () => {
    mkWorkshop(repo, "a", { id: "a" });
    mkWorkshop(repo, "b", { id: "b" });
    expect(resolveActiveWorkshop(repo)).toBeNull();
  });
});

describe("firstLessonSlug / resolveCurrentLesson", () => {
  it("firstLessonSlug reads the first lesson in phases", () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w", lessons: ["intro", "next"] });
    expect(firstLessonSlug(wsDir)).toBe("intro");
  });

  it("resolves the lesson from the pinned-tag marker's last segment", () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w", lessons: ["intro", "next"] });
    mkdirSync(join(repo, ".git", "lwc"), { recursive: true });
    writeFileSync(join(repo, ".git", "lwc", "pinned-tag-w"), "short/w/next\n");
    expect(resolveCurrentLesson(repo, wsDir, "w")).toBe("next");
  });

  it("falls back to the first lesson when no marker exists", () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w", lessons: ["intro", "next"] });
    expect(resolveCurrentLesson(repo, wsDir, "w")).toBe("intro");
  });

  it("falls back to the first lesson when the marker is empty/malformed", () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w", lessons: ["intro"] });
    mkdirSync(join(repo, ".git", "lwc"), { recursive: true });
    writeFileSync(join(repo, ".git", "lwc", "pinned-tag-w"), "   \n");
    expect(resolveCurrentLesson(repo, wsDir, "w")).toBe("intro");
  });
});

describe("loadTryDecl", () => {
  it("returns null when lesson.yaml is missing", () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w" });
    expect(loadTryDecl(wsDir, "absent")).toBeNull();
  });

  it("returns null when the lesson declares no try: block", () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w" });
    mkLesson(wsDir, "plain", "id: plain\ntitle: Plain\n");
    expect(loadTryDecl(wsDir, "plain")).toBeNull();
  });

  it("parses a complete try: block and defaults fixtureAs to json", () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w" });
    mkLesson(
      wsDir,
      "demo",
      "id: demo\ntry:\n  module: review\n  export: reviewWithCritic\n  fixture: fixtures/d.json\n",
    );
    expect(loadTryDecl(wsDir, "demo")).toEqual({
      module: "review",
      export: "reviewWithCritic",
      fixture: "fixtures/d.json",
      fixtureAs: "json",
    });
  });

  it("honors fixtureAs: text", () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w" });
    mkLesson(
      wsDir,
      "demo",
      "id: demo\ntry:\n  module: m\n  export: e\n  fixture: f.txt\n  fixtureAs: text\n",
    );
    expect(loadTryDecl(wsDir, "demo")?.fixtureAs).toBe("text");
  });

  it("throws on an incomplete try: block (missing fields)", () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w" });
    mkLesson(wsDir, "bad", "id: bad\ntry:\n  module: m\n");
    expect(() => loadTryDecl(wsDir, "bad")).toThrow(/missing required fields/);
  });
});

describe("loadFixture / formatResult", () => {
  it("parses a JSON fixture", () => {
    const p = join(repo, "fix.json");
    writeFileSync(p, '{"a":1}');
    expect(loadFixture(p, "json")).toEqual({ a: 1 });
  });

  it("returns raw text for fixtureAs: text", () => {
    const p = join(repo, "fix.txt");
    writeFileSync(p, "raw diff text");
    expect(loadFixture(p, "text")).toBe("raw diff text");
  });

  it("throws a helpful error on invalid JSON", () => {
    const p = join(repo, "fix.json");
    writeFileSync(p, "not json");
    expect(() => loadFixture(p, "json")).toThrow(/not valid JSON/);
  });

  it("formats objects as indented JSON and strings raw", () => {
    expect(formatResult({ ok: true })).toBe('{\n  "ok": true\n}');
    expect(formatResult("hello")).toBe("hello");
  });
});

describe("runTry (integration, no network)", () => {
  it("imports the export, feeds the fixture, and formats the result", async () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w" });
    const lessonDir = mkLesson(
      wsDir,
      "demo",
      "id: demo\ntry:\n  module: echo\n  export: shout\n  fixture: fixtures/in.json\n",
    );
    mkdirSync(join(lessonDir, "fixtures"), { recursive: true });
    writeFileSync(join(lessonDir, "fixtures", "in.json"), '{"word":"hi"}');
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(
      join(repo, "src", "echo.ts"),
      "export function shout(input: { word: string }) { return { said: input.word.toUpperCase() }; }\n",
    );
    const decl = loadTryDecl(wsDir, "demo")!;
    const out = await runTry(repo, wsDir, "demo", decl);
    expect(out).toBe('{\n  "said": "HI"\n}');
  });

  it("errors clearly when the deliverable module doesn't exist yet", async () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w" });
    mkLesson(
      wsDir,
      "demo",
      "id: demo\ntry:\n  module: notbuilt\n  export: go\n  fixture: fixtures/in.json\n",
    );
    const decl = loadTryDecl(wsDir, "demo")!;
    await expect(runTry(repo, wsDir, "demo", decl)).rejects.toThrow(/doesn't exist yet/);
  });

  it("errors when the named export isn't a function", async () => {
    const wsDir = mkWorkshop(repo, "w", { id: "w" });
    mkLesson(
      wsDir,
      "demo",
      "id: demo\ntry:\n  module: notfn\n  export: value\n  fixture: fixtures/in.json\n",
    );
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "notfn.ts"), "export const value = 42;\n");
    const decl = loadTryDecl(wsDir, "demo")!;
    await expect(runTry(repo, wsDir, "demo", decl)).rejects.toThrow(/isn't a function/);
  });
});
