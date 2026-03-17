import type { StepCallback, StepDefinition } from "@/registry/step-definition";
import type { World } from "@/state/world";

export class StepRegistry {
  private readonly definitions: StepDefinition[] = [];

  add(definition: StepDefinition): void {
    this.definitions.push(definition);
  }

  getAll(): readonly StepDefinition[] {
    return this.definitions;
  }

  clear(): void {
    this.definitions.length = 0;
  }
}

let sharedRegistry: StepRegistry | undefined;

export function getRegistry(): StepRegistry {
  if (sharedRegistry === undefined) {
    sharedRegistry = new StepRegistry();
  }
  return sharedRegistry;
}

export function clearRegistry(): void {
  getRegistry().clear();
}

export function Given<W extends World = World>(pattern: string, callback: StepCallback<W>): void {
  getRegistry().add({
    keyword: "Given",
    pattern,
    callback: callback as StepCallback,
  });
}

export function When<W extends World = World>(pattern: string, callback: StepCallback<W>): void {
  getRegistry().add({
    keyword: "When",
    pattern,
    callback: callback as StepCallback,
  });
}

export function Then<W extends World = World>(pattern: string, callback: StepCallback<W>): void {
  getRegistry().add({
    keyword: "Then",
    pattern,
    callback: callback as StepCallback,
  });
}

export function Step<W extends World = World>(pattern: string, callback: StepCallback<W>): void {
  getRegistry().add({
    keyword: "Step",
    pattern,
    callback: callback as StepCallback,
  });
}
