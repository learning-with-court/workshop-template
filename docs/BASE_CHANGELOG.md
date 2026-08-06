# Shared base changelog

The shared base is the set of files in `base.manifest`, synced into Code
workshops by `scripts/sync-base.ts` (workspace) and pinned per-member in
`base.lock`.

> **Gap:** v13–v16 shipped without changelog entries. Reconstruct from
> `git log base-v12..base-v16 -- base/ base.manifest` if you need them; they
> are deliberately not backfilled here rather than guessed at.

## base-v30 (2026-08-06)
Presented workshops gain a fourth continue-choice option, **Play the rest
through**, offered once in the lesson opening and available at any later pace
check. It is a learner-only choice: the guide keeps narrating every cell and
stops asking permission between beats, and it passes the pacing argument on the
cell tools so the reply stops marking a pause.

The point of putting this in the tool rather than only here is worth stating,
because the alternative looks cheaper and is not. Prose alone would have to tell
a guide to ignore a flag that fires on most teaching cells, in the same file
that says "A tool flag is easy to obey and prose is easy to skip". With the
argument the flag simply does not arrive, and the reply instead carries the four
conditions that still stop: a decision the learner owns, a cell that errors, the
learner taking the wheel, and verify.

It resets at every lesson boundary, and the opening offer is made again rather
than inherited. Agreeing to hear one lesson played through is not agreeing to
the next. `mode: builder` workshops do not offer it, since the learner is the
one running things there.

Needs `lwc` with the pacing argument. An older CLI keeps marking the pause; the
prose says to honour the learner's request regardless and never to mention a
version.

## base-v29 — 2026-08-05
`compose.ts` wrote its temp index to `join(REPO, ".git", "compose-index-<label>")`.
In a linked worktree `<REPO>/.git` is a FILE holding a `gitdir:` pointer, not a
directory, so that path is invalid and compose fails. It now resolves the real
git dir with `git rev-parse --absolute-git-dir` and writes there.

CI never saw this because `actions/checkout` produces a normal clone. It bites
exactly where this workspace actually works: worktrees under `.worktrees/`, which
is the documented convention, and which `sync-base` itself uses to isolate each
member.

**A second fix in the same area does NOT travel, and members must be patched by
hand.** `scripts/compose.test.ts` built its fixtures with `cwd` set to a tmpdir
but did not sanitise the environment. Git exports `GIT_DIR` and friends to hook
subprocesses, in a linked worktree `GIT_DIR` is an absolute path, and `GIT_DIR`
outranks `cwd` — so under a pre-push run every fixture `git init`, `git config
user.*`, tag and object landed in the developer's real clone. One run left a main
clone converted to bare. The test now strips
`GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|COMMON_DIR|NAMESPACE|PREFIX)`
into an `ENV` it passes to every `execFileSync`.

That file is not in `verbatim`, because the base ships scripts and never their
tests (`validate-base.mjs` yes, `validate-base.test.mjs` no). The consequence is
worth stating plainly: **member copies of template tests are fossils from fork
time that no sync will ever update.** `workshop-nexus` carried a vulnerable copy
and was patched directly alongside this cut. Any future member forked before this
version has the same landmine, and the standing question — put tests of synced
scripts in the manifest, or delete the fossils so the template is sole owner — is
still open.

## base-v28 — 2026-08-03
Fixes a v27 mistake before it shipped. `manifest-lint.yml` IS a synced base
file, and v27 added `pnpm lint-notebook-mechanics` to it. That script lives only
in the template and is in neither manifest by design (it needs a YAML parser,
while the member-side validator must run under bare `node`). Syncing v27 would
therefore have failed CI in every member on a missing script. Caught by reading
the `sync-base --dry-run` output rather than by a gate.

The step moves to a new owner-only `lint-notebook-base.yml`, which is not in
`verbatim` and so cannot travel. The lesson generalises: a step added to a
SYNCED workflow ships to every member, so it may only call something every
member has.

## base-v27 — 2026-08-03
`pace_gate` marks the END of a teaching beat; it is not the beat. Guides were
settling into `run_cell` → prompt → `run_cell`, emitting no chat prose at all,
and compressing whole beats into the one-line preamble of the continue-choice
prompt. The learner watched cells execute and had no conversation.

Observed, not hypothetical: a walk produced six chat messages totalling 439
characters, every one of them setup plumbing, while the lesson's actual content
went into two pace prompts. A tool flag is easy to obey and prose is easy to
skip, so `_walker-base.md` now says both things outright. Rule 5 requires the
explanation to exist as the guide's own words in chat before a teaching cell
runs, and the continue-choice section forbids the prompt from carrying the
teaching, with a self-check: delete every prompt from the transcript and ask
whether the lesson was still taught.

Workshop-agnostic on purpose. Any presented workshop can hit this, and two
already had.

## base-v24 — 2026-07-31
Re-cutting a workshop is now a one-command operation, and a compose run that
cuts nothing can no longer report success.

`compose.yml` gains `workflow_dispatch` (with an optional `env` input that
overrides the branch default), so an operator re-cuts with
`gh workflow run compose -R <repo> --ref main` instead of inventing a commit to
push. A re-cut is routine and should never require faking a change.

The skip guard is also corrected. It tested `base.manifest` alone to detect the
base owner, but a workshop scaffolded by copying this template carries a stray
`base.manifest` — so it looked like the owner and no-opped. That is exactly what
happened to `workshop-nexus`: every compose run since the workflow landed
skipped and reported success, and not one tag was ever cut. The guard now
requires `base.manifest` AND no `base.lock` (members always carry the lock, the
owner never does), a skip states its reason in the log and the job summary, and
the compose step fails outright if it ends with zero tags for the env rather
than going green having published nothing.

## base-v23 — 2026-07-31
Corrects a promise the toolchain no longer keeps. The pacing doctrine told every
guide that a range runner is safe because "the tool enforces a hard stop:
multi-cell ranges are truncated before the first teaching cell". That was true
of the Python bridge and is no longer true of anything: `run_cells` was
re-contracted to honour the requested range IN FULL, with the pace gate applying
at the END, because the old classifier matched 143 of 153 corpus cells and so
truncated essentially every range to nothing while reporting success.

A guide reading v22 would believe an over-wide range gets caught. It does not.
The doctrine now says so plainly: the tool does not inspect the cells and will
not save you; the licence to run a stretch as one beat is the lesson script
declaring it to be one.

## base-v22 — 2026-07-31
Gates are now defined per workshop MODE, declared as `mode:` in
`.workshop/mechanics.yaml`. `mode: builder` (the default when unset) is the
existing behaviour, unchanged: the learner drives, and HARD gates block until
they act. `mode: presented` is new: the GUIDE drives — running notebook cells
through a live kernel, for example — and the learner watches, directs and
decides.

**A presented workshop has no HARD gates.** A HARD gate blocks until the
learner acts, and in this mode the learner is not the one acting, so there is
nothing to block on. The doctrine had only ever described the builder case —
its examples are "apply this diff in your editor" and "a secret pasted into
`.env`" — so a presented workshop had to bend the vocabulary to fit. Nexus
ended up with 31 HARD gates covering exactly three real learner actions, and
eleven of them asserted GUIDE behaviour ("the idea is actually explained"),
which a walker cannot wait for because it cannot wait on itself.

Presented workshops name three things instead: **preconditions** the guide
checks by reading state, **teaching requirements** the judge scores, and
**decisions** — the one place a presented walker genuinely waits, because a
knob that changes what happens next must be offered with evidence and answered
by the learner. Offering a decision is not quizzing; no right answer is being
withheld.

Purely additive: `mode` is absent everywhere today, absence means `builder`,
and no existing workshop changes behaviour.

## base-v19 — 2026-07-29
Members can now hold local additions to a synced file. Until now they could
not: `.gitignore` is verbatim, so anything a member added was silently dropped
by the next sync. That is why base-v18 absorbed workshop-nexus's JupyterLab
ignore rules into the shared base — the wrong fix, recorded there as a known
wart. This is the right one.

- **`LOCAL_SENTINEL` convention.** A marker line splits a synced file:

  ```
  # ── sync-base: local rules below this line are preserved ──
  ```

  Above it is shared and overwritten every sync. Below it belongs to the member
  and survives. `sync-base` writes `shared(base) + local(member)`;
  `base.lock` records the hash of the **shared portion only**, and
  `validate-base` hashes only that portion — so a member edits its local
  section freely while any edit above the line is still caught as drift.
- **`scripts/validate-base.mjs`** gains `sharedPart` / `localPart` /
  `LOCAL_SENTINEL` and hashes `sharedPart(content)`. Files with no sentinel
  hash whole, so this is a no-op for the other 24 verbatim paths.
- **`.gitignore`** carries the sentinel and **drops the nexus-specific
  JupyterLab rules** added in base-v18. Nexus keeps them in its own local
  section.
- The sentinel string is duplicated in the workspace's `scripts/sync-base.ts`
  (different repos, no shared import). Both files say so; changing it is a base
  cut.

## base-v18 — 2026-07-28
Upstreams a fix that `workshop-nexus` had been carrying locally. Nexus's
`scripts/compose.ts` was 14 lines ahead of the base; a verbatim `sync-base`
would have silently overwritten it and reintroduced the bug.

- **Build junk never reaches a served tree (`scripts/compose.ts`).** The
  generator walks the FILESYSTEM, not git, so `.gitignore` does not protect the
  served tree — running a lesson or a `py_compile` check leaves bytecode beside
  the sources and it lands in every cut tag. `walk()` now skips `__pycache__`,
  `.ipynb_checkpoints`, `.pytest_cache`, `.ruff_cache`, `node_modules`, any
  `*.egg-info` directory, and `.pyc` / `.pyo` / `.DS_Store` files.
- **Tests for it (`scripts/compose.test.ts`).** Nexus shipped this untested. The
  fixture now plants bytecode, a checkpoints dir, an egg-info dir and `.DS_Store`
  before composing, and asserts no tag serves them while the real sources beside
  them survive. Verified to fail with the fix reverted.
- **`.gitignore` carries nexus's JupyterLab build-intermediate rules.** Not
  because they are general — they name `extensions/*/lwc_scroll_on_run/` — but
  because `.gitignore` is a verbatim base file, so a member cannot hold local
  additions to it: every sync would silently drop them. They are inert in a repo
  with no `extensions/` directory. A known wart; the alternative is recurring
  silent loss.

## base-v17 — 2026-07-28
Guide-side hardening from the NEXUS live QA walk, all in
`base/.claude/skills/_walker-base.md` (prose only — no code, no scripts).

- **Completion requires a witnessed pass.** The trigger is now "you just
  submitted the final lesson's verify and saw it pass **in this session**".
  `workshop_complete` on `where_am_i` is explicitly insufficient on its own:
  stored progress can already read complete on a clone that has done nothing
  (a resumed session, or a key reused across QA runs). When the flag and the
  clone disagree, believe the clone and carry on teaching. The live walk hit
  exactly this — all nine lessons marked complete at lesson 4 of 9, on a clone
  that had run nothing. Server-side gating is the primary fix
  (`platform` #244); this is the backstop.
- **Never assert the learner's history from a workshop tool.** Broadened past
  the recap to *any* claim about what they've done. Every workshop tool reads
  the same stored record, so a second tool is not a second opinion — three
  tools agreeing is one source three times. The guide instead checks two things
  written by the learner's own work and therefore incapable of corroborating a
  bad record: executed-cell counts across the notebooks (or the files a code
  lesson produces), and `git log --oneline`. Cold-start placement now happens
  from the clone before the guide says anything about history.
- **Decisions are not quizzes.** New section separating three things that look
  alike: comprehension questions (banned — pure assessment), decisions (ask
  them; deciding for the learner steals the lesson), and predictions before a
  reveal (offer, never require). Keep them scarce — one real decision per
  lesson, and if you've asked more questions than you've run cells you've
  stopped teaching. The word "commit" is banned as a demand phrasing. Render a
  decision as two to four labelled options rather than open prose, and do
  **not** mark a recommendation when the choice itself is the lesson.

Already live and exercised in `workshop-nexus`, whose copy of the file is
byte-identical to this cut.

## base-v12 — 2026-06-28
Shared chassis affordances from the CCA Claude Code walkthrough notes
(`docs/2026-06-28-cca-cc-walkthrough-notes.md` #11, #8).

- **Lesson-aware fixture runner (new base file `base/scripts/try.ts`):** `pnpm try`
  gives every lesson with a live single-call demo ONE uniform command. It resolves
  the learner's active lesson from local on-disk lwc state (the active-workshop
  marker + the pinned-tag marker — no network, no MCP), reads that lesson's optional
  `try:` declaration from its served `lesson.yaml`, dynamically imports the
  deliverable export from `src/`, runs it on the declared fixture, and prints the
  result. In-project so `type: module` applies — no ESM/CJS breakage of a hand-rolled
  runner. Registered as a verbatim base member; `base/package.json` gains a `try`
  script + `tsx`/`js-yaml` so `pnpm try` resolves in the served tree.
- **`try:` field in the lesson.yaml schema (`scripts/lint-manifest.ts`):** optional
  per-lesson block — `{ module, export, fixture, fixtureAs? }` — declaring the
  callable + the fixture to feed it (`targetFiles` names the file, not the callable).
  Documented in the example lesson (`workshops/example/lessons/01-example/lesson.yaml`).
- **On-demand concept primers (new base dir `base/.claude/skills/primers/`):** a
  shared library of short, plain-language ground-up explanations the guide `Read`s
  ONLY on cue or detected struggle, never preloaded — depth on hand, not in the
  learner's face. First primer: `primers/tool_use.md` (tool_use / structured output).
  `_walker-base.md` gains a "Concept primers (on demand)" convention describing the
  pointer pattern. Both new files registered as verbatim base members.
- **`scripts/tsconfig.json` widened (synced base file):** `rootDir` now spans the
  repo so `scripts/try.test.ts` can import `../base/scripts/try.ts`, and the served
  `base/scripts/` runner is typechecked here (it has no tsconfig of its own).
- NOT here: `/clear` at workshop boundaries is deferred to `workshop-cca` — the
  `workshop-orchestrator` skill is a fork seed (in `base/` but NOT in `base.manifest`,
  so not synced); CCA owns its filled-in orchestrator.

## base-v11 — 2026-06-28
Lean up the always-loaded coaching chassis (`_walker-base.md`) — same guidance,
smaller always-loaded floor.

- **Anti-false-credit guardrail (new section):** "Only credit the skill the
  learner actually performed." Universal Model-Y pedagogy — credit the learner's
  *direction*, never narrate a hands-on skill (reading the draft, naming the
  gaps) as done when they delegated or punted. Acknowledge the delegation
  honestly and still deliver value. Stays in the CORE always-loaded set.
- **Two sections lazy-loaded into new base files:** "Detection-based
  fast-forward" → `base/.claude/skills/_walker-detection.md`; "HARD vs SOFT
  gates" → `base/.claude/skills/_walker-gates.md`. `_walker-base.md` keeps a
  1–2 line pointer (exact path + when to Read) for each; both new files are
  registered as verbatim base members and sync to all Code workshops.
- **Offered-prompt formatting:** the lesson-opening offered prompt now renders
  as a fenced code block (not an indented blockquote), consistent with rule #1's
  verbatim-output convention.
- CORE stays always-loaded (learner-driven rule, the seven-rules contract,
  read-state-silently, verify-is-diagnostic, "Narrating real test output", etc.).
  The CCA `_walker-supplement.md` lean-up (its dedupe + supplement-resident
  lazy-loads) is a separate change in `workshop-cca`.

## base-v3 — 2026-06-15
Two polish changes to the shared base.

- **Toned down the help nudge** in the canonical `_walker-base.md`. The old
  rule mandated ending EVERY lesson opening with one verbatim line (`Not
  sure where to start? Just say so — asking is how this works.`), which read
  as a rote tic on a real walk — identical every lesson. The rule is now a
  **starting-point nudge offered only where it genuinely helps** (the first
  lesson or two, when a learner hesitates, at a tricky step), phrased
  **varied and naturally — never the same sentence twice**, with 3–4
  illustrative (not scripted) phrasings the guide varies. The coaching move
  (treat "help"/"I'm stuck" as first-class; walk into the FIRST concrete
  step; never imply they should've known; two flounders → offer proactively)
  is kept intact. `docs/WORKSHOP_SPEC.md` §20/§21 updated to match.
- **Scaffolder verify import bug:** investigated whether the base scaffolder
  (`scripts/new-lesson.ts`) or lesson template (`workshop/lesson_example/`)
  generates a verify that does a raw `await import(<filesystem-path>)`
  (fragile in ESM). **It does not** — the template `verify.ts` is a static
  console scaffold and the only `await import` in the tree is a
  commented-out relative-specifier example. No base change made here; any
  raw-import bug lives in a member's existing lessons, handled separately.

## base-v2 — 2026-06-14
The **L0 pedagogy skill** joins the shared base: the canonical, workshop-
agnostic `_walker-base.md`.

- **New verbatim member:** `.claude/skills/_walker-base.md` — the single
  source of truth for shared pedagogy conventions (lesson-opening structure,
  the asking-for-help close, the seven-rule visible-walkthrough contract,
  read-state-silently, secret-safe detection fast-forward, HARD/SOFT gates,
  verify-is-diagnostic-not-graded, don't-quiz, style + language rules).
- **`user-invocable: false`** — new frontmatter key marking it as a
  reference layer, not a triggerable Skill. It is invoked by the
  orchestrator at lesson ENTER (`Read .claude/skills/_walker-base.md` once
  before loading the lesson walker), NOT hook-injected.
- **Detection is secret-safe:** the API-key fast-forward uses presence
  checks (`grep '^ANTHROPIC_API_KEY=' .env`, `lwc env has`), never any
  command that prints a secret value to the agent's tool surface.
- Workshop-specific pedagogy stays in each workshop's own supplement; the
  L0 body is agnostic so it syncs verbatim to every Code workshop.

## base-v1 — 2026-06-14
Initial foundation: the workshop chassis + authoring toolchain, standardized
on the slug lesson scheme (see `WORKSHOP_STANDARD.md`).

- **Verbatim chassis:** `.feature-workflow.yml`, `tsconfig.base.json`,
  `scripts/tsconfig.json`.
- **Manifest linter (now canonical):** `scripts/lint-manifest.ts` — rewritten
  to the slug schema; verified to lint the template + all three Code members
  (mcp, sql-intro, evals) green. Members reclaim one canonical linter (it had
  drifted into four versions).
- **Authoring scripts (now canonical):** `scripts/new-lesson.ts`,
  `scripts/rename-lesson.ts`, `scripts/sync-workshop-yaml.ts`,
  `scripts/setup-shared.ts` — slug-scheme; members previously lacked these.
- **Drift check itself:** `scripts/validate-base.mjs` and
  `.github/workflows/validate-base.yml`.

Deliberately OUT (essential per-workshop): `pnpm-workspace.yaml` (mcp's
`shared`/`infra` globs), `lefthook.yml` (sql-intro's `lint-workshop` hooks),
`scripts/package.json` (member-specific deps), `docs/WORKSHOP_WALKTHROUGH.md`
(per-workshop customized; seed-if-absent later). The L0 pedagogy `_walker-base`
skill lands in base-v2 (below).
