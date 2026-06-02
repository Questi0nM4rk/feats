// Assertions
export { assertConfig } from "./assertions/config-assertions";
export { assertOutput } from "./assertions/output-assertions";

// CLI execution
export type { CLIResult } from "./cli/cli-result";
export { runCli } from "./cli/cli-runner";
// CLI entry — re-exported so bin/feats shares the same bundle as the
// runtime API. Bundling the CLI as a separate entry would give it its
// own copy of the step registry; user step files imported at runtime
// register into THIS bundle's registry, so the CLI must live here.
export { runFeatsCli } from "./cli/feats-cli";
// Fixtures
export { composeFixtures, setupFixture } from "./fixtures/fixture-manager";
export type { FixtureProject } from "./fixtures/fixture-project";
// Feature loading + running
export { loadFeatures, parseFeature } from "./parser/adapter";
export type { DataTable, Feature, ParsedStep, RuleInfo, Scenario, Tag } from "./parser/models";
// Type guards for the trailing args step callbacks receive
export { isDataTable, isDocString } from "./parser/models";
// Random
export type { SeededRng } from "./random/seeded-rng";
export { createRng } from "./random/seeded-rng";
// Step definitions
export { clearParameterTypeRegistry, defineParameterType } from "./registry/parameter-types";
export { clearRegistry, Given, Step, Then, When } from "./registry/step-registry";
// Reporter contract + built-in reporters (Phase 2a)
export type {
  FeatsReporter,
  FeatureResult,
  RunSummary,
  ScenarioResult,
  StepResult,
  StepStatus,
} from "./reporting/reporter";
export type { CucumberJsonReporterOpts } from "./reporting/reporters/cucumber-json";
export { CucumberJsonReporter } from "./reporting/reporters/cucumber-json";
export type { JUnitReporterOpts } from "./reporting/reporters/junit";
export { JUnitReporter } from "./reporting/reporters/junit";
export type { PrettyReporterOpts } from "./reporting/reporters/pretty";
export { PrettyReporter } from "./reporting/reporters/pretty";
// Bun:test-free runner (Phase 2c) — used by the `feats` CLI and exported
// for programmatic CLI-style invocation from tests or custom drivers.
export type { CoreRunOptions, CoreRunResult } from "./runner/core-runner";
export { runCore } from "./runner/core-runner";
export type { RunOptions } from "./runner/feature-runner";
export { runFeatures } from "./runner/feature-runner";
// Lifecycle hooks
export { After, AfterAll, Before, BeforeAll, clearHooks } from "./runner/hook-runner";
// Pending step (Phase 2b)
export { PendingError, pending } from "./runner/pending";
// Test-isolation helper that clears registry + hooks + parameter types
export { resetFeats } from "./state/reset";

// Types
export type { World, WorldFactory } from "./state/world";
