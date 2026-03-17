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
  test("generates Given snippet", () => {
    const step = makeStep("Given", "a typescript fixture project");
    const snippet = generateStepSnippet(step);
    expect(snippet).toBe(
      `Given("a typescript fixture project", async (world) => {\n  // TODO: implement\n  throw new Error("Not implemented");\n});`,
    );
  });

  test("generates When snippet", () => {
    const step = makeStep("When", 'I run "ai-guardrails init"');
    const snippet = generateStepSnippet(step);
    expect(snippet).toStartWith('When("I run \\"ai-guardrails init\\"",');
  });

  test("generates Then snippet", () => {
    const step = makeStep("Then", "the output should contain success");
    const snippet = generateStepSnippet(step);
    expect(snippet).toStartWith('Then("the output should contain success",');
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
});
