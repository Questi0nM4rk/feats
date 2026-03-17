import type { ParsedStep } from "@/parser/models";

type StepKeyword = "Given" | "When" | "Then";

function resolveKeyword(step: ParsedStep): StepKeyword {
  if (step.keyword === "And" || step.keyword === "But") {
    return "Given";
  }
  return step.keyword;
}

export function generateStepSnippet(step: ParsedStep): string {
  const keyword = resolveKeyword(step);
  const escapedText = step.text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${keyword}("${escapedText}", async (world) => {\n  // TODO: implement\n  throw new Error("Not implemented");\n});`;
}
