// src/reporting/reporter.ts
//
// Reporter contract for Phase 2. Reporters receive a stream of typed events
// emitted by runFeatures during scenario execution. They see the RAW step
// and original error — not the formatStepError-wrapped Error that
// bun:test's default rendering uses.
//
// All callbacks may be async; runFeatures awaits each in registration order.
//
// "Run" semantics (per Phase 2 decision D7):
//   - bun:test mode: one onRunStart / onRunEnd per `runFeatures()` call.
//     If multiple files call runFeatures in one `bun test` invocation,
//     each file's call emits its own run events.
//   - CLI mode (Phase 2c): one onRunStart / onRunEnd for the whole suite.
//
// Filtered scenarios (excluded by tagFilter) emit NO events — matches the
// behavior of cucumber-js and SpecFlow. Reporters that want to display
// "skipped by filter" lines can inspect feature.scenarios separately.

import type { Feature, ParsedStep, Scenario } from "@/parser/models";

export type StepStatus = "passed" | "failed" | "skipped" | "pending" | "undefined";

/** One step's execution outcome. */
export interface StepResult {
  readonly step: ParsedStep;
  readonly status: StepStatus;
  readonly durationMs: number;
  /** The original thrown value, when status === "failed" / "undefined". */
  readonly error?: unknown;
}

/** One scenario's aggregate outcome. status is the worst step status; if any
 *  hook threw, error contains the AggregateError or single hook error. */
export interface ScenarioResult {
  readonly scenario: Scenario;
  readonly feature: Feature;
  readonly status: StepStatus;
  readonly steps: readonly StepResult[];
  readonly durationMs: number;
  readonly error?: unknown;
}

/** One feature's aggregate. scenarios are in source order, only those that
 *  actually ran (filtered scenarios excluded). */
export interface FeatureResult {
  readonly feature: Feature;
  readonly scenarios: readonly ScenarioResult[];
  readonly durationMs: number;
}

/** Final tallies for the run. */
export interface RunSummary {
  readonly features: number;
  readonly scenarios: number;
  readonly passed: number;
  readonly failed: number;
  readonly pending: number;
  readonly skipped: number;
  readonly undefinedSteps: number;
  readonly durationMs: number;
}

/**
 * A reporter consumes events emitted by runFeatures. Every method is
 * optional; reporters implement only what they need.
 *
 * Multiple reporters can be active simultaneously. They're invoked in the
 * order they appear in `opts.reporters` (or `FEATS_REPORTERS`).
 */
export interface FeatsReporter {
  onRunStart?(features: readonly Feature[]): Promise<void> | void;
  onFeatureStart?(feature: Feature): Promise<void> | void;
  onScenarioStart?(scenario: Scenario, feature: Feature): Promise<void> | void;
  onStep?(result: StepResult): Promise<void> | void;
  onScenarioEnd?(result: ScenarioResult): Promise<void> | void;
  onFeatureEnd?(result: FeatureResult): Promise<void> | void;
  onRunEnd?(summary: RunSummary): Promise<void> | void;
}
