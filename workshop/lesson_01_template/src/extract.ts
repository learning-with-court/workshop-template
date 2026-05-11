// Defensive JSON parse — the canonical workshop pattern.
//
// Models slip ```json fences (and stray prefix/suffix prose) into their
// output despite system-prompt instructions that say "respond with JSON
// only". Production extract code always strips fences before parsing.
//
// The double-pass shape (strip fences → JSON.parse) is the workshop's
// reference defensive parse. Every lesson that reads model output through
// JSON should use it. Inline it instead of importing if the lesson is
// trying to make this pattern visible to the learner — the lesson IS the
// pattern.

/**
 * Parse JSON from a model response, tolerating ```json / ``` fences
 * and surrounding whitespace.
 *
 * @throws SyntaxError if the cleaned string isn't valid JSON. Catch and
 *   surface the *raw* response in the error message so the learner sees
 *   what the model actually emitted.
 */
export function extractJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();

  // Strip leading ```json or ``` (with optional language tag) and the
  // matching trailing ```. The model sometimes emits only the opening
  // fence; the regex is forgiving about whitespace + the optional
  // language tag.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    return JSON.parse(stripped) as T;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new SyntaxError(
      `Failed to parse model output as JSON (${reason}). Raw response was:\n${raw}`,
    );
  }
}
