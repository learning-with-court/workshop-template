---
started: 2026-06-28
---

# Implementation Plan: Block-edits hook targets our work, not the learner's deliverables

## Overview
Two surgical changes to `base/.claude/hooks/block-edits.sh` (the canonical chassis
copy that `sync-base` propagates to all workshop members):

1. **Exempt each lesson's declared `targetFiles` from `protectedPaths`.** Collect
   `targetFiles` from the served `lesson.yaml` files the same layout-agnostic way
   the hook already collects `workshop.yaml` `protectedPaths` (repo root + every
   `.workshop/<id>/`). If the edited path matches a declared `targetFile`, allow
   (exit 0) **before** the `protectedPaths` denial. The test-file unconditional
   block stays ahead of this (tests are never targetFiles-writable).
2. **Stop advertising `.workshop-autopilot-active` in the learner-facing block
   message.** Remove the "run `touch .workshop-autopilot-active`…" sentence from
   the `protectedPaths` denial reason. **Keep** the marker bypass logic itself
   (walker/operator rely on it).

No change to `protectedPaths`, the test-file unconditional block, `src/` openness,
or anything else.

## Implementation Steps
- [x] Step 1: Add a `targetFiles` collection + match in `block-edits.sh`, placed
      after the unconditional test-file block and after the marker bypass, but
      **before** the `protectedPaths` loop. Discover `lesson.yaml` files
      layout-agnostically: `$ROOT/.workshop/*/lesson_*/lesson.yaml` (served) plus
      the authoring layout `$ROOT/workshops/*/lessons/*/lesson.yaml` if present.
      Parse each file's `targetFiles:` YAML list (same block-scanning approach as
      `protectedPaths`). On an Edit/Write/MultiEdit whose `rel` matches a declared
      targetFile, `exit 0` (allow).
- [x] Step 2: Remove the `touch .workshop-autopilot-active` sentence from the
      `protectedPaths` block reason string. Keep the rest of the message
      ("make this edit yourself … that hands-on moment IS the lesson").
- [x] Step 3: Update the file's header comment so the bypass note no longer reads
      as learner guidance (it documents the operator/walker marker), and document
      the new targetFiles exemption.
- [x] Step 4: Add a vitest test (`scripts/block-edits.test.ts`) that pipes JSON
      into the hook via bash and asserts: (a) a declared targetFile under a
      protected glob is ALLOWED; (b) a non-targetFile coaching skill under the
      same glob is still BLOCKED; (c) test files still BLOCKED (even with marker);
      (d) the marker bypasses a non-targetFile protected path. Cover both served
      (`.workshop/<id>/lesson_*/`) and authoring (`workshops/<id>/lessons/`)
      lesson.yaml layouts for the targetFiles discovery.
- [x] Step 5: Run `pnpm test:scripts` + existing validate/synth scripts; all green.

## Technical Decisions
- **Reuse the existing block-scanning parser.** The hook already has a robust
  `protectedPaths:`-list scanner (lines after the key, `- ` entries until a
  non-list line). `targetFiles:` uses identical YAML syntax, so the same loop
  applies — no YAML dependency added to a shell hook.
- **Allow targetFiles before protectedPaths, after the test block.** Ordering:
  (1) unconditional test block → (2) marker bypass → (3) targetFiles allow →
  (4) protectedPaths deny → (5) allow. A targetFile that is also a `*.test.*`
  stays blocked (test block runs first). The marker still short-circuits
  everything non-test, unchanged.
- **No `protectedPaths` change, no new metadata.** `targetFiles` already exists in
  every lesson.yaml. The coaching skills are NOT targetFiles, so they stay
  protected; `.claude/skills/review-style-guide.md` IS a targetFile, so it becomes
  writable — exactly the disposition in notes #2/#3/#7.

## Testing Strategy
A self-contained vitest test invokes the actual `block-edits.sh` via `execFileSync`
(bash, stdin JSON), so it exercises the real shell logic — no reimplementation.
Scaffolds a tmpdir with a `workshop.yaml` (protectedPaths incl. `.claude/skills/*.md`
and a `*.test.*` rule) and a lesson.yaml declaring a targetFile under that glob.
Asserts deny/allow via the JSON `permissionDecision` in the hook's stdout (or its
absence = allow). Matches the existing `scripts/*.test.ts` harness style.

## Risks & Mitigations
- **Risk:** `targetFiles` globs could be broader than intended and over-exempt.
  *Mitigation:* targetFiles are explicit per-lesson file paths (e.g.
  `.claude/skills/review-style-guide.md`), not wildcards; match is exact-glob like
  protectedPaths. The test asserts a sibling coaching skill is still blocked.
- **Risk:** breaking the test-file immutability contract.
  *Mitigation:* the unconditional test block stays first; a test asserts a
  `*.test.*` path is blocked even when listed as a targetFile / with the marker.
- **Risk:** layout drift (served vs authoring).
  *Mitigation:* discover both `.workshop/*/lesson_*/lesson.yaml` and
  `workshops/*/lessons/*/lesson.yaml`; test covers both.
