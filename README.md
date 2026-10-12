<div align="center">

# `@questi0nm4rk/feats`

**A BDD runner that turns Gherkin `.feature` files into `bun test` tests, for TypeScript projects on Bun.**

[![npm](https://img.shields.io/npm/v/@questi0nm4rk/feats?color=cb3837&label=npm)](https://www.npmjs.com/package/@questi0nm4rk/feats)
[![CI](https://github.com/Questi0nM4rk/feats/actions/workflows/check.yml/badge.svg)](https://github.com/Questi0nM4rk/feats/actions/workflows/check.yml)
[![license](https://img.shields.io/npm/l/@questi0nm4rk/feats?color=blue)](./LICENSE)

</div>

```gherkin
Scenario: Add item and checkout
  Given the cart is empty
  When I add "Widget" to the cart
  Then the cart should have 1 item
```

```ts
import { Given, loadFeatures, runFeatures } from "@questi0nm4rk/feats";

Given("the cart is empty", (world) => { world.items = []; });

runFeatures(await loadFeatures("tests/features/*.feature"));
```

`bun test` then runs each scenario as a `bun:test` test.

## Why it exists

My other tools needed behaviour specs that a person can read, and `bun:test` alone keeps the spec in test names, not in Gherkin.
cucumber-js has its own runner on Node, so its results do not appear in `bun test`.
This package parses Gherkin with the official parser and turns each scenario into a `bun:test` test, so one command runs everything.
It refuses to be a full Cucumber port: no parallelism of its own, no plugin protocol, no report server.
It has no reason to exist if `bun test` reads `.feature` files natively.

## Quickstart

Tested on Bun 1.3.14.

```sh
git clone https://github.com/Questi0nM4rk/feats.git && cd feats && bun install --frozen-lockfile
bun test
```

Expected output ends with:

```text
 389 pass
 8 skip
 0 fail
Ran 397 tests across 36 files.
```

The project tests itself with its own feature file: `tests/features/self-test.feature`.
To use it in another project, run `bun add @questi0nm4rk/feats` (see Status for the npm version).
Lint and typecheck: `bun run lint` and `bun run typecheck`.

## How it works

```mermaid
flowchart LR
  F[".feature file"] --> P["Gherkin parser"]
  P --> M["match steps<br/>(cucumber-expressions)"]
  S["step definitions"] --> M
  M --> R["runFeatures: describe/test blocks"]
  R --> B["bun test"]
  R --> RP["reporters: pretty, JUnit, Cucumber JSON"]
```

No part of it calls a model.
The parser and the expression matcher are the official `@cucumber/*` packages.
This repo adds the registry, the runner, hooks, tag filters, reporters, a `feats` CLI and a Bun plugin that loads `.feature` files as modules.
Guide: [docs/guide.md](./docs/guide.md).
API: [docs/api.md](./docs/api.md).

## Numbers

Measured 2026-10-12 on Arch Linux, Bun 1.3.14.

| What | Value | How measured |
| --- | --- | --- |
| Tests | 389 pass, 8 skip, 0 fail | `bun test` |
| Test time | 2.4 s wall, 397 tests in 36 files | `time bun test` |
| Source size | 6,878 lines of TypeScript code (src and tests) | `scc src tests` |
| Bundle size | 1.0 MB main, 0.4 MB plugin (includes the bundled parser) | `bun run build` |
| Parser bench | median 1.9 to 2.8 ms, p95 3.9 to 6.1 ms for 100 scenarios (5 runs) | `bun run bench` (30 iterations, parser only) |

The bench does not measure the runner. Bench numbers vary between runs and do not compare across machines.

Commits include agent-authored work under my identity; design, orchestration and review are mine.

## Status

- **Works:** parsing, step matching, hooks, tag filters, `Rule:`, pending steps, reporters, the `feats` CLI, the Bun plugin for `.feature` imports. Covered by the tests above.
- **Tried and dropped:** nothing recorded in the repo. The non-goals are in [docs/plans/roadmap.md](./docs/plans/roadmap.md).
- **Known gaps:** the repo is at version 1.4.0 and has no git tags or GitHub release.
npm has only 1.0.0 and 1.0.1, so the features after 1.0.1 are not on npm.
Step arguments arrive as `unknown`, so steps narrow them by hand.
No `# language:` support.
The bench covers the parser only.
Single maintainer.

## License

MIT
