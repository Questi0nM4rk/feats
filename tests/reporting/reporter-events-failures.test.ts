// tests/reporting/reporter-events-failures.test.ts
//
// Reporter contract tests for failure-mode scenarios. These are spawned in
// subprocesses because the inner scenarios are designed to fail — if run
// in-process, they'd pollute the parent's bun:test output with expected
// failures that aren't really failures.
//
// Each test writes a recording reporter that prints captured events as
// JSON to stdout, then the parent parses + asserts.

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FEATS_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

async function runWithRecordingReporter(scenarioBody: string): Promise<{
  exitCode: number;
  events: { type: string; payload: unknown }[];
  stderr: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "feats-reporter-fail-"));
  const file = join(dir, "scenario.test.ts");

  // Random sentinel so it doesn't collide with anything in bun:test's
  // source-code preview output (which DOES contain whatever literal
  // markers we put in the test source).
  const tag = Math.random().toString(36).slice(2, 14);

  // The sentinel string parts are assembled at runtime — the full literal
  // never appears in the source, so bun:test's error-printing code can't
  // accidentally yield it.
  const source = `
import { parseFeature } from "${FEATS_ROOT}/src/parser/adapter.ts";
import { clearRegistry, Given, When, Then } from "${FEATS_ROOT}/src/registry/step-registry.ts";
import { runFeatures } from "${FEATS_ROOT}/src/runner/feature-runner.ts";
import { clearHooks } from "${FEATS_ROOT}/src/runner/hook-runner.ts";
import type { FeatsReporter } from "${FEATS_ROOT}/src/reporting/reporter.ts";

clearRegistry();
clearHooks();

const __TAG__ = ${JSON.stringify(tag)};
const events: { type: string; payload: unknown }[] = [];
const reporter: FeatsReporter = {
  onStep: (result) => {
    events.push({
      type: "onStep",
      payload: {
        text: result.step.text,
        status: result.status,
        hasError: result.error !== undefined,
        errorMessage: result.error instanceof Error ? result.error.message : null,
      },
    });
  },
  onScenarioEnd: (result) => {
    events.push({
      type: "onScenarioEnd",
      payload: { status: result.status, steps: result.steps.length },
    });
  },
  onRunEnd: (summary) => {
    events.push({
      type: "onRunEnd",
      payload: {
        passed: summary.passed,
        failed: summary.failed,
        undefinedSteps: summary.undefinedSteps,
      },
    });
    // Sentinel pieces assembled at runtime so the literal full sentinel
    // never appears in this source (bun:test's source-preview output
    // would otherwise leak it past the regex).
    const head = "[FEATS" + "_EV_START_" + __TAG__ + "]";
    const tail = "[FEATS" + "_EV_END_" + __TAG__ + "]";
    process.stderr.write("\\n" + head + JSON.stringify(events) + tail + "\\n");
  },
};

${scenarioBody}
`;
  await writeFile(file, source, "utf-8");

  const proc = Bun.spawn(["bun", "test", file], {
    cwd: FEATS_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  const combined = stdout + stderr;

  const headRe = new RegExp(`\\[FEATS_EV_START_${tag}\\]([\\s\\S]+?)\\[FEATS_EV_END_${tag}\\]`);
  const match = combined.match(headRe);
  let events: { type: string; payload: unknown }[] = [];
  if (match?.[1] !== undefined) {
    try {
      events = JSON.parse(match[1]) as { type: string; payload: unknown }[];
    } catch (parseErr) {
      throw new Error(
        `Failed to parse events JSON. Captured: ${match[1].slice(0, 200)}...\nParse error: ${String(parseErr)}\n\n--- full stderr ---\n${stderr}`,
      );
    }
  } else {
    throw new Error(
      `No sentinel found in subprocess output (tag=${tag}).\n--- stdout ---\n${stdout.slice(0, 1500)}\n--- stderr ---\n${stderr.slice(0, 1500)}`,
    );
  }

  return { exitCode: proc.exitCode ?? -1, events, stderr };
}

describe("reporter events — failing scenario", () => {
  test("step fails → onStep statuses are passed, failed, skipped", async () => {
    const { events, exitCode } = await runWithRecordingReporter(`
Given("a passing step", () => {});
When("I do a failing thing", () => { throw new Error("BOOM"); });
Then("it never runs", () => {});
const f = parseFeature(\`
Feature: F
  Scenario: failure path
    Given a passing step
    When I do a failing thing
    Then it never runs
\`, "f.feature");
runFeatures([f], { reporters: [reporter] });
`);
    expect(events.length).toBeGreaterThan(0);
    const stepEvents = events.filter((e) => e.type === "onStep");
    const statuses = stepEvents.map((e) => (e.payload as { status: string }).status);
    expect(statuses).toEqual(["passed", "failed", "skipped"]);
    // Inner bun:test test was expected to fail.
    expect(exitCode).not.toBe(0);
  });

  test("scenario aggregates to failed status", async () => {
    const { events } = await runWithRecordingReporter(`
Given("a failing step", () => { throw new Error("BOOM"); });
const f = parseFeature(\`
Feature: F
  Scenario: failure
    Given a failing step
\`, "f.feature");
runFeatures([f], { reporters: [reporter] });
`);
    const scenEnd = events.find((e) => e.type === "onScenarioEnd");
    expect((scenEnd?.payload as { status: string }).status).toBe("failed");
  });

  test("run summary counts 1 failed", async () => {
    const { events } = await runWithRecordingReporter(`
Given("a failing step", () => { throw new Error("BOOM"); });
const f = parseFeature(\`
Feature: F
  Scenario: failure
    Given a failing step
\`, "f.feature");
runFeatures([f], { reporters: [reporter] });
`);
    const runEnd = events.find((e) => e.type === "onRunEnd");
    expect((runEnd?.payload as { passed: number; failed: number }).failed).toBe(1);
  });
});

describe("reporter events — undefined step", () => {
  test("onStep status is 'undefined' when no step definition matches", async () => {
    const { events } = await runWithRecordingReporter(`
// No step definitions registered.
const f = parseFeature(\`
Feature: F
  Scenario: undefined
    Given there is no definition
\`, "f.feature");
runFeatures([f], { reporters: [reporter] });
`);
    const stepEvent = events.find((e) => e.type === "onStep");
    expect((stepEvent?.payload as { status: string }).status).toBe("undefined");
  });

  test("scenario aggregates to undefined status", async () => {
    const { events } = await runWithRecordingReporter(`
const f = parseFeature(\`
Feature: F
  Scenario: undefined
    Given there is no definition
\`, "f.feature");
runFeatures([f], { reporters: [reporter] });
`);
    const scenEnd = events.find((e) => e.type === "onScenarioEnd");
    expect((scenEnd?.payload as { status: string }).status).toBe("undefined");
  });

  test("summary counts 1 undefined step", async () => {
    const { events } = await runWithRecordingReporter(`
const f = parseFeature(\`
Feature: F
  Scenario: undefined
    Given there is no definition
\`, "f.feature");
runFeatures([f], { reporters: [reporter] });
`);
    const runEnd = events.find((e) => e.type === "onRunEnd");
    expect((runEnd?.payload as { undefinedSteps: number }).undefinedSteps).toBe(1);
  });
});

describe("reporter contract — reporters see the raw step error", () => {
  test("StepResult.error carries the original throw, not the formatStepError wrap", async () => {
    const { events } = await runWithRecordingReporter(`
Given("a step that throws", () => { throw new Error("RAW_ERROR_FROM_STEP"); });
const f = parseFeature(\`
Feature: Raw error
  Scenario: only
    Given a step that throws
\`, "f.feature");
runFeatures([f], { reporters: [reporter] });
`);
    const stepEvent = events.find(
      (e) => e.type === "onStep" && (e.payload as { hasError: boolean }).hasError,
    );
    expect(stepEvent).toBeDefined();
    // The recording reporter pulls error.message directly from the
    // received error. formatStepError would have prefixed with "uri:line\n  Keyword text\n\n  Error: ".
    // We expect the raw message, no prefix.
    const msg = (stepEvent?.payload as { errorMessage: string }).errorMessage;
    expect(msg).toBe("RAW_ERROR_FROM_STEP");
  });
});
