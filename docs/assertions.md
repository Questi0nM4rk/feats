# `assertConfig` and `assertOutput`

Two assertion helpers ship with `@questi0nm4rk/feats` for the common task of
verifying that a CLI run produced the expected config file or stdout/stderr.
Both are zero-config and work with `expect()` semantics.

## `assertConfig(filePath, expected, opts?)`

Reads a JSON / TOML / YAML file and asserts that its parsed content matches
`expected` — by default in **subset** mode, so the file may have additional
keys that are not asserted.

```ts
import { assertConfig } from "@questi0nm4rk/feats";

Then("the package.json declares the right name", () => {
  assertConfig("./package.json", {
    name: "my-app",
    type: "module",
  });
});

Then("the pyproject.toml has the expected build system", () => {
  assertConfig("./pyproject.toml", {
    "build-system": { requires: ["hatchling"] },
  });
});
```

Format is detected from the extension (`.json`, `.toml`, `.yaml`, `.yml`).
Override with `opts.format`. For strict equality (no extra keys allowed),
pass `opts.subset: false`.

**Security note:** YAML parsing is bounded at 100 anchor expansions to prevent
billion-laughs-style resource exhaustion (since `1.0.2`).

## `assertOutput(result, expectations)`

Given a `CLIResult` (from `runCli` or any compatible source), assert on
`stdout`, `stderr`, and `exitCode`.

```ts
import { assertOutput, runCli } from "@questi0nm4rk/feats";

When("I run the build", async (world: World) => {
  world.result = await runCli("bun", ["run", "build"]);
});

Then("the build succeeds with a manifest line", (world: World) => {
  assertOutput(world.result as CLIResult, {
    exitCode: 0,
    stdoutContains: "manifest written",
  });
});
```

Supported expectations:

| Field | Type | Meaning |
|---|---|---|
| `exitCode` | `number` | Exit code must equal this |
| `stdoutContains` | `string` or `string[]` | Substring(s) must appear in stdout |
| `stderrContains` | `string` or `string[]` | Substring(s) must appear in stderr |
| `stdoutMatches` | `RegExp` | stdout must match the pattern |
| `stderrMatches` | `RegExp` | stderr must match the pattern |
| `stdoutEmpty` | `true` | stdout must be empty |
| `stderrEmpty` | `true` | stderr must be empty |
