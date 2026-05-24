# Parameter Types

Cucumber expressions let you write step patterns with typed placeholders. The
parser captures the matched text, converts it, and passes the result as a
positional callback arg. No hand-casting.

## Built-in placeholders

| Placeholder | Matches | Pass to callback as |
|---|---|---|
| `{string}` | A double- or single-quoted string | `string` (without quotes) |
| `{int}` | An integer (with optional sign) | `number` |
| `{float}` | A decimal number | `number` |
| `{word}` | A run of word characters | `string` |
| `{}` (anonymous) | Any text up to the next pattern | `string` |

```ts
import { Given, When, Then } from "@questi0nm4rk/feats";

When("I add {string} to the cart", (world, name: string) => {
  // name === "Widget" for: When I add "Widget" to the cart
});

Then("the cart should have {int} items", (world, count: number) => {
  // count === 3 for: Then the cart should have 3 items
});

When("I pay {float} dollars", (world, amount: number) => {
  // amount === 9.99
});
```

Note: callbacks receive `world, ...args: unknown[]`. The cucumber-expression
arg comes through as `unknown` at the type level, but the runtime value is
already the converted type. Use a type annotation on the parameter
(`count: number`) and TypeScript will accept the read.

## Defining a custom parameter type

When a built-in doesn't fit — e.g. you want a domain enum or a typed
identifier — use `defineParameterType`:

```ts
import { defineParameterType, Given } from "@questi0nm4rk/feats";

type Role = "admin" | "viewer" | "editor";

defineParameterType({
  name: "role",
  regexp: /admin|viewer|editor/,
  transformer: (matched) => matched as Role,
});

Given("a {role} user", (world, role: Role) => {
  // role is typed as Role thanks to the transformer
});
```

Three constraints:
- `name` becomes the placeholder: `{role}`. Names must be unique per process.
- `regexp` is what cucumber matches against. Make it as tight as possible —
  ambiguity here causes ambiguous-step errors at runtime.
- `transformer(matched: string)` returns whatever value you want passed
  through. The return type widens to `unknown` from feats' perspective but
  consumers can annotate to recover it.

## Typed example: profile names

```ts
type Profile = "dev" | "staging" | "prod";

defineParameterType({
  name: "profile",
  regexp: /dev|staging|prod/,
  transformer: (s) => s as Profile,
});

When("I deploy to {profile}", (world, profile: Profile) => {
  // ...
});
```

## When NOT to define a parameter type

- One-off conversion: just convert inside the step body.
- The match needs full regex flexibility: write a regex-style step expression
  instead (see cucumber-expressions docs).

## Reset between test files

Custom parameter types live in a module-scope registry. If a step module
imports another with conflicting type names, the second registration throws.
Use `resetFeats()` (or `clearParameterTypeRegistry()` for finer control) in a
`beforeEach` to isolate test files:

```ts
import { beforeEach } from "bun:test";
import { resetFeats } from "@questi0nm4rk/feats";

beforeEach(resetFeats);
```

See [test-isolation.md](./test-isolation.md) for details.
