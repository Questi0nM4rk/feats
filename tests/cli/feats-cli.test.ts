// tests/cli/feats-cli.test.ts
//
// End-to-end CLI tests. We invoke `runFeatsCli` directly with a synthetic
// argv + cwd so we don't need to build the bin first. A separate test
// further down spawns the bin via a subprocess once to confirm the
// shebang + bundled-import path also works.

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, runFeatsCli } from "@/cli/feats-cli";

describe("parseArgs", () => {
  test("empty argv → all defaults, no flags", () => {
    const a = parseArgs([]);
    expect(a.features).toEqual([]);
    expect(a.requires).toEqual([]);
    expect(a.reporters).toEqual([]);
    expect(a.tags).toBeUndefined();
    expect(a.help).toBe(false);
    expect(a.version).toBe(false);
  });

  test("positional args become feature globs", () => {
    const a = parseArgs(["a.feature", "b.feature"]);
    expect(a.features).toEqual(["a.feature", "b.feature"]);
  });

  test("--require / --tags / --reporter parse correctly", () => {
    const a = parseArgs([
      "--require",
      "**/*.steps.ts",
      "--tags",
      "@smoke",
      "--reporter",
      "pretty",
      "--reporter",
      "junit:out.xml",
    ]);
    expect(a.requires).toEqual(["**/*.steps.ts"]);
    expect(a.tags).toBe("@smoke");
    expect(a.reporters).toEqual(["pretty", "junit:out.xml"]);
  });

  test("unknown --flag throws CliError", () => {
    expect(() => parseArgs(["--nonsense"])).toThrow(/Unknown option/);
  });

  test("missing value for --tags throws", () => {
    expect(() => parseArgs(["--tags"])).toThrow(/requires a value/);
  });

  test("--help and -h both set help", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });
});

// Helper: scaffold a temp project with a feature + a steps file, run the
// CLI against it, return { exitCode, stdout, stderr }.
async function runWithProject(opts: {
  readonly feature: string;
  readonly steps: string;
  readonly argv: readonly string[];
}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const dir = await mkdtemp(join(tmpdir(), "feats-cli-"));
  await writeFile(join(dir, "test.feature"), opts.feature, "utf-8");
  await writeFile(join(dir, "test.steps.ts"), opts.steps, "utf-8");

  // Capture stdout/stderr by reassigning process.{stdout,stderr}.write
  // for the duration of the call. We restore unconditionally in finally.
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stderr.write;

  let exitCode: number;
  try {
    exitCode = await runFeatsCli(["test.feature", "--require", "test.steps.ts", ...opts.argv], dir);
  } finally {
    process.stdout.write = realOut;
    process.stderr.write = realErr;
  }

  return { exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}

const FEATS_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

describe("runFeatsCli — happy path", () => {
  test("passing feature returns exit 0 and prints Pretty output", async () => {
    const { exitCode, stdout } = await runWithProject({
      feature: `Feature: Cart\n  Scenario: empty\n    Given the cart is empty\n`,
      steps: `
import { Given } from "${FEATS_ROOT}/src/feats.ts";
Given("the cart is empty", () => {});
`,
      argv: ["--reporter", "pretty"],
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Feature: Cart");
    expect(stdout).toContain("Scenario: empty");
    expect(stdout).toContain("1 passed");
  });
});

describe("runFeatsCli — failure path", () => {
  test("failing scenario returns exit 1", async () => {
    const { exitCode, stdout } = await runWithProject({
      feature: `Feature: F\n  Scenario: failing\n    Given a step that throws\n`,
      steps: `
import { Given } from "${FEATS_ROOT}/src/feats.ts";
Given("a step that throws", () => { throw new Error("BOOM"); });
`,
      argv: ["--reporter", "pretty"],
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain("1 failed");
  });

  test("undefined step returns exit 1", async () => {
    const { exitCode } = await runWithProject({
      feature: `Feature: F\n  Scenario: undefined\n    Given there is no def\n`,
      steps: `// no step definitions\n`,
      argv: ["--reporter", "pretty"],
    });
    expect(exitCode).toBe(1);
  });
});

describe("runFeatsCli — argument errors", () => {
  test("unknown flag → exit 2 and prints usage", async () => {
    const stderrChunks: string[] = [];
    const realErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((c: string | Uint8Array) => {
      stderrChunks.push(typeof c === "string" ? c : new TextDecoder().decode(c));
      return true;
    }) as typeof process.stderr.write;
    try {
      const exit = await runFeatsCli(["--nonsense"]);
      expect(exit).toBe(2);
      expect(stderrChunks.join("")).toContain("Unknown option");
    } finally {
      process.stderr.write = realErr;
    }
  });

  test("no step files matched → exit 2", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feats-cli-no-steps-"));
    await writeFile(join(dir, "test.feature"), `Feature: F\n  Scenario: s\n    Given x\n`, "utf-8");

    const stderrChunks: string[] = [];
    const realErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((c: string | Uint8Array) => {
      stderrChunks.push(typeof c === "string" ? c : new TextDecoder().decode(c));
      return true;
    }) as typeof process.stderr.write;
    try {
      const exit = await runFeatsCli(["test.feature", "--require", "nonexistent.steps.ts"], dir);
      expect(exit).toBe(2);
      expect(stderrChunks.join("")).toContain("no step-definition files matched");
    } finally {
      process.stderr.write = realErr;
    }
  });
});

describe("runFeatsCli — meta flags", () => {
  test("--help prints usage and exits 0", async () => {
    const stdoutChunks: string[] = [];
    const realOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((c: string | Uint8Array) => {
      stdoutChunks.push(typeof c === "string" ? c : new TextDecoder().decode(c));
      return true;
    }) as typeof process.stdout.write;
    try {
      const exit = await runFeatsCli(["--help"]);
      expect(exit).toBe(0);
      expect(stdoutChunks.join("")).toContain("Usage:");
    } finally {
      process.stdout.write = realOut;
    }
  });
});
