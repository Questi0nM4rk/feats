import { describe, expect, test } from "bun:test";
import type { ParsedStep } from "@/parser/models";
import { formatStepError } from "@/reporting/error-formatter";

function makeStep(
  keyword: ParsedStep["keyword"],
  text: string,
  uri: string,
  line: number,
): ParsedStep {
  return {
    keyword,
    text,
    dataTable: undefined,
    docString: undefined,
    location: { uri, line },
  };
}

describe("formatStepError", () => {
  test("includes file location", () => {
    const step = makeStep("When", 'I run "ai-guardrails init"', "tests/features/init.feature", 12);
    const formatted = formatStepError(step, new Error("Command exited with code 1"));
    expect(formatted).toContain("tests/features/init.feature:12");
  });

  test("includes step keyword and text", () => {
    const step = makeStep("When", 'I run "ai-guardrails init"', "tests/features/init.feature", 12);
    const formatted = formatStepError(step, new Error("Command exited with code 1"));
    expect(formatted).toContain('When I run "ai-guardrails init"');
  });

  test("includes error message", () => {
    const step = makeStep("When", "I do something", "features/foo.feature", 5);
    const formatted = formatStepError(step, new Error("Command exited with code 1"));
    expect(formatted).toContain("Error: Command exited with code 1");
  });

  test("formats non-Error thrown values", () => {
    const step = makeStep("Then", "the result is correct", "features/bar.feature", 3);
    const formatted = formatStepError(step, "string error");
    expect(formatted).toContain("Error: string error");
  });

  test("matches expected format", () => {
    const step = makeStep("When", 'I run "ai-guardrails init"', "tests/features/init.feature", 12);
    const formatted = formatStepError(step, new Error("Command exited with code 1"));
    const expected =
      '  tests/features/init.feature:12\n    When I run "ai-guardrails init"\n\n  Error: Command exited with code 1';
    expect(formatted).toBe(expected);
  });
});
