# World: per-scenario state

Each scenario gets a fresh `World` object that steps can mutate to share
state. By default `World` is `Record<string, unknown>`; type it with a
generic on `Given` / `When` / `Then` for autocomplete + safety.

## Default world

```ts
import { Given, When, Then } from "@questi0nm4rk/feats";

Given("the cart is empty", (world) => {
  world.items = [];
});

When("I add {string} to the cart", (world, name: string) => {
  // Cast to your shape inside, or use a typed world (below).
  (world.items as string[]).push(name);
});
```

## Typed world (recommended)

```ts
import { Given, When, Then, type World } from "@questi0nm4rk/feats";

interface CartWorld extends World {
  items: { name: string; price: number }[];
  total: number;
}

Given<CartWorld>("the cart is empty", (world) => {
  world.items = [];
  world.total = 0;
});

When<CartWorld>("I add {string} priced {float}", (world, name: string, price: number) => {
  world.items.push({ name, price });
  world.total += price;
});

Then<CartWorld>("the total should be {float}", (world, expected: number) => {
  expect(world.total).toBe(expected);
});
```

`World` is a marker interface — any object literal is assignable. Extending
it just gets you `Record<string, unknown>` compatibility for libraries that
expect the loose shape.

## Custom world factory

Pass a `worldFactory` to `runFeatures` to seed each scenario with a
specific shape (e.g. a fresh DB client or a logger):

```ts
import { runFeatures } from "@questi0nm4rk/feats";

runFeatures(features, {
  worldFactory: (): CartWorld => ({
    items: [],
    total: 0,
  }),
});
```

The factory is invoked **once per scenario** (verified by the contract
suite). Background steps and Before hooks run against the same world the
scenario steps see. Each scenario gets its own world — no cross-scenario
leakage.

## Sharing setup across step files

Step modules are plain TypeScript files. Anything at module scope runs
once at import time:

```ts
// tests/features/db.steps.ts
import { Given } from "@questi0nm4rk/feats";

let cachedClient: DbClient | undefined;

function client(): DbClient {
  if (cachedClient === undefined) cachedClient = connectDb();
  return cachedClient;
}

Given("a user exists", async (world) => {
  await client().users.insert({ id: 1 });
});
```

If you need cross-file shared state, put it in a sibling module that both
files import — that's how Bun's module cache works.

## Cleanup with `After`

`After` runs once per scenario, after all steps and even on step failure.
Use it to release per-scenario resources held on `world`:

```ts
import { After } from "@questi0nm4rk/feats";

interface FixtureWorld extends World {
  tempDir?: string;
}

After<FixtureWorld>(async (world) => {
  if (world.tempDir !== undefined) {
    await rm(world.tempDir, { recursive: true });
  }
});
```

If both your step and an After hook throw, both errors surface — see
[the After-hook accumulation note](../CHANGELOG.md) in `1.0.2`.

## What does NOT live on world

- **Lifecycle hooks** are registered at module scope, not on world.
- **Step definitions** are registered at module scope.
- **Custom parameter types** are registered at module scope.

All three persist across scenarios. To reset between test files use
`resetFeats()` (see [test-isolation.md](./test-isolation.md)).
