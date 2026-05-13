# Workshop Pedagogy Spec

This is the **binding contract** every lesson walker skill, lesson README, utility skill, and the root README should meet in a workshop forked from this template. The spec exists because the workshop's value isn't the code — it's the experience of being walked through that code by Claude Code itself. When the contract drifts, the workshop degrades into a reference doc with a thin plugin around it.

**Source of truth:** This spec is lifted from `learning-with-court/mcp-workshop`'s `docs/WORKSHOP_SPEC.md`, the canonical pedagogy bar. Workshop-specific sections are marked with `TODO:` callouts for fork operators to fill in. If you want enforcement (the linter mcp-workshop ships at `scripts/lint-workshop.ts` runs 16 structural rules on every push), copy it from there — this template intentionally doesn't ship a linter.

If you want to skip a section because it doesn't apply, that's a signal to think harder, not to silently omit it. Most rules are workshop-agnostic.

---

## 0. Skills are skills, not slash-commands

Per [Anthropic's agent-skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), a skill's `description:` is what enables Claude to discover and invoke it. Every workshop skill — orchestration entry point, lesson walker, and utility — should be **model-invocable** so natural language like "start lesson 2" routes the user into the right walker without making them type a slash command. None of the workshop skills set `disable-model-invocation: true`.

Two flavors, distinguished only by what triggers them:

### Lesson walkers + start-workshop

Auto-fire on phrases like `"start lesson 2"`, `"lesson 2"`, `"do lesson 2"`, `"walk me through lesson 2"`, plus topic-specific triggers. Each lesson walker description carries 4–8 trigger phrases.

### Utility skills

Auto-fire on context the model recognizes mid-conversation. Examples to follow when designing yours:

- `where-am-i` — "where am I" / "which lesson"
- `debug-my-<thing>` — server issue reports
- `onboard-<provider>` — provider-specific errors (AWS, etc.)

### Description format

Per Anthropic's spec, every description is:

- **Third person** — "Walks the user through…", "Diagnoses…", "Verifies…". Never "I help you" or "Helps you".
- **What + when** — describe both what the skill does AND the trigger context.
- **Specific trigger phrases** — quote 4–8 actual phrases the user might say. Vague descriptions ("Helps with debugging") fail discovery.
- **≤ 1024 chars** practical cap; most should be 300–600.

Example shape (workshop-agnostic):

> `Walks the user through Lesson N of the <workshop name> — <one-line outcome>. Use when the user says "start lesson N", "lesson N", "do lesson N", "walk me through lesson N", "<topic-specific trigger>", or asks for help with <topic>.`

---

## 1. Lesson walker skill file

Path: `.claude/skills/lesson-NN.md` (flat layout — Claude reads this file directly via Read; project-level skill files are not registered as invocable Skills).

> **CRITICAL.** Never tell the agent to "invoke this skill" or "use the Skill tool" in walker prose. The agent reads the file via Read; that read IS the activation. Telling it to call `Skill(lesson-NN)` produces a runtime error.

### Frontmatter

```markdown
---
name: lesson-NN
description: <third-person what + when with 4–8 trigger phrases, per §0>
---
```

### Required H2 sections (in this order)

#### `## Visible walkthrough contract`

The walker drives commands via the **Bash tool** and quotes the full stdout verbatim back to the user.

Why Bash + verbatim quote? Claude Code collapses Bash tool output by default (`+N lines (ctrl+o to expand)`), so the user can't see what happened unless you transcribe it. The Bash tool also auto-engages the model when the command finishes, so the walker can move to the next step without the user typing a transitional message. The verbatim quote restores the readable shell-output rendering that the collapsed Bash tool view loses.

Copy this template into your walker and only adjust file references:

```markdown
## Visible walkthrough contract

- **Walker drives the verify and test commands via the Bash tool, then quotes the FULL stdout verbatim back to the user.** After every Bash run, your response MUST include the complete stdout in a fenced code block — every line, no truncation, no paraphrase, no "(...)" elision.
- **Before every Bash run, announce the exact command in plain text on its own line.** A sentence like ``I'm going to run: `pnpm --filter @workshop/lesson-NN verify` `` (with the command in backticks) BEFORE the Bash tool invocation, so the user sees what's about to execute in readable form.
- **Pause before each Bash run.** After explaining the code (or after a previous command's output), STOP and wait for the user to say `run verify`, `let's run the tests`, or similar. Do NOT run the next command automatically. The user needs a beat to read, ask follow-ups, or branch to `break down that code` before anything happens.
- **Walker MUST NOT edit lesson source files** under `workshop/lesson_NN_*/src/` or `tests/`. Edit experiments are the user's hands-on moment — show them the diff, ask them to apply it in their editor, then offer to rerun verify when they confirm saved. (See §13 for the optional block-edits hook that enforces this mechanically.)
- **Walker MUST NOT use the Bash tool to generate or echo any secret.** The verbatim-quote rule has a hard exception here: a Bash invocation that would produce or echo a secret (e.g. `crypto.randomBytes`, `openssl rand`, `cat .env`) must not be run in the first place. Generation always happens in the user's own terminal — show the recipe, tell the user to run it in their terminal, ask them to say when they've done it, and pause. See §8.
- Before running anything, show the relevant code snippet inline in chat (not "look at the file") and say what output shape to expect.
- Suggest the user can ask to inspect more source: `Say: show me what's in <lesson-dir>/src/<file>`.
- Suggest a chunked code breakdown: `Say: break down that code`.
- Suggest a small edit experiment, framed as a user-applied edit: `Say: walk me through renaming X to Y` — predict what verify will do once the user applies the rename in their editor.
- Every response that ran a Bash command MUST end with a "what to say next" phrase: a natural-language line like `Say `let's run the tests`` or `Say `let's start lesson N+1``. Never end after the verbatim quote alone — the user must always know what to say next.
```

### User-facing language rules

- Do NOT use the word "walker" in user-facing prose (inside `>` quote blocks or any line the user reads). "Walker" is internal terminology. User-facing copy says things like "I'll run verify and quote the output" or omits the actor entirely.
- Do NOT use role-label nouns (`scaffolder`, `onboarder`, `orchestrator`, `diagnoser`) in user-facing copy — these are walker-internal categories for utility skills.
- Do NOT explain internal design ("by design", "the PreToolUse hook blocks this", "intentionally") in user-facing copy. The user-facing version says "I won't edit lesson source for you — that experiment is yours" or just "you'll make the edit in your editor."
- Walker-only instructions (prose outside `>` quote blocks) MAY use internal terms freely.
- Inside `>` quote blocks AND inside the bolded/italicized lead-in of `## Steps` numbered items, address the user in **second person** ("you", "your"). Do NOT use third-person constructions about the learner ("the user is about to...", "make sure the user...").

The point is to scaffold learner agency — give the user concrete phrases they can repeat back to invite deeper exploration. Walkers without these affordances become procedural ("run this, run that, advance"). The lesson teaches by inviting the user to dissect, not by narrating.

**Always explain *why* before routing.** When a walker presents a choice, it MUST first explain what each option teaches and why someone would pick one over the other. Same rule applies before any non-obvious command: explain what it does and what to expect *before* running it.

#### `## Pedagogical priority`

Exactly one sentence. Names the *one* concept this lesson centers. Walkers should refuse to let the user paper over it.

> TODO: Examples once your lessons exist:
> - Lesson 1: "Prove your toolchain works before you build anything else."
> - Lesson N: "<one-sentence priority>"

#### `## Steps`

Numbered list. Each step that requires running a command follows the **Bash + verbatim + announce** pattern:

```markdown
4. **When the user says `run verify`, run it via the Bash tool.** Before invoking Bash, write a short line announcing the exact command, e.g.:

   > I'm going to run: `pnpm --filter @workshop/lesson-NN verify`

   Then call the Bash tool with that exact command.

   Then in your response, in this exact order:
   1. **Quote the full stdout verbatim** in a fenced code block — every line, no truncation, no paraphrase.
   2. **Tie it to the source.** Quote one important output line and explain which code path produced it.
   3. **End with the next-step phrase**:
      > **Say `let's run the tests`** to run the full contract suite.
      >
      > (Or, to play first: say `walk me through renaming X to Y` — you'll make the edit in your editor and we'll rerun verify together to see it break.)
```

The pattern is identical across all walkers; only the command, the source-tie callout, and the next-step phrase change.

#### `## Common debugging`

A markdown table with 3-4 of the most likely failures and one-line fixes. Example shape:

```markdown
## Common debugging

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find module '...'` on first run | `pnpm install` was skipped | run `pnpm install` from the repo root |
| <TODO: workshop-specific failure> | <cause> | <fix> |
```

If a lesson genuinely has no expected failures (rare), state that explicitly with one row pointing at a debug utility skill.

#### `## What To Say Next`

Always include a state→pointer rubric so the model has an explicit table to pattern-match against. Every entry maps a conversation state to the exact next-step phrase. Example:

```markdown
## What To Say Next

Always end your response with one of these — pick by what just happened:

- After they pick a track: show the code block and explain it. Do NOT run verify yet. End with: `**Say `run verify`** when you're ready — or `break down that code` for a chunked walk first.`
- After the user says `run verify`: use the Bash tool, quote stdout verbatim, tie to source, then: `**Say `let's run the tests`** to run the full contract suite.`
- After tests pass: `**Say `let's start lesson N+1`** to move on.`
- For exploration: `**Say `walk me through renaming X to Y`** — you'll make the edit in your editor and we'll rerun verify together.`
- If blocked: `Say: help me debug lesson NN`.
```

#### `## Style`

Short rules block. Copy verbatim and only edit the lesson-specific lines:

```markdown
## Style

- Don't lecture. Assume the README is the source of truth and the user can read it.
- Don't print env vars or secrets back to the conversation.
- ALWAYS quote the full stdout verbatim after a Bash run.
- ALWAYS announce the command in plain text BEFORE the Bash call.
- ALWAYS end a Bash-run response with a literal next-step phrase the user can say back.
```

The "always announce + always quote + always end with next-step" trio is what makes the workshop feel guided rather than a status feed.

---

## 2. Lesson README

Path: `workshop/lesson_NN_<slug>/README.md`

A reader who finds this lesson on GitHub *without ever installing the plugin* should be able to learn from it. The lesson README is the standalone teaching artifact; the walker skill is the live-coaching layer that sits on top of it.

### Required structure

#### `# Lesson N — <name>`

One H1 + a one-sentence goal.

#### `## What you'll learn`

Three to five bullets, **learning objectives** — what the reader will be able to *do* after the lesson, not what the lesson contains. Use action verbs.

#### `## Key concepts`

Short prose introducing the model + at least one reference table or labeled diagram where it helps.

#### `## Walkthrough`

Numbered steps. Each step that requires running something shows:

1. **What to read** — which file or section first.
2. **What to run** — the literal command.
3. **Expected output shape** — paste the actual lines, ideally truncated.
4. **What it means** — one sentence linking output back to code.
5. **Suggested edit** — a small "try this" that the reader can do to verify they understand. Predict what the output will become.

#### `## Validation checklist`

Three testable assertions the reader confirms before moving on.

#### `## Common pitfalls`

Two- or three-row table. Same format as the walker's `## Common debugging`, framed for the README reader.

#### `## Next`

The next lesson on its own line.

---

## 3. Utility skill

Path: `.claude/skills/<utility-name>.md` (e.g., `where-am-i`, `debug-my-<thing>`).

### Frontmatter

Same shape as lesson walkers: `name` matches filename, third-person `description`, ≤1024 chars.

### Required H2 sections

Utility skills come in two shapes; pick the right one and stick to it.

**Scaffolder-style** (`add-a-X`, `where-am-i`):
- `## Steps` — numbered, what the skill does in order.
- `## Style` — terse rules.

**Debugger / onboarder-style** (`debug-my-X`, `onboard-Y`):
- `## Diagnostic order` — numbered checks, top to bottom. Don't skip ahead. Each check has the exact `!command` to run and how to interpret the result.
- `## Style` — terse rules.

`start-workshop` is a thin entry-point skill: toolchain check (Node, pnpm, deps) → hand off to Lesson 1. The workshop is sequential — every learner starts at Lesson 1. Phase-specific prereq checks (auth secrets, AWS profile, etc.) live in the lessons that introduce those phases, NOT in `start-workshop`. Surfacing them at the entry point only intimidates Lesson 1 learners who won't reach later phases for hours.

---

## 4. Root README

The root `README.md` is intentionally a small "front door" doc — not a workshop overview, not an install guide, not a developer onboarding doc. The walkers are the source of truth for runtime behavior; the README is the door learners knock on before the walker opens.

**Recommended limits:**

- Maximum ~50 lines.
- Required H2 sections (any order):
  - `## What this is` — 2-3 line elevator pitch. Names the workshop, says "Claude walks you through every lesson", points at the standalone lesson READMEs as the alternative for plugin-less GitHub readers.
  - `## Quick start` — the install command sequence plus the one-line natural-language entry (`let's start the workshop`).
  - `## License` — one line linking to `LICENSE`.
  - `## Issues` — one line linking to GitHub Issues.
- Discouraged H2 sections:
  - `## Lessons` — the lesson list belongs in the walker (presented in sequence) and in `docs/features/DASHBOARD.md`. Don't enumerate in the README.
  - `## Utility skills` — utility skills fire on natural language; listing them is documentation noise.
  - `## Repo layout` — developer-onboarding content; if it's needed at all, it lives in `docs/`.

---

## 5. Cross-references

Every `Say: <skill-name>` reference in any skill file or README should resolve to an existing `.claude/skills/<skill-name>.md` file.

Every `## Next` pointer in lesson NN's README and walker should reference lesson NN+1 — except the last lesson's, which points at any cleanup section in its own README.

---

## 6. Lint enforcement (optional but recommended)

`learning-with-court/mcp-workshop` ships `scripts/lint-workshop.ts` that CI runs on every push. It enforces 16 structural rules with line-pointed errors:

1. Every skill has frontmatter with `name` matching the filename, third-person `description`, ≤1024 chars.
2. Every lesson walker has all required H2 sections.
3. Every utility skill has either `## Steps` or `## Diagnostic order`, plus `## Style`.
4. Every lesson README has all required H2 sections.
5. Every `Say: <skill-name>` reference resolves.
6. Every lesson `## Next` points at the next existing lesson skill.
7. No `!command` blocks in lesson walker `## Steps` (walkers run via Bash; `!command` belongs in lesson READMEs).
8. No internal jargon inside `>` quote blocks (banned: `walker`, `by design`, `PreToolUse`, role-label nouns).
9. No secret-generating commands in walker Bash-tool-invocation prose.
10. No secret-echoing commands against `.env` or other secret-bearing files.
11. No third-person self-talk about the learner inside `>` quote blocks.

To inherit enforcement, copy `mcp-workshop/scripts/lint-workshop.ts` into your fork's `scripts/` and wire it into CI. The template doesn't ship the linter itself to keep the scaffold minimal — adopt it once you have ≥3 lessons.

---

## 7. Secret handling

**Read-safe / write-user-only.**

Walkers MUST NOT use the Bash tool to generate, invoke, or echo any value that constitutes a secret in the workshop's threat model. Generation always happens in the user's own terminal; the walker's role is to confirm presence (file exists + line is non-blank), never to read or quote the secret's value.

**The hand-off-and-pause pattern.** When the walker asks the user to run a command in their own terminal (any time the walker can't run it via Bash — secret generation, AWS SSO login, deploys, anything interactive), the walker MUST: (1) show the exact command the user should run, (2) explicitly tell the user to run it in their own terminal, (3) ask them to signal when it's complete (e.g. "say `done` when you've added the line to `.env`"), and (4) STOP and wait. Without the explicit "tell me when done" prompt, the user has no idea the walker is waiting for them.

**TODO: What counts as a secret in this workshop:**

> - `ANTHROPIC_API_KEY`
> - `<your workshop's secret #1>`
> - `<your workshop's secret #2>`

**What's safe for the walker to invoke:**

- Presence checks that don't echo: `grep -q '^ANTHROPIC_API_KEY=.\+' .env`
- File-existence checks: `test -f .env`
- The `Read` tool against `.env` ONLY when the walker is checking presence and won't quote the result back

---

## 8. Long-running background commands

When a walker needs to launch a long-running command (dev server, inspector, deploy watcher), it MUST follow this contract instead of asking the user to run it in a second terminal:

1. **Pre-flight every well-known port the command will bind.** Run `lsof -ti :<port>` via Bash. For each pid, send SIGTERM (`kill <pid>`); wait ~1s; if still alive, send SIGKILL (`kill -9 <pid>`). Surface what was killed in one short user-facing line.
2. **Launch in background.** Bash tool with `run_in_background: true`. Capture the returned shell ID. Tell the user up-front that first launches via `npx -y <package>` may take up to a minute on a new machine.
3. **Poll `BashOutput(shell_id)` for a known ready signal** (URL, "listening on …" line). Bound the loop: default 12 attempts spaced ~3s apart (~36s warm cache, longer first-launch). If no ready signal lands, surface raw stdout/stderr to the user and route to the relevant debug skill — do NOT loop forever.
4. **Defense-in-depth on port-conflict errors.** If the command's stderr contains a "PORT IS IN USE" or equivalent, KillShell, re-run pre-flight, retry the launch ONCE.
5. **Surface the ready signal to the user.** Render the URL or listening line in a `>` block so the user can click/copy it.
6. **Track the shell ID and kill on advance.** When the user says a next-step phrase, call `KillShell(shell_id)` BEFORE responding, and tell the user one short line.

**Platform note.** This contract assumes a Unix-like environment (`lsof`, `kill`). For Windows, port pre-flight uses `netstat -ano | findstr :<port>`.

**Long-running stdio servers reading from `.env`.** If the long-running command's `start` script reads from `.env`, the script MUST use `tsx --env-file=<path>` (or equivalent) so the spawn chain doesn't have to remember to load it. The walker's Bash → npx → pnpm → tsx chain does NOT auto-load `.env`.

---

## 9. Staged verify for multi-step flows

When a verify script's narrated output exceeds ~3 `→ ← ✔` blocks OR the protocol shape itself is the lesson (OAuth dance, encryption pipeline), the verify MUST be split into stages.

**Mechanism.** Each lesson with a multi-step verify gets a `src/verify-stages/` directory containing one numbered file per protocol arrow (e.g. `1-authorize.ts`, `2-token.ts`, `3-refresh.ts`). Each stage exports a `default async function main(opts: { verbose?: boolean; state?: T }): Promise<T>` that emits its own `→ ← ✔` block when `verbose` is true, runs silently when `verbose` is false, and returns updated state.

**Walker pacing.** The walker invokes one stage per user step, pausing between stages with a natural-language phrase (e.g. `Say `let's run /token``). Each stage announces its command per §1, runs Bash, quotes stdout verbatim, ties at least one `→ ← ✔` line back to source, and ends with the next-stage phrase.

**Each stage is independently re-runnable.** If the user invokes stage N standalone, the stage MUST silently re-bootstrap whatever state stages 1 through N-1 produced.

**Single orchestrator preserves the one-shot path.** Top-level `src/verify.ts` imports each stage's main function and calls them in sequence. `pnpm verify` (CI) runs the orchestrator — same exit codes and assertions as before staging.

---

## 10. Pace adaptation

The user's pace is set in `.claude/lwc-workshop.local.md` and surfaced by the SessionStart hook. Read it once at the start of each lesson and adjust:

- **`slow`** — explain concepts before mechanics, pause for "got it" between steps, never assume language fluency, walk the chunked code breakdown without being asked.
- **`balanced`** — skim the conceptual intro for material the learner has likely seen, spend more time on the *why* behind design choices.
- **`quick`** — minimal hand-holding; focus on the interesting bits and skip well-trodden ground. Still apply the visible walkthrough contract — quick pace is "less prose, same hands-on shape," not "skip the user."

Re-check the pace if the learner contradicts it via behavior. The change requires editing the file and restarting the session for it to take effect.

---

## 11. Don't quiz the learner

**Do not ask comprehension questions.** No "Quick check — can you describe…", no "Try to articulate why…", no Q&A prompts to test understanding. The workshop is hands-on, not a quiz. Learning happens through doing the edit experiment, watching the output flip, and tying it back to source — not by being interrogated. Default to forward motion.

---

## 12. Surface the exploration affordances

After every Bash run and at every lesson advancement, the learner has three exploration paths besides "next lesson". Surface them by name:

- **`break down that code`** — chunked walk through the file the lesson centers on.
- **`let's open the <inspector/REPL/UI>`** — workshop-specific hands-on tool, if applicable.
- **`walk me through changing X`** — the edit experiment, framed concretely with a predicted output flip.

Don't pile all three on every reply — pick the one that matches what just happened.

---

## 13. Block-edits hook (optional)

If your workshop has hands-on lesson source files (`workshop/lesson_NN_*/src/` or `tests/`) where the LEARNER edits and the AGENT does not, copy the block-edits enforcement pattern from `mcp-workshop/.claude/hooks/block-edits.sh` and wire it into `.claude/settings.json`'s `PreToolUse` hook. The hook blocks `Edit`/`Write`/`MultiEdit` on those paths regardless of auto mode, with a `touch .workshop-autopilot-active` bypass for cases where the user explicitly wants the agent to apply edits.

The template doesn't ship `block-edits.sh` by default because some workshops are read-only walks (no learner edits). Workshops with hands-on edits should add it; the spec section here is the canonical reference.

---

## 14. Common drift to watch for

- **Auto-completing without user interaction.** If you find yourself running verify and submitting without proposing an edit experiment first, you've drifted. Stop.
- **Summarizing instead of quoting stdout.** The whole point of running Bash through the walker is so the user can see what happened. Summary breaks the workshop.
- **Chaining commands.** `verify && tests && next-lesson` is the auto-complete failure mode. Pause between each.
- **Calling MCP / external services for prose.** If you find yourself asking the server for walkthrough text or instructions, you've drifted. The skill is the source of truth for pedagogy.

---


---

## 15. Walker code-reveal chunking

When a lesson's heart is composed of multiple files OR a single file whose body itself is >~40 lines of composed phases, the walker MUST chunk the reveal. Dumping the full composition in one Step 2 produces real cognitive overload; learners surface this on first walks.

### The pattern

**Lead with the heart.** On the initial Step 2 reveal, render only the file (or file section) that carries the lesson's pedagogical priority. Companion files become **earned drill-downs** gated on explicit learner trigger phrases:

- `show me the cache` / `show me the regex judge` — for multi-file lessons where each file is a distinct architectural concern
- `show me the extract phase` / `show me the judges` / `show me the aggregate phase` — for single-file lessons where the heart function's body composes multiple phases

The drill phrases live in the walker's `## Steps` numbered list as their own conditional steps. The "What To Say Next" rubric covers each drill-trigger → drill response mapping.

**Cap initial reveal at ~50 lines.** If the heart file alone is bigger, render only its signature/interfaces/skeleton on Step 2 — the for-loop body or implementation specifics become phase drills. Phase-comment markers in the source (`// 1. Extract — with cache.`, etc.) are the anchors the walker uses to render the right section verbatim per drill.

### Required walker structure when this rule applies

```markdown
2. Render the SHELL — interfaces + signature + phase-comment outline.
   Prose names the N phases. Next-step offers `run verify` PLUS each
   phase drill.

3-N. (Conditional) When the user says `show me the <phase>`, render
     JUST that section of the loop body verbatim. Prose ties the phase
     back to the prior lesson it composes from. Next-step offers
     remaining drills + run verify.

N+1. Run verify (existing pattern).
N+2. Run tests (existing pattern).
```

### Why this matters

The lesson's pedagogical priority is *what the composition does*, not *every line of how it's composed*. Phase-by-phase drills make the composition explicit (each phase ties back to a prior lesson it builds on) instead of asserted (one big block of code followed by "this composes everything").

Reference exemplar: `learning-with-court/evals-workshop/.claude/skills/lesson-06.md`.

---

## 16. Concept-vs-concept voice (no workshop-history framing)

Learner-facing prose — in walker `>` quote blocks, lesson READMEs, and SessionStart hook output — must NOT reference the workshop's own history. The contrast between two design choices (e.g. tool use vs prompt-coerced JSON) is pedagogically valuable; framing it as "an older version of this lesson used X" is internal narrative leaking out.

### The rule

✅ **Concept-vs-concept, present tense.**

> *"You'll see two patterns for getting structured output from a model. This lesson uses tool use. The other pattern is..."*

✗ **Workshop revisionism.**

> *"An older version of this lesson used SYSTEM_PROMPT..."*
> *"We used to do it this way..."*
> *"Real failure mode hit tonight..."*

### When the contrast matters

Surface the alternative-pattern explanation **when the learner asks why** ("why this instead of just asking for JSON?"), not as a lead-in. Lead with what the code does. Reach for the contrast as backstory.

### Why this matters

Learners don't care about the workshop's evolution. They care about the production-grade pattern + why it's better than alternatives they might encounter in the wild. The history framing ages out (today's "older version" becomes tomorrow's "even older version"); the concept-vs-concept framing is timeless.

Reference exemplar: `learning-with-court/evals-workshop/workshop/lesson_01_setup/README.md` "Tool use vs 'reply with JSON only'" section.

---

## 17. First-encounter explainer links (optional but recommended)

If the workshop touches topics that the platform's landing-site explainer pages cover (`/secrets`, `/editor`, `/getting-started`, `/troubleshooting`, `/cost`), workshop walkers SHOULD link to them at **first encounter** — the first walker (or first lesson README, or first SessionStart hook surfacing) that introduces each topic.

### The rule

- **Once per topic per workshop.** L1 walker links to `/secrets` at first mention of secret handling. L2-LN walkers do not repeat the link.
- **Offer, don't nag.** One-line FYI inside a `>` quote block. No urgency. Learner can ignore.
- **Absolute URLs.** Walkers run in workshop directories; relative links don't resolve.
- **Map the first encounter at authoring time.** The workshop is sequential — "first" is knowable. No state-tracking, no hook logic.

### Standard FYI-link shape

```markdown
> First time setting up a workshop secret? See
> [workshop.institute/secrets](https://workshop.institute/secrets)
> for the threat model and the three supported flows side by side.
```

### Per-workshop first-encounter map (TODO for fork operators)

In your forked workshop, document which walker/README/hook is the first encounter for each linkable topic. Then link from that exact spot:

| Topic | Explainer URL | First walker in YOUR workshop |
|---|---|---|
| Secret handling | `/secrets` | TODO |
| Editing files | `/editor` | TODO |
| Orientation | `/getting-started` | TODO |
| Troubleshooting | `/troubleshooting` | TODO |
| Cost | `/cost` | TODO |

Workshops that don't use any of these topics (e.g. a workshop with no secrets, all-read pedagogy) skip the corresponding rows.

Reference exemplar: `learning-with-court/evals-workshop/.claude/hooks/session-start.sh`.

---

## 18. Cost-honesty in learner-facing prose

For workshops that make paid API calls (Anthropic, OpenAI, etc.), learner-facing prose MUST NOT frame the cost as zero. No "free credits cover the workshop", no "[provider] gives you signup credit so it's basically free", no "free key" framing.

### The rule

✅ **Per-call cost framing.**

> *"Each verify call costs about $0.001 on Haiku 4.5. The workshop runs against real API — these are not free."*

✗ **Free-credit framing.**

> *"[Provider] typically gives new accounts some signup credit; check the current amount on the console."*
> *"Free credits cover the workshop."*

### What stays "free"

Three things genuinely cost zero per call and CAN keep the "free" framing:

- Unit tests (mocked SDK; no API call)
- Pure-function judges / validators (no API call)
- Cache hits (cached response replays at zero cost)

These are the pedagogically useful cost contrast — the workshop teaches *when each tier of work costs money and when it doesn't*. Calling the API-driven path "free" undercuts the lesson.

### Why this matters

For workshops about cost-aware production patterns (evals, in particular), saying "it's basically free" teaches the wrong mental model from page one. Real money, modest amount, learner should know. The cost guardrails the workshop teaches (default item caps, structural-first then LLM-second judging, cache reuse) only make pedagogical sense if the learner understands the API calls cost something.

Reference exemplar: `learning-with-court/evals-workshop/workshop/lesson_01_setup/README.md` Step 1 — honest per-call cost framing.

## Where this came from

This spec is derived from `learning-with-court/mcp-workshop`'s `docs/WORKSHOP_SPEC.md` — a 486-line document refined across 13 lessons of real-learner walks. The mcp-workshop version is the canonical reference; this template version is what a fork operator needs at workshop-design time. If you find a rule here that doesn't make sense in your workshop's context, check the mcp-workshop spec for the long-form rationale before deciding to deviate.
