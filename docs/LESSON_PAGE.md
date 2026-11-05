# Writing a lesson for the lesson page

`lwc start` opens two things side by side: the terminal, where the learner talks to Claude, and the **lesson page**, a browser page that shows the lesson one step at a time. This doc says how to write a lesson so the page reads well. The worked example is the template's own lesson, `workshops/example/lessons/01-example/` (its `README.md`, `lesson.yaml`, `coach.md` and test), with `workshops/example/intro.md` and `terms.yaml`. Git Basics is the full-size example: every one of its ten lessons follows this pattern.

The guide's side of it, what Claude does with the page open, is in `base/.claude/skills/_walker-base.md` under "With the lesson page open". This doc is the author's side.

## The pieces, with an example of each

A **step** is one numbered item under the README's `## Walkthrough`. The page shows one step at a time, in order. Example: "3. **Write the function**".

The **ask** is the one line the learner sends to Claude for that step. It is always a fenced code block, so the page can give it a **Send to Claude** button. Example:

````
```
Write src/example.ts with one exported function, example(), that returns "Hello from example!".
```
````

**Claude runs** is the line after the ask that lists the exact commands the step runs, each as inline code: "**Claude runs:** `pnpm try`". When the step runs no command, say what Claude does instead: "**Claude runs:** no command; it writes `src/example.ts`." The guide runs exactly what this line lists, so the page and the terminal match.

A **step result** is what fills in under the step once Claude has done it: what Claude ran, what happened in one sentence, and what it means. The guide sends it with `page_step_result`. Example: "Claude ran `pnpm try`. What happened: your function returned Hello from example!. What it means: it works on its own, outside the test."

**Next step** is the button that appears under a step once it has a result. Pressing it is the only way forward: it tells the guide the learner has read the result and is ready for the next step.

A **choose step** asks the learner to predict before acting, with one button per choice. Example: "Choose what the greeting says", with buttons "Hello from example!", "Hello from example" and "Any greeting will do". The choices live in `lesson.yaml`; the README keeps one fenced block, the right answer, for an older lwc that shows no buttons.

A **view** is what the page draws beside a step from the learner's practice repo, the second repo some workshops have the learner make (Git Basics does, in lesson 3, and records it in `.lwc/target-repo`). There are three: `file <path>` (a file with its changed lines marked), `move <from> <to>` (a change moving between edited, staged, committed and github), and `commits` (the commit list). A step with `{}` keeps showing the last view an earlier step named, so the page shows the repo as it is now; `view: none` (lwc 0.44.0 and later) draws nothing and stops that, for a step about something else, such as a look at GitHub. A view never reads the workshop's own clone, so a workshop whose learner works in its own clone, like the example, gives each step `{}`, which means no view.

The **recap** is the screen a lesson ends on: what the lesson made true, one line per thing the learner did, where things stand now, and the lesson's terms. Below it, the **lesson check** runs: the lesson's test, shown as "Lesson check: 2 of 2 passed", or on a failure the first failed check with a button that asks Claude to fix it. Once every check passes, the page offers the next lesson.

A **term** is a word the page underlines the first time it appears in a step. Hovering or tapping it opens a card with what it means and a button that asks Claude for more. Example: "**test**: A small program that runs your code and checks it does what it should."

The **intro** is the screen the page shows before lesson 1: the workshop's `intro.md`, then a button that starts lesson 1.

## How to write a lesson

1. **One action per step.** Each step asks Claude to do one thing. When a step would ask the learner to understand something and act on it at once, split it: see it, choose, then do it.
2. **A plain sentence first.** Each step opens with one sentence, before the ask, saying what the learner is about to do and why, in everyday words. Example: "The test compares the greeting letter for letter, so close isn't enough."
3. **No word before the step that introduces it.** Introduce each new term in one sentence where it is first used ("A function is a named piece of code that does one job."), and give a term from an earlier lesson a one-line reminder the first time it comes back. This holds for the page and for the guide's words in `coach.md`.
4. **Every ask is a fenced block**, one line, so every step has Send to Claude.
5. **"Claude runs:"** names the exact commands as inline code, and one line after it says what to watch for, only where that helps.
6. **Predictions are choose steps.** Before an action whose effect or safety is the point, a step asks the learner to pick.
7. **The README is the title, a `**Goal:**` line and `## Walkthrough`, and nothing else.** No Key concepts, What you'll learn, Try this, Validation checklist or Common pitfalls: a learner reads what they need as a sentence at the step where it matters, and pitfalls the guide needs go in `coach.md`. This replaces the README sections `docs/WORKSHOP_SPEC.md` §2 lists, for a lesson written for the page.
8. **No "Run verify" step.** The lesson ends on its last real step. Pressing Next there brings the recap and runs the lesson check.
9. **Name each check in plain words.** The recap shows each check's name, so write it as a sentence a learner can read: "The function returns the greeting, letter for letter", never a setting name, a command or a timing. In a vitest test, that is the `it(...)` name.
10. **Name the other options when the lesson picks one.** Where a step uses one of several ways to do something (a squash merge, an ssh remote, an ed25519 key), its result's `means` names the others in one line and says why the workshop picked this one, because a learner who only ever sees one way can't tell a choice from a rule, even in a basics workshop.

## `lesson.yaml`: `steps:`

One entry per Walkthrough step, in order, each with a view, choices, both or neither:

```yaml
steps:
  - {}                               # 1 read the test
  - choices:                         # 2 choose what the greeting says
      - label: "Hello from example!"
        prompt: "I think the greeting must be \"Hello from example!\" with the exclamation mark. Am I right?"
      - label: "Hello from example"
        prompt: "I think the greeting must be \"Hello from example\" with no exclamation mark. Am I right?"
  - view: file src/greet.js          # (a workshop with a practice repo)
  - view: move edited staged
```

Each choice's `prompt` is what its button sends. Remove any old `panels:` line from a lesson you convert.

## `intro.md` and `terms.yaml`

Both sit in `workshops/<ws>/`, beside `workshop.yaml`, and both are optional: a workshop without them looks as it did before. `scripts/compose.ts` copies them into `.workshop/<ws>/`, where lwc reads them.

`intro.md` is plain markdown: what the workshop makes, how a lesson works on the page, and one line per lesson.

`terms.yaml` lists the workshop's terms, ordered by the lesson that introduces each:

```yaml
terms:
  - term: export
    means: Marks a function so code in another file can use it. The test can only call your function if it's exported.
    ask: Tell me more about what export means.   # optional; replaces "Tell me more about what a <term> is."
```

Keep each `means` to one or two plain sentences that use no word an earlier entry hasn't explained. The page matches a term as a whole word, any case, with -s or -es after it, outside code, so don't pick a term that is also an everyday word in a step.

## `coach.md`: the guide's script

The coach has one entry per step, in the same order, counted from 0 (the index the page tools take, so step 1 in the README is index 0). Each entry gives:

- the commands, exactly as the README's "Claude runs" lists them;
- what the result holds where it needs more than a sentence: **Result rows** (labels for a short table), **Parts:** (each part of a command or flag the first time the workshop uses it, one sentence each), **Links:** (what to link when the step makes something on a website);
- **Terminal:** the one or two sentences the guide says, with the command named.

The lesson opening is one sentence plus "the first step is on the page". After the last step, the coach gives the recap's `summary` and `now` rows, the lesson check command and its `submit_verify_output` call, and **the one thing to leave them with**, which is the guide's one line when the check passes. The example's `coach.md` shows the whole shape.

## The page tools a lesson relies on

These are `lwc`'s tools; the guide calls them as `_walker-base.md` says.

- `page_set_lesson`: shows a lesson, by its slug, one step at a time.
- `page_step_result`: fills in a step's result and shows Next step.
- `page_set_step`: marks a step done and the next current, when Next arrives.
- `page_recap`: shows the recap in place of a current step.
- `page_show_verify`: shows the lesson check's output under the recap.
- `page_note`: an aside on the page (kind `coach`), or a caution.
- `page_show_code`: a long piece of code or output, on the page instead of the terminal.

## The check

`pnpm lint-manifest` runs `scripts/lint-steps.ts` after the manifest lint. It checks each `steps:` entry (a view of a known kind, at least two choices each with a label and a prompt, no more entries than Walkthrough items) and each `terms.yaml` (every entry has a `term` and a `means`, and `intro.md` is beside it). A lesson with no `steps:` passes.
