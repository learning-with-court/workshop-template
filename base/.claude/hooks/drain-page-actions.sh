#!/bin/bash
# drain-page-actions.sh — UserPromptSubmit hook
#
# Learner-side transport for the lesson page's button presses. The `lwc` MCP
# proxy runs a loopback HTTP server for an open lesson page (internal/page in
# lwc-cli) and writes its port to ~/.lwc/pages/<workshopID>.port while the
# page is open. This hook DRAINS that server's POST /actions/drain — every
# press reported here is cleared from the queue, so it is reported exactly
# once by this hook and never repeats on a later prompt. A page_* MCP tool
# result carries the same queue as `pending_actions` for a press that
# arrives mid-turn, after this hook already ran; that channel drains too, so
# a press reported by this hook is never also reported there.
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

PAGES_DIR="${LWC_PAGES_DIR:-${HOME:-}/.lwc/pages}"

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
# -f only checks existence; a port file left behind by a crashed session
# with odd permissions is still a real, common case. Without this, the `<`
# redirection below fails to open and bash reports that failure on the
# real stderr itself (2>/dev/null on `tr` does not suppress a redirection
# error) — a visible error line on every prompt.
[[ -r "$PORT_FILE" ]] || exit 0

PORT=$(tr -d '[:space:]' < "$PORT_FILE" 2>/dev/null)
[[ "$PORT" =~ ^[0-9]+$ ]] || exit 0

# Sub-second connect timeout, short overall cap, bounded body size: a stale
# port file must never make the learner wait or dump an unbounded response
# into the conversation.
RESPONSE=$(curl -s -X POST --connect-timeout 1 --max-time 2 \
  -H "X-Lwc-Page: 1" \
  "http://127.0.0.1:${PORT}/actions/drain" 2>/dev/null | head -c 65536)

[[ -n "$RESPONSE" ]] || exit 0

# Map an action kind to the button label it corresponds to on the page, for
# a human-readable line. Unrecognized kinds (a future addition this hook
# hasn't been updated for) are dropped rather than surfaced raw.
label_for_kind() {
  case "$1" in
    step_done) echo "I'm done with this step" ;;
    hint) echo "Give me a hint" ;;
    explain) echo "Explain this more" ;;
    terminal_only) echo "Switch to terminal only" ;;
    banner_dismissed) echo "Dismissed the banner" ;;
    *) echo "" ;;
  esac
}

if command -v jq >/dev/null 2>&1; then
  KINDS=$(echo "$RESPONSE" | jq -r '.[]?.Kind // empty' 2>/dev/null) || exit 0
else
  # No jq on PATH (not guaranteed on a learner's machine): fall back to a
  # plain-text extraction, scoped to the start of a JSON object — the match
  # requires "Kind" as the literal first key right after `{`, i.e.
  # `{"Kind":"..."`, matching exactly how Go's json.Encoder (no
  # indentation) emits Action{Kind, Note, At}. Without this scoping a
  # global match for `"Kind":"..."` anywhere in the response would also
  # fire on that same text sitting inside another object's free-text Note
  # field — the response is not from a trusted source (a stale port can
  # belong to a different, unrelated local process), so Note must never be
  # able to masquerade as a real Kind.
  KINDS=$(echo "$RESPONSE" | grep -o '{"Kind":"[a-z_]*"' | sed -E 's/^\{"Kind":"([a-z_]+)"$/\1/')
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
