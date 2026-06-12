# Workshop Walkthrough — Human Smoke Test

This is the **human-loop counterpart to manifest lint and typecheck**. Automation can prove every skill has the right H2 sections and every cross-reference resolves; only a human can prove the workshop *feels* like a guided walkthrough.

Run this checklist:

- Before tagging a workshop release.
- After any retrofit that changes more than ~30% of lessons.
- Periodically (~quarterly) to catch drift.

The walkthrough takes longer when you find issues (which is the point).

---

## Pre-flight

- [ ] You're on a clean working tree (`git status` is clean).
- [ ] You have Node 22+ (`node --version`) and pnpm 9+ (`pnpm --version`).
- [ ] You have an authenticated Claude Code session.
- [ ] (If your workshop requires external creds) You've sourced them — see your workshop's `.env.example` for what's needed.

If any of these fail, fix them — you can't validate the workshop's onboarding if your machine isn't a typical learner's machine.

---

## Phase 1 — Workshop install end-to-end

Pretend you're a brand-new learner who just `git clone`d the repo (or used `lwc setup <id>`).

- [ ] `pnpm install` exits 0 with no warnings about missing peers or unmet deps.
- [ ] `pnpm typecheck` exits 0 across all workspaces.
- [ ] `pnpm test` exits 0.
- [ ] `pnpm lint-manifest` exits 0.
- [ ] In Claude Code: the workshop's `.mcp.json` is auto-detected; if the workshop has a hosted MCP server, the connection is healthy in `claude mcp list`.
- [ ] The natural-language entry phrase (`let's start the workshop`) routes into the `start-workshop` skill, which executes its body.

If any step fails, stop here — the rest of the walkthrough depends on this working. File a bug.

---

## Phase 2 — Start-workshop branching

The `start-workshop` skill must route correctly based on what the user has set up.

- [ ] Without `.env` and without external creds: `start-workshop` should walk you through `pnpm install` and land you on Lesson 1.
- [ ] With `.env` populated: routing unchanged — Lesson 1 doesn't need the secrets.
- [ ] TODO: With expired or wrong external creds (if your workshop has phases that depend on them): `start-workshop` should branch into the relevant `onboard-<provider>` skill if you indicate you want to do that phase. (If it doesn't, that's a routing gap.)

If routing skips an expected branch, that's a real bug.

---

## Phase 3 — Lesson walkers (sample, not all)

Don't walk every lesson every time. Walk **a sample across the phases**:

> TODO: list the lesson(s) to sample once your workshop is built. Aim for one per phase or one per pedagogy shape (toolchain setup, transport-level, integration-level, deploy-level).

For each sampled lesson, confirm:

- [ ] **The walker shows a code snippet before asking you to run a command** (Visible walkthrough contract — code first, then verify).
- [ ] **The walker offers `Say: show me what's in <file>`** affordances and they actually work — try one and check the response shows the file.
- [ ] **The walker offers `Say: break down that code`** and the response is a chunked, sectioned explanation, not a single paragraph.
- [ ] **The walker offers `Say: walk me through changing X`** and predicts the new output. Try the edit; the prediction matches.
- [ ] **After the command runs, the walker quotes the full stdout verbatim AND maps 1-2 lines back to the code** that produced them. It does NOT say "passed, next lesson."
- [ ] **The walker ends with the exact next thing to say** (a natural-language phrase, not "you can do X or Y").

If any walker fails one of these, log it as drift from the spec (`docs/WORKSHOP_SPEC.md` §1).

---

## Phase 4 — Lesson READMEs stand alone

Open a lesson's README directly on GitHub (not in your editor — actually navigate to the GitHub URL). Pretend you have never installed the workshop and never plan to.

Sample 2-3 lessons across the phases. For each:

- [ ] The H1 + goal sentence tells me what I'm building before I read further.
- [ ] `## What you'll learn` lists 3-5 *learning objectives* (action verbs), not features.
- [ ] `## Key concepts` includes a reference table or labeled diagram where it makes sense.
- [ ] `## Walkthrough` shows expected output for each command + maps output back to code + suggests an edit + predicts the new output.
- [ ] `## Validation checklist` has 3 testable assertions I could run.
- [ ] `## Common pitfalls` table covers failures I'd realistically hit.
- [ ] I close the README and could explain to a coworker *what this lesson teaches and why each design choice was made* — not just *how to run it*.

If the answer to the last bullet is "no, I'd need to read the code to understand the why," the README is reference, not pedagogy. Note it.

---

## Phase 5 — Utility skills under stress

Pick a real situation and try to use a utility skill to handle it.

> TODO: replace with the utility skills your workshop ships. Examples to follow:

- [ ] `where-am-i` (if shipped): After running a few lessons, ask `where am I`. It should figure out where you are from `git log` + `ls workshop/` and route you correctly.
- [ ] `debug-my-<thing>` (if shipped): Deliberately break something (e.g., delete a `return` from a handler). Run the lesson's verify; it'll fail. Ask `help me debug`. It should walk a diagnostic top to bottom and find the issue.
- [ ] `onboard-<provider>` (if shipped): Simulate an auth error. The skill should diagnose, walk you through the fix, and unblock you.

If a utility skill takes more than 2-3 turns to deliver value, it's not pulling its weight.

---

## Phase 6 — Promise vs reality

Reread the root `README.md` "What this is" promise. After the walkthrough above, are both promises true?

- [ ] Plugin walks you through (not "documents that you should run things"). Pause-and-prompt is the test, not "tells you what to type."
- [ ] READMEs stand alone (a stranger on GitHub can learn from them).

If either promise isn't true for a sampled lesson, that lesson is a target for the next retrofit pass.

---

## Phase 7 — Cleanup (if applicable)

If your workshop deploys external resources (AWS, etc.):

- [ ] The cleanup step in the last lesson's README actually destroys everything.
- [ ] No orphan resources remain (check the relevant provider console).

---

## Reporting

If you find drift:

1. Open an issue tagged `workshop-drift`.
2. Quote the exact spec section the lesson violates (e.g., "Lesson N's walker is missing `Say: walk me through changing X` affordances per WORKSHOP_SPEC §1").
3. Reference the canonical exemplar (`learning-with-court/workshop-mcp`'s Lesson 1 walker / README) for the right shape.

Don't try to fix everything in one PR. Manifest lint catches structural drift fast; this checklist catches pedagogical drift, which is harder and slower to fix.

---

## When to refresh this checklist itself

If `WORKSHOP_SPEC.md` changes (new required sections, new conventions), update Phase 3-5 of this checklist to match. The two docs MUST stay in sync — manifest lint enforces structure, this enforces meaning, and they have to point at the same thing.
