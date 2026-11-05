import { it, expect } from "vitest";
import * as lesson from "./example.ts";

// Each check's name is what the learner reads on the lesson's recap: plain
// words, no setting names or commands.
it("Your file shares a function named example", () => {
  expect(typeof (lesson as Record<string, unknown>).example).toBe("function");
});

it("The function returns the greeting, letter for letter", () => {
  expect(lesson.example()).toBe("Hello from example!");
});
