import type { ParsedStep } from "@/parser/models";
import { matchStep } from "@/registry/expression-adapter";
import { getRegistry } from "@/registry/step-registry";
import type { World } from "@/state/world";

export async function executeStep(world: World, step: ParsedStep): Promise<void> {
  const definitions = [...getRegistry().getAll()];
  const match = matchStep(definitions, step.text);
  const extraArgs: unknown[] = [];
  if (step.docString !== undefined) extraArgs.push(step.docString);
  if (step.dataTable !== undefined) extraArgs.push(step.dataTable);
  await match.definition.callback(world, ...match.args, ...extraArgs);
}
