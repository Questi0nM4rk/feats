import { describe, expect, test } from "bun:test";
import type { ParsedStep } from "@/parser/models";
import { generateStepSnippet } from "@/reporting/pending-steps";

function makeStep(keyword: ParsedStep["keyword"], text: string): ParsedStep {
  return {
    keyword,
    text,
    dataTable: undefined,
    docString: undefined,
    location: { uri: "tests/features/example.feature", line: 5 },
  };
}

describe("generateStepSnippet", () => {
  test("generates Given snippet with no params", () => {
    const step = makeStep("Given", "a typescript fixture project");
    const snippet = generateStepSnippet(step);
    expect(snippet).toBe(
      `Given("a typescript fixture project", async (world) => {\n  // TODO: implement\n  throw new Error("Not implemented");\n});`,
    );
  });

  test("substitutes quoted-string literal with {string} and adds an arg", () => {
    const step = makeStep("When", 'I run "ai-guardrails init"');
    const snippet = generateStepSnippet(step);
    expect(snippet).toStartWith('When("I run {string}", async (world, arg1)');
  });

  test("plain text without substitutable tokens is unchanged", () => {
    const step = makeStep("Then", "the output should contain success");
    const snippet = generateStepSnippet(step);
    expect(snippet).toStartWith('Then("the output should contain success", async (world) =>');
  });

  test("And keyword resolves to Step (neutral)", () => {
    const step = makeStep("And", "another precondition");
    const snippet = generateStepSnippet(step);
    expect(snippet).toStartWith('Step("another precondition",');
  });

  test("But keyword resolves to Step (neutral)", () => {
    const step = makeStep("But", "not this case");
    const snippet = generateStepSnippet(step);
    expect(snippet).toStartWith('Step("not this case",');
  });

  test("snippet contains TODO comment and throw", () => {
    const step = makeStep("Then", "something happens");
    const snippet = generateStepSnippet(step);
    expect(snippet).toContain("// TODO: implement");
    expect(snippet).toContain('throw new Error("Not implemented")');
  });

  test("substitutes bare integer with {int}", () => {
    const step = makeStep("Then", "the cart should have 3 items");
    const snippet = generateStepSnippet(step);
    expect(snippet).toStartWith('Then("the cart should have {int} items", async (world, arg1)');
  });

  test("substitutes bare decimal with {float}", () => {
    const step = makeStep("Then", "the total should be 9.99");
    const snippet = generateStepSnippet(step);
    expect(snippet).toStartWith('Then("the total should be {float}", async (world, arg1)');
  });

  test("substitutes multiple tokens of different types in one step", () => {
    const step = makeStep("When", 'I add "Widget" 3 times for 9.99');
    const snippet = generateStepSnippet(step);
    expect(snippet).toStartWith(
      'When("I add {string} {int} times for {float}", async (world, arg1, arg2, arg3)',
    );
  });

  test("escapes backslashes from non-substituted text", () => {
    const step = makeStep("Given", "a path with a \\ in it");
    const snippet = generateStepSnippet(step);
    expect(snippet).toContain('"a path with a \\\\ in it"');
  });

  test("handles negative integers and floats", () => {
    const step = makeStep("Given", "a delta of -5 and offset -3.14");
    const snippet = generateStepSnippet(step);
    expect(snippet).toContain('"a delta of {int} and offset {float}"');
  });

  test("floats are matched before ints (3.14 → {float}, not {int}.{int})", () => {
    const step = makeStep("Given", "value 3.14");
    const snippet = generateStepSnippet(step);
    expect(snippet).toContain('"value {float}"');
    expect(snippet).not.toContain("{int}.{int}");
  });

  test("empty quoted string still becomes {string}", () => {
    const step = makeStep("Given", 'an empty string ""');
    const snippet = generateStepSnippet(step);
    expect(snippet).toContain('"an empty string {string}"');
  });

  test("digits glued to letters are NOT substituted (word-boundary guard)", () => {
    // Without word boundaries, "has3items" would become "has{int}items".
    // TOKEN_PATTERN's (?<!\w)...(?!\w) guards keep the embedded digits as
    // literal text.
    const step = makeStep("Given", "user has3items in cart");
    const snippet = generateStepSnippet(step);
    expect(snippet).toContain('"user has3items in cart"');
    expect(snippet).not.toContain("{int}");
  });

  test("digits glued to letters via hyphen are NOT substituted", () => {
    // Same rule applies for hyphen-glued numbers: `abc-5def` keeps the `-5`.
    const step = makeStep("Given", "build abc-5def succeeds");
    const snippet = generateStepSnippet(step);
    expect(snippet).toContain('"build abc-5def succeeds"');
  });

  test("standalone numbers around word-glued digits still substitute", () => {
    // The guard is per-token: 3 between spaces matches, embedded ones don't.
    const step = makeStep("Given", "user has3items and 5 carts");
    const snippet = generateStepSnippet(step);
    expect(snippet).toContain('"user has3items and {int} carts"');
  });
});
