import { describe, it, expect } from "vitest";
import { example } from "./example.ts";

describe("example", () => {
  it("returns the expected greeting string", () => {
    expect(example()).toBe("Hello from example!");
  });
});
