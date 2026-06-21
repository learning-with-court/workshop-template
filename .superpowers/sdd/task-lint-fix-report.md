# Task: lint-manifest Plan 1 Fix Report

Date: 2026-06-20
Branch: feature/unified-compose-model

## Summary

Fixed the `pnpm test:scripts` pre-push blocker caused by `scripts/lint-manifest.test.ts` failing after Task 4 deleted the old root `workshop.yaml` + lesson layout.

---

## 1. lintManifest() unified layout support

**File:** `scripts/lint-manifest.ts`

Added a third lesson-directory resolution mode: **unified compose** (`unifiedMode`). This activates when `workshopRoot` is set AND `<workshopRoot>/lessons/` exists. In that case each lesson key is resolved by scanning `<workshopRoot>/lessons/` for a dir whose name (after stripping a leading `\d+-`) matches the key — the same slug-matching logic as `composeLessonDir` but rooted at `wsDir/lessons/` instead of `root/lessons/`.

New function `unifiedLessonDir(wsDir, key)` implements this. Error messages updated to describe the unified layout path when this mode is active.

Layout resolution table after this change:
| Condition | Mode | Lesson path |
|-----------|------|-------------|
| No `workshopRoot` + `root/lessons/` exists | compose | `root/lessons/<NN>-<slug>/` |
| `workshopRoot` set + `<wsDir>/lessons/` exists | **unified** (new) | `<wsDir>/lessons/<NN>-<slug>/` |
| `workshopRoot` set, no `lessons/` subdir | monorepo | `<wsDir>/lesson_<slug>/` |
| No `workshopRoot`, no `lessons/` | legacy | `<wsDir>/workshop/lesson_<slug>/` |

---

## 2. workshops/example/workshop.yaml — completed

**File:** `workshops/example/workshop.yaml`

The stub was missing 8 required `Workshop` schema fields. Added:

- `repo: learning-with-court/workshop-template`
- `tagline: "A minimal forkable workshop scaffold — replace this with your first real lesson."`
- `summary:` (2-sentence placeholder describing the example's purpose)
- `difficulty: beginner`
- `tags: [example, template]`
- `install: "set up the example workshop"`
- `youWillBuild:` (2 concrete bullets matching the lesson content)
- `prerequisites:` (1 entry: TypeScript basics)

`composeShort` intentionally omitted — the unified model carries the short in `series.yaml`.

---

## 3. Test update

**File:** `scripts/lint-manifest.test.ts`

Changed `lintManifest({ repoRoot: REPO_ROOT })` (old root layout, no longer valid) to:

```ts
lintManifest({ repoRoot: REPO_ROOT, workshopRoot: "workshops/example" })
```

Test description updated to: "passes on the canonical example workshop (unified compose layout)".

---

## 4. Optional cleanup: removed "example" skip in CLI

**File:** `scripts/lint-manifest.ts` CLI block

Removed the `.filter((d) => d !== "example" && ...)` exclusion since `workshops/example` now lints clean. Running `pnpm exec tsx scripts/lint-manifest.ts` (no args) now validates the example and exits 0: `✔ manifest lint passed (1 workshop(s))`.

---

## Verify results

| Check | Result |
|-------|--------|
| `pnpm exec vitest run scripts/lint-manifest.test.ts` | ✔ 1 test passed |
| `pnpm -s test:scripts` | ✔ 3 test files, 12 tests passed |
| `pnpm exec tsx scripts/compose.ts --dry-run` | ✔ 3 tags, self-verify 1 position OK |
| `pnpm exec tsx scripts/validate-compose.ts` | ✔ validate-compose: OK |
| `pnpm exec tsx scripts/lint-manifest.ts` (CLI, no args) | ✔ manifest lint passed (1 workshop(s)) |
| `pnpm -s typecheck` | ✔ clean (no output) |

---

## Concerns

None. All paths are backward-compatible: compose mode and monorepo/legacy modes are untouched. The unified mode only activates when both `workshopRoot` and `<wsDir>/lessons/` are present, which is the new canonical layout introduced in this branch.
