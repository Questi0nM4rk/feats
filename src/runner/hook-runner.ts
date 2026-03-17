import type { World } from "@/state/world";

export interface HookDefinition {
  readonly tagFilter: string | undefined;
  readonly callback: (world: World) => Promise<void> | void;
}

const beforeHooks: HookDefinition[] = [];
const afterHooks: HookDefinition[] = [];

export function Before(callback: (world: World) => Promise<void> | void): void;
export function Before(tagFilter: string, callback: (world: World) => Promise<void> | void): void;
export function Before(
  tagFilterOrCallback: string | ((world: World) => Promise<void> | void),
  callback?: (world: World) => Promise<void> | void,
): void {
  if (typeof tagFilterOrCallback === "string") {
    if (callback === undefined) {
      throw new Error(`Before("${tagFilterOrCallback}") called without a callback`);
    }
    beforeHooks.push({ tagFilter: tagFilterOrCallback, callback });
  } else {
    beforeHooks.push({ tagFilter: undefined, callback: tagFilterOrCallback });
  }
}

export function After(callback: (world: World) => Promise<void> | void): void;
export function After(tagFilter: string, callback: (world: World) => Promise<void> | void): void;
export function After(
  tagFilterOrCallback: string | ((world: World) => Promise<void> | void),
  callback?: (world: World) => Promise<void> | void,
): void {
  if (typeof tagFilterOrCallback === "string") {
    if (callback === undefined) {
      throw new Error(`After("${tagFilterOrCallback}") called without a callback`);
    }
    afterHooks.push({ tagFilter: tagFilterOrCallback, callback });
  } else {
    afterHooks.push({ tagFilter: undefined, callback: tagFilterOrCallback });
  }
}

export function getBeforeHooks(): HookDefinition[] {
  return [...beforeHooks];
}

export function getAfterHooks(): HookDefinition[] {
  return [...afterHooks];
}

export function clearHooks(): void {
  beforeHooks.length = 0;
  afterHooks.length = 0;
}
