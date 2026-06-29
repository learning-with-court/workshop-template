# Primer: `tool_use` and structured output

> On-demand primer. The guide `Read`s this only when the learner asks or is
> stuck on the concept — it is never preloaded. Read it TO the learner in plain
> language, then return to the lesson. Don't dump it verbatim.

## The one-sentence version

`tool_use` is how you get Claude to answer in a **shape you define** — a
filled-in form — instead of free-flowing prose you'd have to parse.

## The problem it solves

Ask Claude in plain text for "the bugs in this diff" and you get a paragraph.
Paragraphs read well to humans but are miserable for a program: where does one
finding end and the next begin? What's the severity? Which line? You'd write
brittle string-parsing to dig the answer back out, and it breaks the moment the
wording changes.

You want the answer as **data** — a list of findings, each with a few known
fields — so your code can loop over it directly. That's what tools give you.

## How a tool works (the mental model)

A **tool** is a named function you describe to Claude. You don't send code — you
send a *description*: a name, a sentence about what it's for, and an
**`input_schema`** that says exactly what arguments it takes and their types.

When you offer Claude a tool and ask your question, instead of writing prose,
Claude can decide to "call" the tool — it returns a `tool_use` block: the tool's
name plus an `input` object that **conforms to the schema you defined**. You read
`input` straight off the response. No parsing prose, no guessing.

So the flow is:

1. **You define the shape.** "Here's a tool called `record_findings`. Its input
   is `{ findings: [{ file, line, severity, message }] }`."
2. **You ask your question**, offering that tool.
3. **Claude replies with a `tool_use` block** whose `input` matches your shape.
4. **Your code reads `input.findings`** — already structured, ready to use.

The schema is a contract. You're not hoping Claude formats things nicely; you're
telling it the exact form the answer must take.

## `input_schema` — just JSON Schema

`input_schema` is written in **JSON Schema** — the same vocabulary that
describes the type of a JSON object. The basics you'll actually use:

- `type: "object"` with `properties` — the named fields.
- each property has its own `type` (`"string"`, `"number"`, `"boolean"`,
  `"array"`, `"object"`).
- `required: [...]` — which fields must be present.
- for an array, `items` describes what each element looks like.

You don't need the whole spec — describe the fields you want and their types.
(In TypeScript projects, libraries like Zod let you write the shape once and
generate this schema, so you don't hand-author JSON Schema.)

## `tool_choice` — whether Claude *must* use the tool

By default Claude decides whether a tool is warranted. When you want the
structured answer *every time*, you set `tool_choice`:

- **`auto`** — Claude chooses whether to call a tool (the default).
- **`any`** — Claude must call *one of* the offered tools (not plain prose).
- **`tool`** — Claude must call *the specific tool you name*.

For "always give me findings in this shape," you force the one tool. That turns
tool_use into reliable **structured output**: a guaranteed, schema-shaped answer.

## Why this beats prose (the payoff)

- **No parsing.** You read fields, not sentences.
- **Predictable.** The schema is enforced — the same fields, every call.
- **Composable.** Structured findings flow straight into the next step (filter,
  sort, feed to another pass) without a fragile text round-trip.

That's the whole jump: from "ask for text and hope" to "define the shape and
receive data." Everything else in the lesson is filling in a real schema and
wiring the `tool_use` response into your code.
