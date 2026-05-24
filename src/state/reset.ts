import { clearParameterTypeRegistry } from "@/registry/parameter-types";
import { clearRegistry } from "@/registry/step-registry";
import { clearHooks } from "@/runner/hook-runner";

/**
 * Reset all module-level state held by `@questi0nm4rk/feats`:
 *   - step definition registry
 *   - Before / After hook registry
 *   - custom parameter-type registry
 *
 * Use this between test files (e.g. via `beforeEach(resetFeats)`) when you
 * want each file's step modules to register a fresh set of steps without
 * leaking from previous imports.
 *
 * The runner snapshots the registry at `runFeatures()` call time, so this is
 * specifically for test-suite hygiene — not a per-scenario isolation tool.
 */
export function resetFeats(): void {
  clearRegistry();
  clearHooks();
  clearParameterTypeRegistry();
}
