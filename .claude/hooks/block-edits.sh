#!/bin/bash
# block-edits.sh — PreToolUse hook
#
# Workshop rule: the learner does the editing; the walker explains and runs
# commands. This hook enforces immutability on the paths each workshop lists in
# its workshop.yaml under `protectedPaths:`.
#
# Two tiers of protection:
#   - **Test files (`*.test.*`) are the SHIPPED verification contract** — blocked
#     UNCONDITIONALLY, even with the autopilot marker. The walker RUNS the lesson's
#     verifyCommand (which names the test); it never authors or edits a test. A
#     "missing" test is a provisioning issue to surface, not a cue to write one.
#   - All other `protectedPaths` honor the bypass below.
#
# Bypass (non-test paths only): `touch .workshop-autopilot-active` at the repo
# root before asking Claude Code to make the edit. Delete the marker when done.
#
# workshop.yaml discovery is layout-agnostic: it checks the repo root
# (single-workshop repos) and every `.workshop/<id>/` dir (monorepo workshops),
# so the hook works unchanged whether it ships in the template or a CCA-style
# monorepo.

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
# handled above and cannot be bypassed).
if [[ -n "$CWD" && -f "$CWD/.workshop-autopilot-active" ]]; then
  exit 0
fi
if [[ -f "$PWD/.workshop-autopilot-active" ]]; then
  exit 0
fi

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
              block_with_reason "\"Workshop rule: '$rel' is a protected path (matched '$glob'). Please make this edit yourself in your editor — that hands-on moment IS the lesson. If you have explicitly asked Claude Code to make this change, run \`touch .workshop-autopilot-active\` at the repo root first to disable this block.\""
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
