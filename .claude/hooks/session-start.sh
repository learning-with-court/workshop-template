#!/bin/bash
# SessionStart hook — orients Claude Code (and through it, the user) when
# the learner opens a session in this workshop.
#
# The output goes into the session as additional context, so it's visible
# to the model immediately. The model uses it to greet the learner and
# kick off the workshop flow.
#
# This is the TEMPLATE version. Sections marked TODO must be filled in
# (or deleted) before shipping your workshop. The reference exemplar is
# learning-with-court/workshop-mcp/.claude/hooks/session-start.sh.

# ────────────────────────────────────────────────────────────────────────
# OPTIONAL: MCP server auth detection
# ────────────────────────────────────────────────────────────────────────
# Uncomment + customize this block if your workshop uses a hosted MCP
# server with OAuth (like mcp-workshop's lwc-mcp-workshop). The block
# detects when the server is in an unauthenticated state and tells the
# agent to instruct the user to sign in via /mcp.
#
# AUTH_NOTE=""
# if command -v claude >/dev/null 2>&1; then
#   MCP_STATUS=$(claude mcp list 2>/dev/null | grep -i 'TODO-your-server-name' || true)
#   if [[ -n "$MCP_STATUS" ]] && echo "$MCP_STATUS" | grep -qiE 'Needs authentication|Failed to connect'; then
#     AUTH_NOTE="
#
# ## You need to sign in before the workshop will work
#
# The \`TODO-your-server-name\` MCP server is currently in an unauthenticated
# state — Claude Code won't auto-open the browser. **Tell the user, as the
# very FIRST thing in your greeting (before anything else):**
#
# > **You need to sign in first.** Run \`/mcp\` and click sign-in next to
# > \`TODO-your-server-name\`. A browser will open. After you finish, come back
# > and say \`hello\`.
#
# Do not call any \`TODO-your-server-name.*\` tool until the user confirms
# they've signed in — those calls will fail with an auth error.
# "
#   fi
# fi
AUTH_NOTE=""

# ────────────────────────────────────────────────────────────────────────
# Detect whether dependencies have been installed yet.
# ────────────────────────────────────────────────────────────────────────
# When learners use `lwc setup`, the CLI clones the substrate but does
# NOT run pnpm install (auto-mode classifier blocks cross-directory
# installs). Once we're here in the substrate's CWD, the install runs
# fine — the model can offer it.
DEPS_NOTE=""
if [[ ! -d "$PWD/node_modules" ]]; then
  DEPS_NOTE="

## Dependencies are not yet installed

\`node_modules\` is missing. As part of welcoming the user, mention that
you need to run \`pnpm install\` once before the workshop's verify steps
will work. Offer to run it for them. From this directory it works without
any auto-mode friction. (Don't lecture — just \"want me to install
dependencies first?\" is plenty.)
"
fi

# ────────────────────────────────────────────────────────────────────────
# OPTIONAL: API key / .env detection
# ────────────────────────────────────────────────────────────────────────
# Uncomment + customize if your workshop requires secrets in .env at the
# workshop root. Detects missing or empty key and tells the agent to
# prompt the learner with the secure recipe (do NOT have the agent
# prompt for the key in chat — that leaks it into the transcript).
#
# ENV_NOTE=""
# if [[ ! -f "$PWD/.env" ]] || ! grep -qE '^TODO_KEY_NAME=.+' "$PWD/.env" 2>/dev/null; then
#   ENV_NOTE="
#
# ## A required secret is missing from .env
#
# This workshop needs a \`TODO_KEY_NAME\` to be set in \`.env\` at the
# workshop root. Tell the user, in your greeting, BEFORE asking them to
# start:
#
# > You need a \`TODO_KEY_NAME\` to run this workshop's verify scripts.
# > Copy \`.env.example\` to \`.env\` and fill in the value yourself in
# > your editor. Don't paste it in chat — secrets in chat get leaked
# > into the transcript.
#
# Do not run any verify scripts until the user confirms \`.env\` is
# populated. The verify scripts will fail loudly if the key is missing.
# "
# fi
ENV_NOTE=""

# ────────────────────────────────────────────────────────────────────────
# Optional adaptive-guidance file.
# ────────────────────────────────────────────────────────────────────────
# The user's preferred workshop pace (slow / balanced / quick) lives in
# `.claude/lwc-workshop.local.md`, written by the setup-workshop skill
# in the lwc platform. Surface it so the model can adjust pacing and
# explanation depth.
#
# Two-key compat: read `pace:` first (the current field name); if absent,
# fall back to legacy `level:` and translate beginner→slow,
# intermediate→balanced, expert→quick.
PACE_NOTE=""
PACE_FILE="$PWD/.claude/lwc-workshop.local.md"
if [[ -f "$PACE_FILE" ]]; then
  PACE_VALUE=$(grep -E '^pace:[[:space:]]*' "$PACE_FILE" | head -n1 | sed -E 's/^pace:[[:space:]]*//; s/[[:space:]]+$//')
  if [[ -z "$PACE_VALUE" ]]; then
    LEGACY_LEVEL=$(grep -E '^level:[[:space:]]*' "$PACE_FILE" | head -n1 | sed -E 's/^level:[[:space:]]*//; s/[[:space:]]+$//')
    case "$LEGACY_LEVEL" in
      beginner)     PACE_VALUE="slow" ;;
      intermediate) PACE_VALUE="balanced" ;;
      expert)       PACE_VALUE="quick" ;;
    esac
  fi
  if [[ -n "$PACE_VALUE" ]]; then
    PACE_NOTE="

## Workshop pace: ${PACE_VALUE}

The user has chosen **${PACE_VALUE}** pacing. Adjust accordingly:
- **slow**: explain concepts before mechanics, slow down, pause for the
  learner to ask questions, never assume language fluency.
- **balanced**: skim conceptual intro for familiar material; spend more
  time on the why behind design choices and edge cases.
- **quick**: minimal hand-holding; focus on the interesting bits and
  skip well-trodden ground. Still apply the workshop's seven-rule
  contract (quote stdout, pause for run-verify, render code inline,
  etc.) — quick pace is \"less prose, same shape,\" not \"skip the user.\"

To change pacing later, edit \`.claude/lwc-workshop.local.md\` and set
\`pace:\` to \`slow\`, \`balanced\`, or \`quick\`. Restart the session
for it to take effect.

Re-check the pace if the user contradicts it via their behavior — they
may want to adjust mid-workshop."
  fi
fi

# ────────────────────────────────────────────────────────────────────────
# Greeting block — emitted as context for the model.
# ────────────────────────────────────────────────────────────────────────
# TODO: replace the workshop name, server name (if any), and shape
# description below with your workshop's specifics.

cat <<EOF
You are in the **TODO: workshop name** substrate.

TODO: if your workshop has a hosted MCP server, mention it here:
The deployed workshop server is wired up at \`TODO-your-server-name\`
(see \`.mcp.json\`). Tools available there: \`TODO-list-tools\`. The server
tracks the user's progress across lessons.
${AUTH_NOTE}${DEPS_NOTE}${ENV_NOTE}${PACE_NOTE}
## Audience

The user may NOT be a strong developer. Some readers will struggle with
basic git/pnpm/editor tasks. Be patient; explain things conceptually
before diving into mechanics.

## Workshop shape

TODO: replace with this workshop's actual lesson count and phase structure:

> N lessons across M phases:
> - **Phase A — TODO:** lessons 1–X
> - **Phase B — TODO:** lessons X+1–Y
> - **Phase C — TODO:** lessons Y+1–N

Each lesson lives in \`workshop/lesson_NN_*/\` and has its own \`verify\`
script (\`pnpm --filter @workshop/lesson-NN verify\`). Per-lesson skills
in \`.claude/skills/lesson-NN.md\` drive the walkthrough.

## On the user's first message

Greet them warmly and briefly. Tell them:
- They're in a TODO-N-lesson workshop on TODO-one-line-outcome.
- TODO: if you have a hosted server: the workshop server will guide them;
  their progress is saved server-side.
- If \`node_modules\` is missing (see above), offer to install before starting.
- TODO: if you require .env secrets and the ENV_NOTE block fired: tell
  them to populate \`.env\` first.
- Ask if they'd like to start.

If yes (or any affirmative), TODO: describe the entry-point handoff:
- If your workshop ships an MCP server: call your equivalent of
  \`where_am_i\` to see the user's state, then \`start_lesson(N)\` for
  the lesson the server returns. Read the response's \`targetFiles\` and
  \`verifyCommand\`. The lesson skill at \`.claude/skills/lesson-NN.md\`
  drives the walkthrough from there.
- If your workshop is pure-local: hand off to \`lesson-01\` directly by
  reading \`.claude/skills/lesson-01.md\`.

## Workshop rule for lesson edits — OPTIONAL

TODO: if you want to enforce the learner-driven editing rule mechanically,
copy \`.claude/hooks/block-edits.sh\` from
\`learning-with-court/workshop-mcp\` into this workshop and wire it as a
\`PreToolUse\` hook in \`.claude/settings.json\`. Then surface the rule
in this greeting:

> A \`PreToolUse\` hook in this directory **blocks** Edit/Write/MultiEdit
> on files under \`workshop/lesson_NN_*/src/\` and \`workshop/lesson_NN_*/tests/\`.
> The user does the editing themselves; you describe the change, run
> verify, and grade. This is enforced regardless of auto mode.
>
> If a user explicitly says "go ahead and apply the edit" and you want to
> honor that, tell them to run \`touch .workshop-autopilot-active\` at the
> repo root, then retry — that disables the block.
>
> You CAN edit \`scripts/\`, \`infra/\`, \`workshop/shared/\`, root configs,
> and anything outside per-lesson \`src/\`/\`tests/\`. The restriction is
> specifically about each lesson's hands-on moment.

If your workshop has no learner edits (pure read-style), delete this
section.

## Recording lesson completion — TODO

If your workshop ships an MCP server that records progress:
TODO: describe the recording flow (when to call submit_verify_output,
the "hold the stdout, don't record until the learner signals they're
moving on" pacing rule).

If your workshop is pure-local with no server-side state, delete this
section — completion is the learner's own (they see verify pass and
move on).

## On reset

If the user wants to redo a lesson, run \`git checkout -- workshop/lesson_NN_*/\`
to revert their edits. TODO: if your workshop has server-side progress,
note that the server progress is unaffected by local resets.

## Refreshing the workshop

Tell the user: to pick up upstream updates to this workshop, run
\`lwc update <workshop-id>\` from inside the workshop dir (NOT \`git
pull\` — the clone uses an un-credentialed HTTPS origin by design).
EOF
