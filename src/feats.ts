// Assertions
export { assertConfig } from "./assertions/config-assertions";
export { assertOutput } from "./assertions/output-assertions";

// CLI execution
export type { CLIResult } from "./cli/cli-result";
export { runCli } from "./cli/cli-runner";

// Fixtures
export { composeFixtures, setupFixture } from "./fixtures/fixture-manager";
export type { FixtureProject } from "./fixtures/fixture-project";

// Feature loading + running
export { loadFeatures, parseFeature } from "./parser/adapter";
export type { DataTable, Feature, ParsedStep, Scenario, Tag } from "./parser/models";
// Type guards for the trailing args step callbacks receive
export { isDataTable, isDocString } from "./parser/models";

// Random
export type { SeededRng } from "./random/seeded-rng";
export { createRng } from "./random/seeded-rng";

// Step definitions
export { clearParameterTypeRegistry, defineParameterType } from "./registry/parameter-types";
export { clearRegistry, Given, Step, Then, When } from "./registry/step-registry";
export type { RunOptions } from "./runner/feature-runner";
export { runFeatures } from "./runner/feature-runner";
// Lifecycle hooks
export { After, Before, clearHooks } from "./runner/hook-runner";

// Test-isolation helper that clears registry + hooks + parameter types
export { resetFeats } from "./state/reset";

// Types
export type { World, WorldFactory } from "./state/world";
