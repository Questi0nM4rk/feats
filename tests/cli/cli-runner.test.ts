import { describe, expect, test } from "bun:test";
import { runCli } from "@/cli/cli-runner";

describe("runCli", () => {
  test("captures stdout from echo", async () => {
    const result = await runCli("echo", ["hello"]);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  test("captures exit code from false command", async () => {
    const result = await runCli("false");
    expect(result.exitCode).not.toBe(0);
  });

  test("captures exit code 0 from true command", async () => {
    const result = await runCli("true");
    expect(result.exitCode).toBe(0);
  });

  test("captures stderr output", async () => {
    const result = await runCli("sh", ["-c", "echo error >&2"]);
    expect(result.stderr.trim()).toBe("error");
  });

  test("captures multiple args", async () => {
    const result = await runCli("echo", ["hello", "world"]);
    expect(result.stdout.trim()).toBe("hello world");
  });

  test("uses cwd option", async () => {
    const result = await runCli("pwd", [], { cwd: "/tmp" });
    expect(result.stdout.trim()).toBe("/tmp");
  });

  test("passes env variables", async () => {
    const result = await runCli("sh", ["-c", "echo $MY_VAR"], {
      env: { MY_VAR: "test-value" },
    });
    expect(result.stdout.trim()).toBe("test-value");
  });

  test("times out slow commands", async () => {
    const result = await runCli("sleep", ["10"], { timeout: 100 });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  test("returns empty stderr on success", async () => {
    const result = await runCli("echo", ["hello"]);
    expect(result.stderr).toBe("");
  });
});
