import type { ParsedStep } from "@/parser/models";
import { matchStep } from "@/registry/expression-adapter";
import { getRegistry } from "@/registry/step-registry";
import type { World } from "@/state/world";

export async function executeStep(world: World, step: ParsedStep): Promise<void> {
  const registry = getRegistry();
  const match = matchStep(registry.getAll(), step.text);
  await match.definition.callback(world, ...match.args);
}
