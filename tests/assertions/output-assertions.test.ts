import { describe, expect, test } from "bun:test";
import { assertOutput } from "@/assertions/output-assertions";
import type { CLIResult } from "@/cli/cli-result";

function makeResult(overrides: Partial<CLIResult> = {}): CLIResult {
  return {
    stdout: "",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    ...overrides,
  };
}

describe("assertOutput", () => {
  test("passes when stdout string matches", () => {
    const result = makeResult({ stdout: "hello world" });
    expect(() => assertOutput(result, { stdout: "hello" })).not.toThrow();
  });

  test("throws when stdout string does not match", () => {
    const result = makeResult({ stdout: "goodbye" });
    expect(() => assertOutput(result, { stdout: "hello" })).toThrow("stdout assertion failed");
  });

  test("passes when stdout regex matches", () => {
    const result = makeResult({ stdout: "hello world" });
    expect(() => assertOutput(result, { stdout: /hel+o/ })).not.toThrow();
  });

  test("throws when stdout regex does not match", () => {
    const result = makeResult({ stdout: "goodbye" });
    expect(() => assertOutput(result, { stdout: /^hello/ })).toThrow("stdout assertion failed");
  });

  test("passes when stderr string matches", () => {
    const result = makeResult({ stderr: "error occurred" });
    expect(() => assertOutput(result, { stderr: "error" })).not.toThrow();
  });

  test("throws when stderr does not match", () => {
    const result = makeResult({ stderr: "all good" });
    expect(() => assertOutput(result, { stderr: "error" })).toThrow("stderr assertion failed");
  });

  test("passes when stderr regex matches", () => {
    const result = makeResult({ stderr: "error: something went wrong" });
    expect(() => assertOutput(result, { stderr: /^error:/ })).not.toThrow();
  });

  test("throws when stderr regex does not match with readable message", () => {
    const result = makeResult({ stderr: "all good" });
    expect(() => assertOutput(result, { stderr: /^error:/ })).toThrow("/^error:/");
  });

  test("passes when exitCode matches", () => {
    const result = makeResult({ exitCode: 1 });
    expect(() => assertOutput(result, { exitCode: 1 })).not.toThrow();
  });

  test("throws when exitCode does not match", () => {
    const result = makeResult({ exitCode: 0 });
    expect(() => assertOutput(result, { exitCode: 1 })).toThrow("exitCode assertion failed");
  });

  test("passes when contains is in stdout", () => {
    const result = makeResult({ stdout: "the quick brown fox" });
    expect(() => assertOutput(result, { contains: "quick" })).not.toThrow();
  });

  test("passes when contains is in stderr", () => {
    const result = makeResult({ stderr: "warning: something" });
    expect(() => assertOutput(result, { contains: "warning" })).not.toThrow();
  });

  test("throws when contains not found in output", () => {
    const result = makeResult({ stdout: "hello", stderr: "world" });
    expect(() => assertOutput(result, { contains: "missing" })).toThrow(
      "contains assertion failed",
    );
  });

  test("passes when notContains string is absent", () => {
    const result = makeResult({ stdout: "hello world" });
    expect(() => assertOutput(result, { notContains: "error" })).not.toThrow();
  });

  test("throws when notContains string is present", () => {
    const result = makeResult({ stdout: "fatal error occurred" });
    expect(() => assertOutput(result, { notContains: "error" })).toThrow(
      "notContains assertion failed",
    );
  });

  test("throws on first mismatch when multiple expectations", () => {
    const result = makeResult({ stdout: "hello", exitCode: 0 });
    expect(() => assertOutput(result, { stdout: "wrong", exitCode: 1 })).toThrow(
      "stdout assertion failed",
    );
  });

  test("passes all checks in one call", () => {
    const result = makeResult({ stdout: "SUCCESS", exitCode: 0 });
    expect(() =>
      assertOutput(result, { stdout: "SUCCESS", exitCode: 0, notContains: "error" }),
    ).not.toThrow();
  });
});
