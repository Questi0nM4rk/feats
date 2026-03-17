import type { CLIResult } from "@/cli/cli-result";

export interface RunCliOpts {
  readonly cwd?: string;
  readonly timeout?: number;
  readonly env?: Record<string, string>;
  readonly stdin?: string;
}

export async function runCli(
  command: string,
  args?: string[],
  opts?: RunCliOpts,
): Promise<CLIResult> {
  const timeout = opts?.timeout ?? 30000;

  const stdinValue: "ignore" | Uint8Array =
    opts?.stdin !== undefined ? new TextEncoder().encode(opts.stdin) : "ignore";

  const envValue = opts?.env !== undefined ? { ...process.env, ...opts.env } : process.env;

  const spawnOpts = {
    env: envValue,
    stdin: stdinValue,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
    ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
  };

  const proc = Bun.spawn([command, ...(args ?? [])], spawnOpts);

  let timedOut = false;

  const waitWithTimeout = async (): Promise<number> => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
        resolve(1);
      }, timeout);

      proc.exited
        .then((code) => {
          clearTimeout(timer);
          resolve(code ?? 1);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(1);
        });
    });
  };

  const [exitCode, stdoutText, stderrText] = await Promise.all([
    waitWithTimeout(),
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return {
    stdout: stdoutText,
    stderr: stderrText,
    exitCode,
    timedOut,
  };
}
