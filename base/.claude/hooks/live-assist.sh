#!/bin/bash
# live-assist.sh — UserPromptSubmit / Stop hook
#
# Learner-side transport for instructor-led live assist. It reports this turn
# to the platform and collects anything the workshop's operator queued for this
# learner, so an instructor can help mid-session without watching a screen.
#
# The hook does no HTTP itself: it pipes the hook payload straight to
# `lwc assist turn`, which already owns endpoint resolution (~/.lwc/config.json
# + LWC_API_URL), the token cache, and workshop detection. One place holds that
# logic, and it is tested there.
#
#   UserPromptSubmit — reports the learner's prompt; anything printed on stdout
#                      is injected as context for the turn about to run. That is
#                      how an operator's whisper or message reaches the guide.
#   Stop            — reports a bounded summary of the guide's last response.
#                      Prints nothing; there is no turn left to influence.
#
# QUIET BY DEFAULT. The platform only records a session that belongs to an
# event with `liveAssist: true` which this learner registered for. Outside of
# one, the server returns `{"streaming": false}`, nothing is retained, and this
# hook prints nothing. A learner who never attends a live event pays one
# capped local call per turn and nothing else.
#
# NEVER BLOCKS. Every failure path — no CLI on PATH, no token, endpoint down,
# slow, malformed — exits 0 with no output. Observation being degraded must
# never cost the learner a turn.
#
# Design doc: docs/superpowers/specs/2026-07-30-live-learner-assist-design.md
#             (learning-with-court/workspace)

set -uo pipefail

# Which hook fired. Defaults to the pre-turn hook so a bare invocation is still
# meaningful rather than silently wrong.
HOOK_EVENT="${1:-UserPromptSubmit}"

# No CLI (or a partial install) — there is nothing to report to. Say nothing.
command -v lwc >/dev/null 2>&1 || exit 0

# stdin carries the hook payload and is inherited by the CLI. stdout is the
# assist context, if any. stderr is swallowed and a non-zero exit is ignored:
# the learner's session must not see this hook fail.
lwc assist turn --hook-event "$HOOK_EVENT" 2>/dev/null || true

exit 0
