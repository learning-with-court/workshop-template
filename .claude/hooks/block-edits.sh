#!/bin/bash
# block-edits.sh — PreToolUse hook
#
# Workshop rule: protect OUR work; let the learner prompt Claude to create THEIRS.
# This hook enforces immutability on the paths each workshop lists in its
# workshop.yaml under `protectedPaths:` (coaching skills, `.workshop/**`,
# `scripts/**`, tests, `base.lock`, …) — while LEAVING each lesson's declared
# `targetFiles` (the learner's deliverables) agent-writable under the
# prompt-driven (Model Y) pedagogy.
#
# Three tiers, evaluated in this order:
#   1. **Test files (`*.test.*`) are the SHIPPED verification contract** — blocked
#      UNCONDITIONALLY, even with the operator marker. The walker RUNS the lesson's
#      verifyCommand (which names the test); it never authors or edits a test. A
#      "missing" test is a provisioning issue to surface, not a cue to write one.
#   2. **Lesson `targetFiles` are the learner's deliverables** — allowed, so the
#      learner can prompt Claude to create their own work (e.g. the skills lesson's
#      `.claude/skills/review-style-guide.md`). The ~48 internal coaching skills are
#      NOT targetFiles, so they stay protected by the glob below.
#   3. **All other `protectedPaths`** are denied (the learner edits these by hand),
#      with the operator bypass below.
#
# Operator/walker bypass (non-test paths only): `touch .workshop-autopilot-active`
# at the repo root. This is an OPERATOR/walker affordance — it is NOT surfaced to
# learners (the learner-facing block message no longer mentions it), because the
# marker is a blanket unlock for every non-test protected path. Delete it when done.
#
# Discovery is layout-agnostic: it checks the repo root (single-workshop repos)
# and every `.workshop/<id>/` dir (monorepo / served workshops) for workshop.yaml,
# and the served (`.workshop/<id>/lesson_*/lesson.yaml`) + authoring
# (`workshops/<id>/lessons/*/lesson.yaml`) layouts for lesson targetFiles — so the
# hook works unchanged whether it ships in the template or a CCA-style monorepo.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILEPATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

block_with_reason() {
  cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": $1
  }
}
JSON
  exit 0
}

# Relative path (strip cwd/pwd prefix) for glob matching.
rel="$FILEPATH"
if [[ -n "$CWD" && "$FILEPATH" == "$CWD/"* ]]; then
  rel="${FILEPATH#$CWD/}"
elif [[ "$FILEPATH" == "$PWD/"* ]]; then
  rel="${FILEPATH#$PWD/}"
fi

# Tier 1 — UNCONDITIONAL: test files are the immutable shipped contract. No bypass.
if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" || "$TOOL" == "MultiEdit" ]]; then
  case "$rel" in
    *.test.*|*.test)
      block_with_reason "\"Workshop rule: '$rel' is a shipped test — the verification contract, and it is immutable. Do NOT author, edit, or fix test files. Run the lesson's verifyCommand exactly as written (it names the test), then narrate the real output. If a test seems missing, that's a setup/provisioning issue to surface — not a cue to write one.\""
      ;;
  esac
fi

# Marker bypass — applies to the OTHER protected paths only (test files already
# handled above and cannot be bypassed). Operator/walker affordance, not surfaced
# to learners.
if [[ -n "$CWD" && -f "$CWD/.workshop-autopilot-active" ]]; then
  exit 0
fi
if [[ -f "$PWD/.workshop-autopilot-active" ]]; then
  exit 0
fi

# Tier 2 — lesson targetFiles are the learner's deliverables: ALLOW (so the learner
# can prompt Claude to create their own work). Evaluated AFTER the unconditional
# test block (a targetFile that is also a test stays blocked) and BEFORE the
# protectedPaths denial (so a deliverable under a protected glob — e.g. the skills
# lesson's `.claude/skills/review-style-guide.md` under `.claude/skills/*.md` — is
# writable, while the coaching skills, which are NOT targetFiles, stay protected).
if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" || "$TOOL" == "MultiEdit" ]]; then
  ROOT="${CWD:-$PWD}"

  # Collect candidate lesson.yaml files across both served and authoring layouts:
  #   served:    .workshop/<id>/lesson_<slug>/lesson.yaml
  #   authoring: workshops/<id>/lessons/<NN>-<slug>/lesson.yaml
  LESSON_YAMLS=()
  if [[ -d "$ROOT/.workshop" ]]; then
    for ly in "$ROOT"/.workshop/*/lesson_*/lesson.yaml; do
      [[ -f "$ly" ]] && LESSON_YAMLS+=("$ly")
    done
  fi
  if [[ -d "$ROOT/workshops" ]]; then
    for ly in "$ROOT"/workshops/*/lessons/*/lesson.yaml; do
      [[ -f "$ly" ]] && LESSON_YAMLS+=("$ly")
    done
  fi

  for LESSON_YAML in "${LESSON_YAMLS[@]}"; do
    # Extract the targetFiles list (lines after `targetFiles:` until the next
    # non-list line) — same YAML-list scanning approach as protectedPaths below.
    in_block=0
    while IFS= read -r line; do
      if [[ "$line" =~ ^targetFiles: ]]; then
        in_block=1
        continue
      fi
      if [[ "$in_block" -eq 1 ]]; then
        if [[ "$line" =~ ^[[:space:]]*- ]]; then
          target=$(echo "$line" | sed 's/^[[:space:]]*-[[:space:]]*//' | tr -d '"'"'")
          case "$rel" in
            $target)
              # Declared deliverable for some lesson — allow it.
              exit 0
              ;;
          esac
        else
          in_block=0
        fi
      fi
    done < "$LESSON_YAML"
  done
fi

# Tier 3 — protectedPaths denial.
if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" || "$TOOL" == "MultiEdit" ]]; then
  # Repo root: prefer the tool-reported cwd, fall back to the hook's PWD.
  ROOT="${CWD:-$PWD}"

  # Collect candidate workshop.yaml files: repo root (single-workshop) plus every
  # .workshop/<id>/workshop.yaml (monorepo). A learner usually has exactly one.
  WORKSHOP_YAMLS=()
  [[ -f "$ROOT/workshop.yaml" ]] && WORKSHOP_YAMLS+=("$ROOT/workshop.yaml")
  if [[ -d "$ROOT/.workshop" ]]; then
    for wy in "$ROOT"/.workshop/*/workshop.yaml; do
      [[ -f "$wy" ]] && WORKSHOP_YAMLS+=("$wy")
    done
  fi

  for WORKSHOP_YAML in "${WORKSHOP_YAMLS[@]}"; do
    # Extract the protectedPaths list from the YAML (lines after
    # `protectedPaths:` until the next non-list line).
    in_block=0
    while IFS= read -r line; do
      if [[ "$line" =~ ^protectedPaths: ]]; then
        in_block=1
        continue
      fi
      if [[ "$in_block" -eq 1 ]]; then
        if [[ "$line" =~ ^[[:space:]]*- ]]; then
          glob=$(echo "$line" | sed 's/^[[:space:]]*-[[:space:]]*//' | tr -d '"'"'")
          case "$rel" in
            $glob)
              block_with_reason "\"Workshop rule: '$rel' is a protected path (matched '$glob'). Please make this edit yourself in your editor — that hands-on moment IS the lesson.\""
              ;;
          esac
        else
          in_block=0
        fi
      fi
    done < "$WORKSHOP_YAML"
  done
fi

# Anything else: allow.
exit 0
