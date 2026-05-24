# Test isolation

`@questi0nm4rk/feats` holds three pieces of state at module scope:

| State | Held by | What it contains |
|---|---|---|
| Step definitions | `src/registry/step-registry.ts` | `Given` / `When` / `Then` / `Step` registrations |
| Hooks | `src/runner/hook-runner.ts` | `Before` / `After` registrations |
| Parameter types | `src/registry/parameter-types.ts` | `defineParameterType` registrations |

Each is shared across the process — registering a step in one module makes it
visible to every other module. Within a single feature suite that's exactly
what you want.

Between test FILES, however, state can leak in surprising ways: if `a.test.ts`
imports `a.steps.ts` (which registers `Given("X", ...)`), and `b.test.ts`
imports a different `b.steps.ts` that also registers `Given("X", ...)`, the
second registration will trigger an *Ambiguous step* error.

## `resetFeats()` — the bulk solution

```ts
import { beforeEach } from "bun:test";
import { resetFeats } from "@questi0nm4rk/feats";

beforeEach(resetFeats);
```

This is fine in TEST files where each `beforeEach` runs once per `test()`.
Re-import your step file inside the test if you need it back.

A cleaner pattern: don't reset; use unique step patterns per feature.

## Fine-grained controls

If you need to clear only one kind of state:

```ts
import {
  clearRegistry,
  clearHooks,
  clearParameterTypeRegistry,
} from "@questi0nm4rk/feats";
```

- `clearRegistry()` — wipes step definitions only.
- `clearHooks()` — wipes Before/After only.
- `clearParameterTypeRegistry()` — wipes custom parameter types only.

`resetFeats()` calls all three.

## Why the runner doesn't reset for you

`runFeatures(features)` snapshots the current registry + hooks at call time,
so once a `runFeatures()` call enters, the in-flight run is immune to later
clears. This means:

- A `beforeEach(resetFeats)` in the same file as `runFeatures(...)` will
  *not* break the in-flight run; bun:test's nested `test()` invocations
  resolve against the snapshot.
- But if file A calls `runFeatures(...)` and file B is loaded afterwards,
  file B's `runFeatures(...)` sees the residual A registrations unless you
  reset.

In practice: pair every `tests/features/foo.test.ts` with its own
`tests/features/foo.steps.ts` and let each pair register at module scope.
You'll rarely need to reset.

## Common pitfall: re-importing step files

```ts
// tests/features/checkout.test.ts
import { loadFeatures, runFeatures, resetFeats } from "@questi0nm4rk/feats";
import { beforeAll } from "bun:test";

// ❌ Don't put this inside beforeEach. Step files only register on first
//    import; resetting after import means future scenarios see an empty
//    registry.
// beforeEach(() => {
//   resetFeats();
//   import("./checkout.steps");  // <- already cached!
// });

// ✓ Use it AT MOST once per file, before the first runFeatures call:
beforeAll(resetFeats);
await import("./checkout.steps");
const features = await loadFeatures("tests/features/checkout.feature");
runFeatures(features);
```

`import()` is cached. Calling it a second time does not re-execute the file.
If you need fresh registrations multiple times in one process, refactor the
step file to export a registration function and call it explicitly.
