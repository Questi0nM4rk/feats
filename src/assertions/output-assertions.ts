import type { CLIResult } from "@/cli/cli-result";

export interface OutputExpectations {
  readonly stdout?: string | RegExp;
  readonly stderr?: string | RegExp;
  readonly exitCode?: number;
  readonly contains?: string;
  readonly notContains?: string;
}

function matchesExpectation(actual: string, expected: string | RegExp): boolean {
  if (typeof expected === "string") {
    return actual.includes(expected);
  }
  return expected.test(actual);
}

export function assertOutput(result: CLIResult, expectations: OutputExpectations): void {
  if (expectations.stdout !== undefined) {
    if (!matchesExpectation(result.stdout, expectations.stdout)) {
      throw new Error(
        `stdout assertion failed: expected ${JSON.stringify(expectations.stdout)}, got ${JSON.stringify(result.stdout)}`,
      );
    }
  }

  if (expectations.stderr !== undefined) {
    if (!matchesExpectation(result.stderr, expectations.stderr)) {
      throw new Error(
        `stderr assertion failed: expected ${JSON.stringify(expectations.stderr)}, got ${JSON.stringify(result.stderr)}`,
      );
    }
  }

  if (expectations.exitCode !== undefined) {
    if (result.exitCode !== expectations.exitCode) {
      throw new Error(
        `exitCode assertion failed: expected ${expectations.exitCode}, got ${result.exitCode}`,
      );
    }
  }

  if (expectations.contains !== undefined) {
    const combined = result.stdout + result.stderr;
    if (!combined.includes(expectations.contains)) {
      throw new Error(
        `contains assertion failed: expected output to contain ${JSON.stringify(expectations.contains)}`,
      );
    }
  }

  if (expectations.notContains !== undefined) {
    const combined = result.stdout + result.stderr;
    if (combined.includes(expectations.notContains)) {
      throw new Error(
        `notContains assertion failed: expected output not to contain ${JSON.stringify(expectations.notContains)}`,
      );
    }
  }
}
