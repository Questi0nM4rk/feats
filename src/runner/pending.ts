// src/runner/pending.ts
//
// Pending step support. A step callback that calls `pending(reason?)` marks
// the step (and its scenario) as pending — distinct from passed, failed,
// or skipped. Subsequent steps in the scenario render as skipped.
//
// In bun:test mode, pending scenarios do NOT throw to bun:test — they
// pass at the test() level so the suite stays green. Reporters see
// status="pending" and the run summary counts them separately.
//
// This matches cucumber-js's non-strict default. A future `strict: true`
// option (Phase 3) could promote pending → failed if desired.

const PENDING_BRAND = Symbol.for("@questi0nm4rk/feats/PendingError");

export class PendingError extends Error {
  // Branded so cross-realm instanceof checks still work (e.g. when feats
  // is `bun link`ed into a sibling project — instanceof can lie there).
  readonly [PENDING_BRAND] = true as const;

  constructor(reason?: string) {
    super(reason ?? "Step pending");
    this.name = "PendingError";
  }
}

export function isPendingError(err: unknown): err is PendingError {
  if (err instanceof PendingError) return true;
  if (err === null || typeof err !== "object") return false;
  return (err as { [PENDING_BRAND]?: unknown })[PENDING_BRAND] === true;
}

/**
 * Mark the current step as pending. Subsequent steps in the same scenario
 * render as skipped. The scenario passes at the bun:test level; reporters
 * see status="pending" and the run summary counts it under `pending`.
 *
 * ```ts
 * Given("the cart has many items", () => {
 *   pending("checkout flow not yet implemented");
 * });
 * ```
 */
export function pending(reason?: string): never {
  throw new PendingError(reason);
}
