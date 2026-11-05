---
name: example-example
description: Walks the learner through the example workshop's first lesson — reading the shipped test, choosing the exact greeting it wants, having Claude write and export example() in src/example.ts, and running it once with pnpm try. Use when the user says "start lesson 1", "let's start", "start the example lesson", "your first function", "write the example function", or "walk me through the example".
---

# Lesson 1 — Your first function

> **Conventions:** `_walker-base.md` governs, and its "With the lesson page open" section says how the page and the terminal share the work. This coach carries only the per-lesson content. It is the template's worked example of the lesson page pattern (`docs/LESSON_PAGE.md`): copy its shape for a real lesson.

> **HOW CLAUDE READS THIS FILE.** Lives at `.claude/skills/example-example.md`. Project-level skill files are NOT invocable Skills — the activation is the Read. Never write "invoke this skill".

You are facilitating lesson 1. The lesson README is at `.workshop/example/lesson_example/README.md`; it is the source of truth. The shipped test is `src/example.test.ts`; the learner's function goes in `src/example.ts`.

## Pedagogical priority

Read the test before writing the code: it says exactly what "done" means.

## Starting the lesson

This is the workshop's first lesson. With the page open, the intro screen has already said what the workshop makes and who does the typing, so say one sentence on what the lesson is for and that the first step is on the page: "This lesson writes one small function, starting from the test that checks it; the first step is on the page." With no page, give `_walker-base.md`'s short orientation first, then the first step's ask as a line to say.

## Each step is one action

The page shows one Walkthrough step at a time: a one-line ask with Send to Claude (or, on a choose step, one button per choice) and the exact commands under **Claude runs:**. Run exactly the commands a step lists, in that order, and no others, so the page and the terminal match. Don't run ahead into the next step's action.

**The choose step** (index 1) is a prediction. The learner's message says what they picked. Say in one sentence whether it is right and why, then run only what the step lists. A wrong pick is not a failure; it is the reason the step exists.

When a step's commands have run (or, on a step with none, once its action is done):

1. **Fill in the step's result:** `page_step_result` with that step's index, from this run's real output (never the examples in this file):
   - `ran`: the exact commands you ran for this step, in order; empty when you ran none. A file you wrote with your own tool goes as `Wrote <files>`.
   - `happened`: one plain sentence on what came back.
   - `rows`: only where the step names **Result rows**: those labels, each with its real value.
   - `raw`: the output, unparsed, whenever it printed something a learner would read.
   - `means`: one or two sentences on what it means for the learner, in words the page has already introduced; then, only where the step names **Parts:**, one sentence for each part listed.

   It does not move the step: never call `page_set_step` here.
2. **Keep the terminal to one or two sentences** plus the command named in one short code line. Quote no output, and don't name the next step.

**Moving on.** The step stays current until the learner presses **Next step** ("I'm done with this step"). Only then call `page_set_step` with that index `done` and the next `current`. Next on the last step (index 3) brings the recap and the lesson check below.

With no page, skip the result and step calls and say it all in the terminal: show each command before it runs and quote its output after.

## Steps

0. **Read the test** (index 0). `cat src/example.test.ts`.
   - **Result rows:** one row per check in the file: the label its name as written, the value what it checks in plain words.
   - **Parts:** `cat`: prints a file's contents.
   - **Terminal:** one sentence naming `cat`: two checks, one that the function is there and one for the exact text.

1. **Choose what the greeting says** (index 1). A prediction; no command. The right answer is "Hello from example!", exclamation mark and all. If they picked the one without it, say the test compares letter for letter, so one missing character fails; if they picked any greeting, say the test names one exact text.
   - **Result:** `ran` empty; `happened` names their pick and whether it matches the test.
   - **Terminal:** one sentence on the pick.

2. **Write the function** (index 2). Write `src/example.ts` with your file tool: `export function example(): string { return "Hello from example!"; }`, nothing else. No command. The learner's ask is the request: `src/example.ts` is the lesson's `targetFiles` entry, the one file it asks Claude to write.
   - **Result:** `ran` is `Wrote src/example.ts`; no `raw`. `means` says `export` is what lets the test, in another file, call it.
   - **Terminal:** one sentence: the file holds one exported function.

3. **Watch it run** (index 3). `pnpm try`.
   - **Result rows:** Returned: the text it printed.
   - **Parts:** `pnpm try`: runs this lesson's function once, outside the test, and prints what it returned.
   - **Terminal:** one sentence naming `pnpm try`: the function returned the greeting on its own.

**After the last step: the recap and the lesson check.** When Next arrives on index 3 (Watch it run), end the lesson as `_walker-base.md` says under "The end of a lesson":

- **Recap:** a `summary` along the lines of "You read a test, had the function it asks for written, and saw it return the greeting on its own." Write `did` from this run. `now`: This project: `src/example.ts` holds `example()`, exported, returning the greeting. Next: the workshop's next lesson (in this template there is none; leave the row out).
- **Lesson check:** `pnpm exec vitest run src/example.test.ts || true`, then `page_show_verify` with that command and the raw output. On a pass, `submit_verify_output({ lesson_id: "example", output: "<the raw verify stdout>" })`.

**The one thing to leave them with.** The test said what "done" meant before any code existed. It is the terminal's one line when the lesson check passes. This is the workshop's last lesson, so it is also the closing line.

## What To Say Next

With the page open, say none of these: Next step brings up the next step's ask, and once the recap's lesson check passes, the page offers the next lesson. With no page, give the next step's ask as a line to say, from the Walkthrough, and after the lesson check:

> **Say `let's start lesson 2`** to move on. (Replace with your workshop's real next step.)

Either way, if they seem lost before the last step:

> Say `continue the workshop` any time and I'll pick up from the record.

## Common debugging

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find module './example.ts'` | The file isn't written yet, or is in the wrong place | Write `src/example.ts` at the repo root |
| `expected 'Hello from example!' but got …` | The text differs by a letter or a mark | Match it exactly: `"Hello from example!"` |
