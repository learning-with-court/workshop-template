---
id: cca-base-block-edits
name: Block-edits hook targets our work, not the learner's deliverables
type: Bug Fix
priority: P1
effort: Small
impact: High
epic: cca-walkthrough-polish
created: 2026-06-28
---

# Block-edits hook targets our work, not the learner's deliverables

## Problem Statement
Under the prompt-driven (Model Y) pedagogy, the learner prompts Claude to create
their lesson deliverables. But the `block-edits` PreToolUse hook denies Claude's
`Write` of those deliverables when they sit under a `protectedPaths` glob.

Concretely (walkthrough note #2): the `claude-code-skills` lesson tells the
learner to "ask Claude to create `.claude/skills/review-style-guide.md`" — the
lesson's whole point. But `workshop.yaml` `protectedPaths` includes
`.claude/skills/*.md` (meant to protect the ~48 internal coaching skills), so the
hook denies the learner's own deliverable. The block message then advertises
`.workshop-autopilot-active` to the learner — a global kill-switch that should
never be surfaced (note #3): it bypasses protection on every non-test path, not
just the one the learner wants to write.

## Proposed Solution
"Protect our work, let them prompt to create theirs." Exempt each lesson's
declared `targetFiles` (the learner's deliverables) from `protectedPaths`, and
stop advertising the autopilot marker in the learner-facing block message (keep
the marker bypass logic itself for the walker/operator). No `protectedPaths`
change, no new metadata — `targetFiles` already declares the deliverables.

## Affected Areas
- base/.claude/hooks/block-edits.sh
