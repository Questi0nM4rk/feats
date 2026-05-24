import { CucumberExpression } from "@cucumber/cucumber-expressions";
import type { ParsedStep } from "@/parser/models";
import { getParameterTypeRegistry } from "@/registry/parameter-types";
import type { StepDefinition } from "@/registry/step-definition";
import { generateStepSnippet } from "@/reporting/pending-steps";

export interface MatchResult {
  readonly definition: StepDefinition;
  readonly args: readonly unknown[];
}

export function matchStep(definitions: readonly StepDefinition[], step: ParsedStep): MatchResult {
  const registry = getParameterTypeRegistry();
  const matches: MatchResult[] = [];

  for (const definition of definitions) {
    const expr = new CucumberExpression(definition.pattern, registry);
    const result = expr.match(step.text);
    if (result !== null) {
      const args = result.map((arg) => arg.getValue(null));
      matches.push({ definition, args });
    }
  }

  const loc = `${step.location.uri}:${step.location.line}`;

  if (matches.length === 0) {
    const snippet = generateStepSnippet(step);
    throw new Error(
      `Undefined step at ${loc}: "${step.text}"\n\nAdd a step definition:\n\n${snippet}`,
    );
  }

  if (matches.length > 1) {
    const patterns = matches.map((m) => `"${m.definition.pattern}"`).join(", ");
    throw new Error(`Ambiguous step at ${loc}: "${step.text}" matches: ${patterns}`);
  }

  // matches.length === 1 guaranteed by the checks above
  return matches[0] as MatchResult;
}
