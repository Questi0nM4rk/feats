# @questi0nm4rk/feats

BDD/Gherkin test framework for Bun — feature testing with typed step definitions.

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

## More docs

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
