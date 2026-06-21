# Example Lesson

Write a function that returns a greeting string.

## What you'll build

A TypeScript module at `src/example.ts` that exports a single function:

```ts
export function example(): string
```

The function returns `"Hello from example!"` — nothing more, nothing less.

## Verification

Run the shipped test to check your work:

```
pnpm exec vitest run src/example.test.ts
```

A passing run prints `Tests  1 passed`. If the export is missing or the return value is wrong, the test tells you exactly what it expected vs. what it got.
