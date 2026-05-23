# `runCli` — running a CLI from a step

Spawns a subprocess via `Bun.spawn`, captures stdout/stderr/exitCode, and
returns a `CLIResult`. Designed for behavior tests that exercise a real
binary or build artifact.

```ts
import { runCli } from "@questi0nm4rk/feats";

const result = await runCli("my-cli", ["--version"]);
// result: { stdout, stderr, exitCode, timedOut }
```

## Options

```ts
await runCli("my-cli", ["build"], {
  cwd: "/tmp/fixture-project",
  env: { NODE_ENV: "test", DEBUG: "myapp:*" },
  timeout: 5000,
  stdin: "hello\n",
});
```

- `cwd` — working directory
- `env` — extra env vars (merged with `process.env`)
- `timeout` — ms before the child is killed and `timedOut: true`
- `stdin` — string written to stdin

## Idiom: fixture + runCli + assertOutput

```ts
import { runCli, assertOutput, setupFixture } from "@questi0nm4rk/feats";

When("I run init in a fresh fixture", async (world) => {
  world.project = await setupFixture("typescript-monorepo");
  world.result = await runCli("my-cli", ["init"], { cwd: world.project.path });
});

Then("init succeeds and writes a manifest", (world) => {
  assertOutput(world.result, {
    exitCode: 0,
    stdoutContains: "manifest written",
  });
});
```

## Caveats

- `Bun.spawn` does **not** invoke a shell. The first arg is the executable
  name (looked up via `PATH`); subsequent args are passed as-is. No shell
  metacharacters are interpreted — `runCli("echo; rm -rf /")` looks up an
  executable literally named `echo; rm -rf /` and fails to find it.
- `timeout` defaults to 30s. The process is `kill()`-ed on timeout — give
  it long enough to clean up if the CLI handles SIGTERM.
- stdout/stderr are returned as UTF-8 strings. Binary output is not supported.
