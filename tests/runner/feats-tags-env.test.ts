// feats-tags-env.test.ts
//
// FEATS_TAGS env var as default tagFilter when opts.tagFilter is unset.
// Spawned in a subprocess so we can control the env without leaking into
// the parent process.

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FEATS_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

async function runScenarioWithEnv(testSource: string, env: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "feats-tags-env-"));
  const file = join(dir, "scenario.test.ts");
  await writeFile(file, testSource, "utf-8");

  const proc = Bun.spawn(["bun", "test", file], {
    cwd: FEATS_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env, NO_COLOR: "1" },
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
import { clearHooks } from "${FEATS_ROOT}/src/runner/hook-runner.ts";
clearRegistry();
clearHooks();
`;

// Two scenarios — one @smoke, one @slow — so we can tell from the bun:test
// summary which subset ran.
const TWO_TAG_FEATURE_DEFAULT = `
Given("a smoke step", () => {});
Given("a slow step", () => {});
const f = parseFeature(\`
Feature: F
  @smoke
  Scenario: smoke
    Given a smoke step
  @slow
  Scenario: slow
    Given a slow step
\`, "f.feature");
runFeatures([f]);
`;

const TWO_TAG_FEATURE_OPTS_SLOW = `
Given("a smoke step", () => {});
Given("a slow step", () => {});
const f = parseFeature(\`
Feature: F
  @smoke
  Scenario: smoke
    Given a smoke step
  @slow
  Scenario: slow
    Given a slow step
\`, "f.feature");
runFeatures([f], { tagFilter: "@slow" });
`;

describe("FEATS_TAGS env var", () => {
  test("with FEATS_TAGS=@smoke, only the @smoke scenario runs", async () => {
    const source = PRELUDE + TWO_TAG_FEATURE_DEFAULT;
    const { stdout, stderr, exitCode } = await runScenarioWithEnv(source, {
      FEATS_TAGS: "@smoke",
    });
    expect(exitCode).toBe(0);
    const out = stdout + stderr;
    expect(out).toContain("1 pass");
    expect(out).toContain("1 skip");
  });

  test("with no env var, no filtering — both scenarios run", async () => {
    const source = PRELUDE + TWO_TAG_FEATURE_DEFAULT;
    const { stdout, stderr, exitCode } = await runScenarioWithEnv(source, {});
    expect(exitCode).toBe(0);
    const out = stdout + stderr;
    expect(out).toContain("2 pass");
    // No skips when no filter active.
    expect(out).not.toMatch(/[12] skip/);
  });

  test("with FEATS_TAGS='not @slow', skips the @slow scenario", async () => {
    const source = PRELUDE + TWO_TAG_FEATURE_DEFAULT;
    const { stdout, stderr, exitCode } = await runScenarioWithEnv(source, {
      FEATS_TAGS: "not @slow",
    });
    expect(exitCode).toBe(0);
    const out = stdout + stderr;
    expect(out).toContain("1 pass");
    expect(out).toContain("1 skip");
  });

  test("opts.tagFilter overrides FEATS_TAGS", async () => {
    // opts says @slow; env says @smoke. opts must win → @slow runs, @smoke skips.
    const source = PRELUDE + TWO_TAG_FEATURE_OPTS_SLOW;
    const { stdout, stderr, exitCode } = await runScenarioWithEnv(source, {
      FEATS_TAGS: "@smoke",
    });
    expect(exitCode).toBe(0);
    const out = stdout + stderr;
    expect(out).toContain("1 pass");
    expect(out).toContain("1 skip");
  });
});
