import { expect } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Feature, FixtureProject } from "@/feats";
import { createFixtureProject } from "@/fixtures/fixture-project";
import { parseFeature } from "@/parser/adapter";
import { matchStep } from "@/registry/expression-adapter";
import { Given, StepRegistry, Then, When } from "@/registry/step-registry";

interface SelfTestWorld {
  featureSource?: string;
  parsedFeature?: Feature;
  stepRegistry?: StepRegistry;
  stepPattern?: string;
  matchText?: string;
  matchArg?: unknown;
  fixtureTmpDir?: string;
  fixtureFileName?: string;
  fixtureProject?: FixtureProject;
  [key: string]: unknown;
}

// --- Scenario: Parse a feature file ---

Given("a feature source:", (world: SelfTestWorld, docString: unknown) => {
  world.featureSource = typeof docString === "string" ? docString : String(docString);
});

When("I parse the feature", (world: SelfTestWorld) => {
  const source = world.featureSource;
  if (source === undefined) throw new Error("featureSource not set");
  world.parsedFeature = parseFeature(source, "inline.feature");
});

Then("the feature name should be {string}", (world: SelfTestWorld, name: unknown) => {
  if (typeof name !== "string") throw new Error(`Expected string name, got ${typeof name}`);
  expect(world.parsedFeature?.name).toBe(name);
});

Then("there should be {int} scenario", (world: SelfTestWorld, count: unknown) => {
  if (typeof count !== "number") throw new Error(`Expected number count, got ${typeof count}`);
  expect(world.parsedFeature?.scenarios.length).toBe(count);
});

// --- Scenario: Register and match steps ---

Given("a step pattern {string}", (world: SelfTestWorld, pattern: unknown) => {
  const p = typeof pattern === "string" ? pattern : String(pattern);
  world.stepPattern = p;
  const registry = new StepRegistry();
  registry.add({ keyword: "Given", pattern: p, callback: () => {} });
  world.stepRegistry = registry;
});

When("I match against {string}", (world: SelfTestWorld, text: unknown) => {
  const matchText = typeof text === "string" ? text : String(text);
  const registry = world.stepRegistry;
  if (registry === undefined) throw new Error("stepRegistry not set");
  const result = matchStep(registry.getAll(), matchText);
  world.matchArg = result.args[0];
});

Then("the match should succeed with argument {int}", (world: SelfTestWorld, expected: unknown) => {
  if (typeof expected !== "number") {
    throw new Error(`Expected number, got ${typeof expected}`);
  }
  expect(world.matchArg).toBe(expected);
});

// --- Scenario: Setup fixture project ---

Given(
  "a fixture directory with a {string} file",
  async (world: SelfTestWorld, fileName: unknown) => {
    const name = typeof fileName === "string" ? fileName : String(fileName);
    world.fixtureFileName = name;
    const tmpDir = await mkdtemp(join(tmpdir(), "feats-self-test-"));
    await writeFile(join(tmpDir, name), JSON.stringify({ created: true }), "utf-8");
    world.fixtureTmpDir = tmpDir;
  },
);

When("I setup the fixture", (world: SelfTestWorld) => {
  const dir = world.fixtureTmpDir;
  if (dir === undefined) throw new Error("fixtureTmpDir not set");
  world.fixtureProject = createFixtureProject(dir);
});

Then("the fixture project should have {string}", (world: SelfTestWorld, fileName: unknown) => {
  const name = typeof fileName === "string" ? fileName : String(fileName);
  expect(world.fixtureProject?.hasFile(name)).toBe(true);
});

Then("cleanup should remove the temp directory", async (world: SelfTestWorld) => {
  const project = world.fixtureProject;
  if (project === undefined) throw new Error("fixtureProject not set");
  const dir = project.dir;
  await project.cleanup();
  const { existsSync } = await import("node:fs");
  expect(existsSync(dir)).toBe(false);
});
