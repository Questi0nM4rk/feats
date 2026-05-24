# Reporters

A reporter consumes the event stream emitted by `runFeatures()` while
scenarios execute. Use one to render results to the console, write a CI
artifact (JUnit, Cucumber JSON), or feed downstream tooling.

Reporters live behind a small typed interface — every method is optional,
so a reporter implements only what it needs. The runner awaits each
callback in registration order.

## Quick start

Attach the built-in pretty reporter via the environment variable so CI
gets a feature-shaped log with zero code changes:

```bash
FEATS_REPORTERS=pretty bun test
```

Or pass instances directly from your test entry point:

```ts
import { runFeatures, PrettyReporter, JUnitReporter } from "@questi0nm4rk/feats";

runFeatures(features, {
  reporters: [
    new PrettyReporter(),
    new JUnitReporter({ outFile: "reports/junit.xml" }),
  ],
});
```

Explicit `opts.reporters` always wins over `FEATS_REPORTERS`. If neither is
set, the runner emits no reporter events — overhead is zero and `bun:test`
remains the only output surface (Phase 1 behavior).

## Built-in reporters

### `PrettyReporter`

Human-readable console output. One line per step with a status icon and
duration. Failed scenarios get a `Failures:` section at the end with the
original error message. Honors `NO_COLOR` and `process.stdout.isTTY`.

```ts
new PrettyReporter();                            // writes to process.stdout
new PrettyReporter({ write: (chunk) => buf.push(chunk) }); // capture for tests
```

### `JUnitReporter`

Jenkins / Surefire-compatible XML, written on `onRunEnd`. Used by GitHub
Actions test-summary, Jenkins, Buildkite, GitLab — anything that consumes
JUnit XML.

```ts
new JUnitReporter({ outFile: "reports/junit.xml" });
```

Multiple instances in the same process must write to distinct paths.
Construction throws otherwise. Use `{n}` for a 1-based counter:

```ts
new JUnitReporter({ outFile: "reports/junit-{n}.xml" });
```

### `CucumberJsonReporter`

Cucumber-JS-shaped JSON, the format `cucumber-html-reporter` and most
downstream consumers expect. Step durations are in nanoseconds.

```ts
new CucumberJsonReporter({ outFile: "reports/cucumber.json" });
```

Same `{n}` placeholder + same collision guard as JUnit.

## Environment variable: `FEATS_REPORTERS`

Comma-separated reporter spec. Items take an optional `:path` argument
for file-output reporters.

```bash
FEATS_REPORTERS=pretty
FEATS_REPORTERS=pretty,junit:out.xml
FEATS_REPORTERS=junit:reports/junit.xml,cucumber-json:reports/report.json
```

Whitespace around items is trimmed. Unknown reporter names throw on parse.

## Writing a custom reporter

Implement any subset of the eight `FeatsReporter` methods:

```ts
import type { FeatsReporter, StepResult } from "@questi0nm4rk/feats";

class FailureOnlyReporter implements FeatsReporter {
  onStep(result: StepResult) {
    if (result.status === "failed") {
      console.error(`✗ ${result.step.keyword} ${result.step.text}`);
      console.error(result.error);
    }
  }
}
```

### Event order

For a run with two features (`A`, `B`), each with one scenario, the runner
emits this sequence:

```
onRunStart([A, B])
  onFeatureStart(A)
    onScenarioStart(scenario_a1, A)
      onStep(step_a1_1)
      onStep(step_a1_2)
    onScenarioEnd({status: "passed", steps: [...], ...})
  onFeatureEnd({feature: A, scenarios: [...]})
  onFeatureStart(B)
    onScenarioStart(scenario_b1, B)
      onStep(step_b1_1)
    onScenarioEnd({...})
  onFeatureEnd({feature: B, scenarios: [...]})
onRunEnd({features: 2, scenarios: 2, ...})
```

Callbacks may be `async`; the runner `await`s each before continuing.

### Step statuses

| Status      | Meaning                                                         |
|-------------|-----------------------------------------------------------------|
| `passed`    | Step ran without throwing                                       |
| `failed`    | Step threw; `result.error` is the **raw** error (not wrapped)   |
| `skipped`   | A prior step in the same scenario failed                         |
| `pending`   | (Reserved — Phase 2b)                                            |
| `undefined` | No step definition matched; `result.error` is the snippet helper |

Filtered scenarios (excluded by tag filter or `FEATS_TAGS`) emit **no
events** — matches the behavior of cucumber-js and SpecFlow. Reporters
that want to display "skipped by filter" lines can inspect
`feature.scenarios` separately.

### Reporters see the **raw** error

`StepResult.error` is the original thrown value — not the
`formatStepError`-wrapped `Error` that `bun:test`'s default rendering
uses. Reporters get the underlying type, stack, and cause chain and can
render however they like.

### Run semantics (D7)

In `bun:test` mode, each `runFeatures()` call gets its own
`onRunStart` / `onRunEnd` pair. If your test layout has multiple files
each calling `runFeatures`, each file's call is a separate "run" from
the reporter's perspective. The forthcoming `feats` CLI binary (Phase 2c)
will run the whole suite under a single `runFeatures()` call and emit one
`onRunStart` / `onRunEnd` for the entire suite.

File-output reporters (`JUnitReporter`, `CucumberJsonReporter`) fail-fast
on path collisions within a single process — use the `{n}` placeholder
or distinct paths to avoid clobbering.
