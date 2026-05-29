<div align="center">

# `@questi0nm4rk/feats`

**BDD/Gherkin test framework for Bun** — feature testing with typed step definitions.

[![npm](https://img.shields.io/npm/v/@questi0nm4rk/feats?color=cb3837&label=npm)](https://www.npmjs.com/package/@questi0nm4rk/feats)
[![types](https://img.shields.io/npm/types/@questi0nm4rk/feats?color=3178c6)](https://www.npmjs.com/package/@questi0nm4rk/feats)
[![license](https://img.shields.io/npm/l/@questi0nm4rk/feats?color=blue)](./LICENSE)
[![CI](https://github.com/Questi0nM4rk/feats/actions/workflows/check.yml/badge.svg)](https://github.com/Questi0nM4rk/feats/actions/workflows/check.yml)
[![release](https://img.shields.io/github/v/release/Questi0nM4rk/feats?display_name=tag)](https://github.com/Questi0nM4rk/feats/releases)

</div>

## Install

```sh
bun add @questi0nm4rk/feats
```

## Quick example

**`tests/features/checkout.feature`**

```gherkin
Feature: Shopping cart checkout

  Scenario: Add item and checkout
    Given the cart is empty
    When I add "Widget" to the cart
    Then the cart should have 1 item
    And the total should be 9.99
```

**`tests/features/checkout.steps.ts`**

```typescript
import { expect } from "bun:test";
import { Given, When, Then } from "@questi0nm4rk/feats";

interface CartWorld {
  items: { name: string; price: number }[];
  [key: string]: unknown;
}

Given("the cart is empty", (world: CartWorld) => {
  world.items = [];
});

When("I add {string} to the cart", (world: CartWorld, name: unknown) => {
  if (typeof name !== "string") throw new Error("expected string");
  world.items.push({ name, price: 9.99 });
});

Then("the cart should have {int} item", (world: CartWorld, count: unknown) => {
  if (typeof count !== "number") throw new Error("expected number");
  expect(world.items.length).toBe(count);
});

Then("the total should be {float}", (world: CartWorld, total: unknown) => {
  if (typeof total !== "number") throw new Error("expected number");
  const sum = world.items.reduce((acc, item) => acc + item.price, 0);
  expect(sum).toBe(total);
});
```

**`tests/features/checkout.test.ts`**

```typescript
import { loadFeatures, runFeatures } from "@questi0nm4rk/feats";
import "./checkout.steps";

const features = await loadFeatures("tests/features/*.feature");
runFeatures(features);
```

Run with:

```sh
bun test
```

## Exports

| Export | Description |
|--------|-------------|
| `Given`, `When`, `Then`, `Step` | Register step definitions |
| `defineParameterType` | Register custom cucumber parameter types |
| `Before`, `After` | Lifecycle hooks (with optional tag filter) |
| `loadFeatures(glob)` | Parse `.feature` files matching a glob |
| `parseFeature(source, uri)` | Parse a feature from a string |
| `runFeatures(features, opts?)` | Generate `bun:test` describe/test blocks |
| `isDataTable`, `isDocString` | Type guards for step-callback trailing args |
| `resetFeats` | Clear registry + hooks + parameter types (test isolation) |
| `clearRegistry`, `clearHooks`, `clearParameterTypeRegistry` | Fine-grained resets |
| `setupFixture(name, opts)` | Copy a fixture directory to a temp dir |
| `composeFixtures(names, opts)` | Merge multiple fixture dirs into one temp dir |
| `runCli(command, args?, opts?)` | Run a CLI process and capture output |
| `assertConfig(filePath, expected, opts?)` | Assert JSON/TOML/YAML config file contents |
| `assertOutput(result, expectations)` | Assert CLI output (stdout, stderr, exitCode) |
| `createRng(seed?)` | Create a seeded deterministic RNG |

## Filtering by tag

Set the `FEATS_TAGS` env var to filter scenarios without changing code:

```sh
FEATS_TAGS="@smoke" bun test
FEATS_TAGS="not @slow" bun test
FEATS_TAGS="(@smoke or @critical) and not @wip" bun test
```

Tag expressions support `and`, `or`, `not`, and parentheses. The `opts.tagFilter`
on `runFeatures()` takes precedence if both are set.

## Better failure messages

When a step has no matching definition, the error includes the feature
location and a copy-paste-ready snippet with `{string}` / `{int}` / `{float}`
substituted in for inline literals:

```
Undefined step at tests/features/checkout.feature:7: "I add \"Widget\" to the cart"

Add a step definition:

When("I add {string} to the cart", async (world, arg1) => {
  // TODO: implement
  throw new Error("Not implemented");
});
```

Ambiguous-step errors get the same location prefix so you can find the
conflict instantly.

## Reporters

Attach reporters to render results to the console or emit CI artifacts
(JUnit XML, Cucumber JSON). The quickest path is the env var:

```bash
FEATS_REPORTERS=pretty bun test
FEATS_REPORTERS=junit:reports/junit.xml,cucumber-json:reports/cucumber.json bun test
```

Or pass instances explicitly:

```ts
import { runFeatures, PrettyReporter, JUnitReporter } from "@questi0nm4rk/feats";

runFeatures(features, {
  reporters: [new PrettyReporter(), new JUnitReporter({ outFile: "junit.xml" })],
});
```

Custom reporters implement any subset of the eight `FeatsReporter`
callbacks. See [`docs/reporters.md`](./docs/reporters.md) for the contract,
event order, and built-in reference.

## Lifecycle hooks

`Before` / `After` run per scenario (Phase 1). `BeforeAll` / `AfterAll`
(Phase 2b) run once per `runFeatures()` call:

```ts
import { BeforeAll, AfterAll } from "@questi0nm4rk/feats";

BeforeAll(async () => { await db.connect(); });
AfterAll(async () => { await db.disconnect(); });
```

## Pending steps

A step can declare itself not-yet-implemented without failing the suite:

```ts
import { pending } from "@questi0nm4rk/feats";

Given("the checkout flow is wired up", () => {
  pending("not done yet");
});
```

Subsequent steps in that scenario render as skipped; reporters see
`status: "pending"` and `RunSummary.pending` increments.

## Rule:

The parser accepts the Gherkin 6 `Rule:` keyword. Scenarios under a Rule
appear flat in `feature.scenarios` (so existing code keeps working) with
a `rule?: { name, tags }` field attached for reporter / filter use. Rule
tags are inherited by their scenarios for tag filtering — `@critical`
on a Rule applies to every scenario inside.

```gherkin
Feature: Checkout

  @critical
  Rule: Empty carts cost nothing
    Scenario: Empty cart total is zero
      Given the cart is empty
      Then the total is 0
```

## More docs

- [`docs/reporters.md`](./docs/reporters.md) — reporter contract + built-ins
- [`docs/parameter-types.md`](./docs/parameter-types.md) — custom Gherkin params
- [`docs/world.md`](./docs/world.md) — typed worlds, factories, sharing setup
- [`docs/test-isolation.md`](./docs/test-isolation.md) — registry reset patterns
- [`docs/assertions.md`](./docs/assertions.md) — `assertConfig` / `assertOutput`
- [`docs/runCli.md`](./docs/runCli.md) — running CLIs from steps
- [`docs/bun-plugin.md`](./docs/bun-plugin.md) — `.feature` as importable modules

## Bun plugin

Load `.feature` files directly as JS modules:

```typescript
// bunfig.toml or Bun.build config
import featsPlugin from "@questi0nm4rk/feats/plugin";

Bun.build({
  plugins: [featsPlugin],
  // ...
});
```
