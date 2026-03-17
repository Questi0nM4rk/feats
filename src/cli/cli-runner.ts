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

  const proc =
    opts?.cwd !== undefined
      ? Bun.spawn([command, ...(args ?? [])], {
          cwd: opts.cwd,
          env: envValue,
          stdin: stdinValue,
          stdout: "pipe",
          stderr: "pipe",
        })
      : Bun.spawn([command, ...(args ?? [])], {
          env: envValue,
          stdin: stdinValue,
          stdout: "pipe",
          stderr: "pipe",
        });

  let timedOut = false;

  const waitWithTimeout = async (): Promise<number> => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
        resolve(1);
      }, timeout);

      proc.exited.then((code) => {
        clearTimeout(timer);
        resolve(code ?? 1);
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
