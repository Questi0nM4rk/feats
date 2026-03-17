import { CucumberExpression } from "@cucumber/cucumber-expressions";
import { getParameterTypeRegistry } from "@/registry/parameter-types";
import type { StepDefinition } from "@/registry/step-definition";

export interface MatchResult {
  readonly definition: StepDefinition;
  readonly args: readonly unknown[];
}

export function matchStep(definitions: readonly StepDefinition[], stepText: string): MatchResult {
  const registry = getParameterTypeRegistry();
  const matches: MatchResult[] = [];

  for (const definition of definitions) {
    const expr = new CucumberExpression(definition.pattern, registry);
    const result = expr.match(stepText);
    if (result !== null) {
      const args = result.map((arg) => arg.getValue(null));
      matches.push({ definition, args });
    }
  }

  if (matches.length === 0) {
    throw new Error(`Undefined step: "${stepText}"`);
  }

  if (matches.length > 1) {
    const patterns = matches.map((m) => `"${m.definition.pattern}"`).join(", ");
    throw new Error(`Ambiguous step "${stepText}" matches: ${patterns}`);
  }

  const match = matches[0];
  if (match === undefined) {
    throw new Error(`Undefined step: "${stepText}"`);
  }
  return match;
}
