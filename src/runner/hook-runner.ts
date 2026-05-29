import type { World } from "@/state/world";

export interface HookDefinition {
  readonly tagFilter: string | undefined;
  readonly callback: (world: World) => Promise<void> | void;
}

// Lifecycle hook callbacks have no world argument — they run once per
// `runFeatures` call, before any scenario / after the last scenario.
export interface LifecycleHookDefinition {
  readonly callback: () => Promise<void> | void;
}

const beforeHooks: HookDefinition[] = [];
const afterHooks: HookDefinition[] = [];
const beforeAllHooks: LifecycleHookDefinition[] = [];
const afterAllHooks: LifecycleHookDefinition[] = [];

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

/**
 * Register a callback to run once per `runFeatures` call, before any
 * scenario runs. If it throws, the entire run aborts — bun:test surfaces
 * the error on the first feature describe and all scenarios fail.
 *
 * BeforeAll takes no tag filter (matches cucumber-js semantics) — use a
 * regular `Before(tagExpr, cb)` if you want per-scenario gating.
 */
export function BeforeAll(callback: () => Promise<void> | void): void {
  beforeAllHooks.push({ callback });
}

/**
 * Register a callback to run once per `runFeatures` call, after the last
 * scenario completes. Errors thrown by AfterAll hooks are collected and
 * surfaced together (matches the After hook's collect-don't-throw pattern)
 * so a teardown failure doesn't mask a step failure earlier in the run.
 */
export function AfterAll(callback: () => Promise<void> | void): void {
  afterAllHooks.push({ callback });
}

export function getBeforeHooks(): HookDefinition[] {
  return [...beforeHooks];
}

export function getAfterHooks(): HookDefinition[] {
  return [...afterHooks];
}

export function getBeforeAllHooks(): LifecycleHookDefinition[] {
  return [...beforeAllHooks];
}

export function getAfterAllHooks(): LifecycleHookDefinition[] {
  return [...afterAllHooks];
}

export function clearHooks(): void {
  beforeHooks.length = 0;
  afterHooks.length = 0;
  beforeAllHooks.length = 0;
  afterAllHooks.length = 0;
}
