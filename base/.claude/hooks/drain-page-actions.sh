#!/bin/bash
# drain-page-actions.sh — UserPromptSubmit hook
#
# Learner-side transport for the lesson page's button presses. The `lwc` MCP
# proxy runs a loopback HTTP server for an open lesson page (internal/page in
# lwc-cli) and writes its port to ~/.lwc/pages/<workshopID>.port while the
# page is open. This hook peeks that server's GET /actions.json — a
# non-draining read; the actual drain happens when the guide next calls a
# page_* MCP tool, which returns the same presses as `pending_actions` on
# the tool result — so a learner's press reaches the guide's next turn even
# when that turn doesn't happen to call a page tool.
#
# Prints ONE line naming every queued press when there is at least one, and
# NOTHING otherwise. Every failure path is silent and this always exits 0:
#   - no ~/.lwc/pages directory, or no *.port file in it (no page ever opened)
#   - a stale port file left behind by a crashed session (nothing cleans
#     those up) — the connection just refuses or times out
#   - the port now belongs to some other, unrelated process
#   - curl not on PATH
#   - a slow or hung server
#   - a malformed / non-JSON / huge response
#   - the queue is empty
# This runs on every prompt submission, in every lesson of every workshop.
# Noise on any of these paths would be worse than the feature not existing
# at all — see live-assist.sh, which follows the same contract for the same
# reason.
#
# Multiple port files (more than one workshop/session has an open lesson
# page on this machine): only the most recently modified one is read. A
# learner drives one terminal at a time, so the freshest page is the one
# this prompt is for; folding a stale, unrelated session's button-presses
# into this one would be actively wrong, not just noisy.
set -uo pipefail

PAGES_DIR="${LWC_PAGES_DIR:-$HOME/.lwc/pages}"

# No curl, no pages dir — nothing to do.
command -v curl >/dev/null 2>&1 || exit 0
[[ -d "$PAGES_DIR" ]] || exit 0

# Most recently modified *.port file. `ls -t` sorts newest-first on both the
# BSD (macOS) and GNU (Linux) coreutils this hook has to run under.
PORT_FILE=""
while IFS= read -r f; do
  PORT_FILE="$f"
  break
done < <(ls -t "$PAGES_DIR"/*.port 2>/dev/null)

[[ -n "$PORT_FILE" && -f "$PORT_FILE" ]] || exit 0

PORT=$(tr -d '[:space:]' < "$PORT_FILE" 2>/dev/null)
[[ "$PORT" =~ ^[0-9]+$ ]] || exit 0

# Sub-second connect timeout, short overall cap, bounded body size: a stale
# port file must never make the learner wait or dump an unbounded response
# into the conversation.
RESPONSE=$(curl -s --connect-timeout 1 --max-time 2 \
  -H "X-Lwc-Page: 1" \
  "http://127.0.0.1:${PORT}/actions.json" 2>/dev/null | head -c 65536)

[[ -n "$RESPONSE" ]] || exit 0

# Map an action kind to the button label it corresponds to on the page, for
# a human-readable line. Unrecognized kinds (a future addition this hook
# hasn't been updated for) are dropped rather than surfaced raw.
label_for_kind() {
  case "$1" in
    step_done) echo "I'm done with this step" ;;
    hint) echo "Give me a hint" ;;
    explain) echo "Explain this step" ;;
    terminal_only) echo "Switch to terminal only" ;;
    banner_dismissed) echo "Dismissed the banner" ;;
    *) echo "" ;;
  esac
}

if command -v jq >/dev/null 2>&1; then
  KINDS=$(echo "$RESPONSE" | jq -r '.[]?.Kind // empty' 2>/dev/null) || exit 0
else
  # No jq on PATH (not guaranteed on a learner's machine): fall back to a
  # plain-text extraction of "Kind":"..." pairs only. Kind values are a
  # fixed, known-safe enumeration; Note is free text and is intentionally
  # never parsed on this path, since a naive regex over arbitrary text is
  # exactly the kind of thing that produces garbled or unsafe output.
  KINDS=$(echo "$RESPONSE" | grep -o '"Kind"[[:space:]]*:[[:space:]]*"[a-z_]*"' | sed -E 's/.*"([a-z_]+)"$/\1/')
fi

[[ -n "$KINDS" ]] || exit 0

JOINED=""
COUNT=0
while IFS= read -r kind; do
  [[ -n "$kind" ]] || continue
  label=$(label_for_kind "$kind")
  [[ -n "$label" ]] || continue
  if [[ -z "$JOINED" ]]; then
    JOINED="\"$label\" ($kind)"
  else
    JOINED="$JOINED; \"$label\" ($kind)"
  fi
  COUNT=$((COUNT + 1))
  # Bounded output: never fold more than 5 presses into one line.
  [[ "$COUNT" -ge 5 ]] && break
done <<< "$KINDS"

[[ -n "$JOINED" ]] || exit 0

echo "Learner pressed: $JOINED"

exit 0
