# `@questi0nm4rk/feats/plugin` — import `.feature` files directly

Bun plugin that resolves `.feature` files at build/import time, parsing them
through `parseFeature()` and exporting the result as the module's default.

## Setup

In your `bunfig.toml`:

```toml
[test]
preload = ["./feats-plugin-loader.ts"]
```

Where `feats-plugin-loader.ts` registers the plugin globally:

```ts
import { plugin } from "bun";
import featsPlugin from "@questi0nm4rk/feats/plugin";

plugin(featsPlugin);
```

Or pass it directly to `Bun.build()` for custom build pipelines:

```ts
await Bun.build({
  entrypoints: ["./tests/features/checkout.test.ts"],
  outdir: "./out",
  target: "bun",
  plugins: [featsPlugin],
});
```

## Usage in a test

```ts
import checkoutFeature from "./checkout.feature";
import { runFeatures } from "@questi0nm4rk/feats";
import "./checkout.steps";

runFeatures([checkoutFeature]);
```

The imported `checkoutFeature` is a fully-parsed `Feature` object — no glob,
no async, no I/O at test time. The parse happens once at bundle time.

## When to use this vs `loadFeatures(glob)`

- **`loadFeatures(glob)`** — async, runtime glob, good for "load everything
  in `tests/features/**/*.feature`" without an explicit list.
- **Plugin import** — sync, per-feature, good for static analysis
  (your editor follows the import), tree-shaking, and bundling for
  distribution.

Use whichever matches your test layout. The two are not mutually exclusive.

## Caveats

- The bundled feature is a JSON-serialized snapshot. Parameters injected at
  bundle time (e.g. timestamps in scenario names) won't update on rebuild.
- Outline expansion happens at bundle time (because `parseFeature()` runs
  then). Adding an example row requires a rebuild.
- File paths embedded in `location.uri` are the absolute paths at bundle
  time. For portable error messages, keep features under your repo root.
