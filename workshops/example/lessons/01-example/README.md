# Your first function

**Goal:** Read the test this lesson ships, have Claude write the one function it asks for, and watch that function run.

## Walkthrough

1. **Read the test**

   This lesson comes with a test: a small program that checks your code does what it should. Read it first, so you know what you're making before anything is written.

   ```
   Show me this lesson's test and tell me in plain words what it checks.
   ```

   **Claude runs:** `cat src/example.test.ts`

   The test looks for one thing in `src/example.ts` and checks what it hands back.

2. **Choose what the greeting says**

   The test compares the greeting letter for letter, so close isn't enough. Pick the text you think it wants.

   ```
   I think the greeting must be "Hello from example!" with the exclamation mark. Am I right?
   ```

   **Claude runs:** nothing; it checks your pick against the test.

3. **Write the function**

   A function is a named piece of code that does one job. Ask Claude for one that returns the greeting, and to export it, so the test in another file can use it.

   ```
   Write src/example.ts with one exported function, example(), that returns "Hello from example!".
   ```

   **Claude runs:** no command; it writes `src/example.ts`.

4. **Watch it run**

   The test checks your function for you. Now see it work on its own, the way someone using it would.

   ```
   Run my function once and show me what it returns.
   ```

   **Claude runs:** `pnpm try`

   It prints the greeting your function returned.
