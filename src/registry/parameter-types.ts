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
  // ParameterType positional args (from @cucumber/cucumber-expressions):
  //   (name, regexp, type, transformer, useForSnippets, preferForRegexpMatch)
  // useForSnippets=true       → snippet generator may suggest this type for matching steps
  // preferForRegexpMatch=false → does not override built-in types ({string}, {int}, ...)
  const paramType = new ParameterType(opts.name, opts.regexp, null, opts.transformer, true, false);
  registry.defineParameterType(paramType);
}
