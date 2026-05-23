// after-hook-errors.test.ts
//
// Regression tests for §0.1 — After-hook silent swallow.
//
// Before the fix, a throwing After hook would either replace a successful
// scenario's outcome (turning green into red without context) or replace a
// step's error (masking the original failure). The fix collects After-hook
// errors and reports both step and hook failures.
//
// Each test runs in its own bun:test process via spawn so we can observe the
// real failure surface without the parent test runner short-circuiting.

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FEATS_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

async function runScenario(testSource: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const dir = await mkdtemp(join(tmpdir(), "feats-after-hook-"));
  const file = join(dir, "scenario.test.ts");
  await writeFile(file, testSource, "utf-8");

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
  return { exitCode: proc.exitCode ?? -1, stdout, stderr };
}

const PRELUDE = `
import { parseFeature } from "${FEATS_ROOT}/src/parser/adapter.ts";
import { clearRegistry, Given } from "${FEATS_ROOT}/src/registry/step-registry.ts";
import { runFeatures } from "${FEATS_ROOT}/src/runner/feature-runner.ts";
import { After, clearHooks } from "${FEATS_ROOT}/src/runner/hook-runner.ts";
clearRegistry();
clearHooks();
`;

describe("After-hook error handling (§0.1)", () => {
  test("step passes, single After hook throws → hook error surfaces", async () => {
    const source =
      PRELUDE +
      `
Given("a passing step", () => {});
After(() => { throw new Error("AFTER_HOOK_DIED"); });
const f = parseFeature(\`
Feature: F
  Scenario: S
    Given a passing step
\`, "f.feature");
runFeatures([f]);
`;
    const { exitCode, stdout, stderr } = await runScenario(source);
    const out = stdout + stderr;
    expect(out).toContain("AFTER_HOOK_DIED");
    expect(exitCode).not.toBe(0);
  });

  test("step fails AND After hook throws → both errors visible (AggregateError)", async () => {
    const source =
      PRELUDE +
      `
Given("a failing step", () => { throw new Error("STEP_FAILED"); });
After(() => { throw new Error("HOOK_ALSO_FAILED"); });
const f = parseFeature(\`
Feature: F
  Scenario: S
    Given a failing step
\`, "f.feature");
runFeatures([f]);
`;
    const { exitCode, stdout, stderr } = await runScenario(source);
    const out = stdout + stderr;
    expect(out).toContain("STEP_FAILED");
    expect(out).toContain("HOOK_ALSO_FAILED");
    expect(exitCode).not.toBe(0);
  });

  test("two After hooks both throw → both reported", async () => {
    const source =
      PRELUDE +
      `
Given("a passing step", () => {});
After(() => { throw new Error("HOOK_A_FAILED"); });
After(() => { throw new Error("HOOK_B_FAILED"); });
const f = parseFeature(\`
Feature: F
  Scenario: S
    Given a passing step
\`, "f.feature");
runFeatures([f]);
`;
    const { exitCode, stdout, stderr } = await runScenario(source);
    const out = stdout + stderr;
    expect(out).toContain("HOOK_A_FAILED");
    expect(out).toContain("HOOK_B_FAILED");
    expect(exitCode).not.toBe(0);
  });

  test("step fails, After hook succeeds → step error reported (regression guard)", async () => {
    const source =
      PRELUDE +
      `
let cleanup = false;
Given("a failing step", () => { throw new Error("STEP_ONLY_FAILED"); });
After(() => { cleanup = true; });
const f = parseFeature(\`
Feature: F
  Scenario: S
    Given a failing step
\`, "f.feature");
runFeatures([f]);
`;
    const { exitCode, stdout, stderr } = await runScenario(source);
    const out = stdout + stderr;
    expect(out).toContain("STEP_ONLY_FAILED");
    expect(out).not.toContain("HOOK_FAILED"); // no spurious hook error
    expect(exitCode).not.toBe(0);
  });

  test("step passes, all After hooks pass → green run (regression guard)", async () => {
    const source =
      PRELUDE +
      `
Given("a passing step", () => {});
After(() => {});
After(() => {});
const f = parseFeature(\`
Feature: F
  Scenario: S
    Given a passing step
\`, "f.feature");
runFeatures([f]);
`;
    const { exitCode } = await runScenario(source);
    expect(exitCode).toBe(0);
  });
});
