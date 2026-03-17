import { ParameterType, ParameterTypeRegistry } from "@cucumber/cucumber-expressions";

let sharedRegistry: ParameterTypeRegistry | undefined;

export function getParameterTypeRegistry(): ParameterTypeRegistry {
  if (sharedRegistry === undefined) {
    sharedRegistry = new ParameterTypeRegistry();
  }
  return sharedRegistry;
}

export function clearParameterTypeRegistry(): void {
  sharedRegistry = new ParameterTypeRegistry();
}

export function defineParameterType(opts: {
  name: string;
  regexp: RegExp;
  transformer: (value: string) => unknown;
}): void {
  const registry = getParameterTypeRegistry();
  const paramType = new ParameterType(opts.name, opts.regexp, null, opts.transformer, true, false);
  registry.defineParameterType(paramType);
}
