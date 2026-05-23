# Phase 1 — Wire Existing Dead Code + DX Wins

**Target version:** `1.1.0` (minor — adds reporting context to errors, small
DX features). Non-breaking.

**Goal:** Make failures intelligible. Today, when a step is undefined or
ambiguous, the bun:test output reads `Error: Undefined step: "..."` with no
file path, no line number, no scaffolding for the missing step. The framework
already contains `formatStepError` and `generateStepSnippet` — they're just
not wired in. Phase 1 wires them and ships a handful of small DX wins around
the same theme.

**Phase 0 dependency:** Phase 0 cleans up the After-hook bug and outline naming.
Phase 1 builds on the now-clean baseline.

---

## In scope

- Wire `formatStepError` into runner failures
- Wire `generateStepSnippet` into the undefined-step error
- Add `uri:line` context to ambiguous-step errors
- `FEATS_TAGS` env var as default `tagFilter`
- Tag-filter parens (`(@a or @b) and not @c`)
- `defineParameterType` documentation + canonical examples
- Documentation for `World` generics and shared step modules

## Out of scope

- Reporter interface (Phase 2)
- New keywords or lifecycle hooks (Phase 2)
- CLI binary (Phase 2)
- Anything that changes step-callback signatures

---

## Task list

### 1.1 Pass `ParsedStep` into `matchStep`

**Why:** Both undefined-step and ambiguous-step errors lack file:line. The
function signature today is `matchStep(definitions, stepText)`. We need the
step's location.

**Change:** `src/registry/expression-adapter.ts`

```ts
// Before
export function matchStep(definitions: readonly StepDefinition[], stepText: string): MatchResult { ... }

// After
export function matchStep(
  definitions: readonly StepDefinition[],
  step: ParsedStep,
): MatchResult {
  const stepText = step.text;
  const loc = `${step.location.uri}:${step.location.line}`;
  // ...
  if (matches.length === 0) {
    throw new Error(
      `Undefined step at ${loc}: "${stepText}"\n\n` +
      `Add the following step definition:\n\n${generateStepSnippet(step)}`
    );
  }
  if (matches.length > 1) {
    const patterns = matches.map((m) => `"${m.definition.pattern}"`).join(", ");
    throw new Error(`Ambiguous step at ${loc}: "${stepText}" matches: ${patterns}`);
  }
  return matches[0] as MatchResult;
}
```

**Callers to update:**
- `src/runner/feature-runner.ts:18` — pass `step`, not `step.text`
- `src/runner/scenario-runner.ts` — deleted in Phase 0, N/A

**Tests:**
- [ ] Undefined step error includes `uri:line` and a working snippet
- [ ] Ambiguous step error includes `uri:line` and lists all matching patterns
- [ ] Snippet for `And` step uses `Step(...)` (not `Given`/`When`/`Then`)

- [ ] Implemented
- [ ] Tests pass
- [ ] Existing tests still pass

### 1.2 Wire `formatStepError` into step failures

**Why:** `src/reporting/error-formatter.ts` produces a Gherkin-flavored failure
message but nothing imports it. Today a failing step produces just the
underlying `expect()` error with no Gherkin context.

**Change:** `src/runner/feature-runner.ts:runSteps`

```ts
async function runSteps(
  world: World,
  steps: readonly ParsedStep[],
  definitions: readonly StepDefinition[],
): Promise<void> {
  for (const step of steps) {
    const match = matchStep(definitions, step);
    const extraArgs: unknown[] = [];
    if (step.docString !== undefined) extraArgs.push(step.docString);
    if (step.dataTable !== undefined) extraArgs.push(step.dataTable);
    try {
      await match.definition.callback(world, ...match.args, ...extraArgs);
    } catch (err) {
      // Preserve the original error's `cause` so stack traces remain navigable
      throw new Error(formatStepError(step, err), { cause: err });
    }
  }
}
```

**Why `cause`:** bun:test's error renderer walks `cause` chains. Without it,
the original assertion's pretty-diff is lost.

**Tests:**
- [ ] Failed step shows `uri:line`, `Keyword Step text`, and the original error
      message
- [ ] `error.cause` is the original error (regression guard for stack traces)

- [ ] Implemented
- [ ] Tests pass

### 1.3 `FEATS_TAGS` env var as default `tagFilter`

**Why:** CI integration. Both consumers currently have no way to filter
scenarios via command line without modifying their `.test.ts` file.

**Change:** `src/runner/feature-runner.ts`

```ts
const tagFilter = opts?.tagFilter ?? process.env.FEATS_TAGS ?? "";
```

**Document:**
- README example: `FEATS_TAGS="@smoke and not @wip" bun test`
- Note in `docs/cli.md` (placeholder for Phase 2 CLI binary, but env var
  works without it).

**Tests:**
- [ ] Without env var, no opts → no filtering (regression)
- [ ] Env var set, no opts → filters by env var
- [ ] opts.tagFilter set → opts wins, env var ignored

- [ ] Implemented
- [ ] Tests pass
- [ ] README updated

### 1.4 Parens in tag-filter expressions

**Why:** `not (a and b)` and `(a or b) and not c` are common. Current tokenizer
splits on whitespace only and emits no paren tokens.

**Change:** `src/runner/tag-filter.ts`

```ts
type TokenKind = "tag" | "and" | "or" | "not" | "lparen" | "rparen";

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  // Insert spaces around parens so the simple whitespace split still works
  const normalized = expr.replace(/\(/g, " ( ").replace(/\)/g, " ) ");
  const parts = normalized.trim().split(/\s+/).filter(p => p !== "");
  for (const part of parts) {
    if (part === "(") tokens.push({ kind: "lparen", value: "(" });
    else if (part === ")") tokens.push({ kind: "rparen", value: ")" });
    else if (part.toLowerCase() === "and") tokens.push({ kind: "and", value: "and" });
    else if (part.toLowerCase() === "or") tokens.push({ kind: "or", value: "or" });
    else if (part.toLowerCase() === "not") tokens.push({ kind: "not", value: "not" });
    else {
      const tag = part.startsWith("@") ? part : `@${part}`;
      tokens.push({ kind: "tag", value: tag });
    }
  }
  return tokens;
}

function parseAtom(tokens: Token[], pos: { index: number }, tags: readonly Tag[]): boolean {
  const token = tokens[pos.index];
  if (token === undefined) throw new Error("...");
  if (token.kind === "lparen") {
    pos.index++;
    const inner = parseOrExpr(tokens, pos, tags);
    const closing = tokens[pos.index];
    if (closing === undefined || closing.kind !== "rparen") {
      throw new Error(`Malformed tag filter expression: expected ')' at position ${pos.index}`);
    }
    pos.index++;
    return inner;
  }
  if (token.kind !== "tag") {
    throw new Error(`Malformed tag filter expression: expected tag or '(', got "${token.value}"`);
  }
  pos.index++;
  return hasTag(tags, token.value);
}
```

**Tests:**
- [ ] `"(@a or @b) and @c"` — true when tags `@a @c`; false when `@a`; false when `@c`
- [ ] `"not (@a and @b)"` — true unless both present
- [ ] `"((@a))"` — nested parens
- [ ] Unmatched paren — throws with helpful message
- [ ] Existing flat expressions still work (regression)

- [ ] Implemented
- [ ] Tests pass
- [ ] Documented in README tag-filter section

### 1.5 `defineParameterType` documentation + examples

**Why:** Both consumers hand-cast parameters (`asString(arg)`, repeated runtime
checks). `defineParameterType` would let them register `{int}`, `{string}`,
`{path}` once. Adoption is zero because the README has no example beyond the
export list.

**Action:** Write `docs/parameter-types.md`. Content outline:
1. Why parameter types (motivation: type-safe Gherkin params, no hand-casting)
2. Cucumber's built-in `{int}`, `{float}`, `{word}`, `{string}` (already work)
3. Defining a custom type — full hook-kit-style example
4. ai-guardrails-style example: a `{profile}` parameter that maps a Gherkin
   word to a typed enum

- [ ] `docs/parameter-types.md` written
- [ ] README links to it
- [ ] Two working examples committed to `examples/parameter-types/`

### 1.6 Docs: typed World + shared step modules

Both consumers have rich World interfaces. The README says little about it.

- [ ] `docs/world.md`:
  - Generic-typed World: `Given<MyWorld>("...", (world) => ...)`
  - WorldFactory and per-scenario isolation
  - Sharing setup via module-scope (hook-kit pattern)
- [ ] README links

### 1.7 Snippet improvements (small polish)

`src/reporting/pending-steps.ts:generateStepSnippet` produces:
```
Given("the cart is empty", async (world) => {
  // TODO: implement
  throw new Error("Not implemented");
});
```

Improvements while we're here:
- [ ] Replace literal cucumber parameters with placeholders: a step like
      `I add "Widget" to the cart` should become
      `When("I add {string} to the cart", async (world, item) => {...})`
- [ ] Detect numeric literals → `{int}` or `{float}`

These are optional polish — implement if time permits, defer to a future
patch otherwise.

---

## End-to-end test plan

### Local

1. `bun test` — all green
2. `bash scripts/e2e-hook-kit.sh` — must pass

### hook-kit smoke (negative path)

Deliberately break hook-kit and confirm new errors land:

1. In hook-kit, comment out one step in `tests/features/run-pipeline.steps.ts`.
2. Run `bun test`. Verify:
   - Error message includes `tests/features/run-pipeline.feature:NN`
   - Error message includes a copy-pasteable snippet
3. Restore the step. Run again — green.
4. Add a deliberately ambiguous step (`Given("the cart is empty", ...)` twice
   with same pattern). Verify error names both patterns + has `uri:line`.

### hook-kit smoke (env var)

1. Add `@smoke` tag to one scenario in hook-kit's feature.
2. Run `FEATS_TAGS="@smoke" bun test`. Confirm only that scenario runs (others
   are `skip`).
3. Run `FEATS_TAGS="not @smoke" bun test`. Confirm the inverse.

### hook-kit smoke (parens)

1. Add a second `@slow` tag to one scenario in addition to `@smoke`.
2. Run `FEATS_TAGS="(@smoke or @critical) and not @slow"`. Confirm scenario is
   skipped.
3. Run `FEATS_TAGS="not (@smoke and @slow)"`. Confirm scenario is skipped.

### Regression

- [ ] No existing feats test broke
- [ ] hook-kit's normal `bun test` (no env var, no broken steps) is identical to
      Phase 0 baseline

---

## Audit checklist

- [ ] `bun run lint && bun run typecheck && bun test` — clean
- [ ] `bash scripts/e2e-hook-kit.sh` — clean
- [ ] `/code-review` skill with effort=high on the Phase 1 diff
- [ ] CHANGELOG `Unreleased` → `[1.1.0] - YYYY-MM-DD` with all entries
- [ ] README updated with sections for: new error format, FEATS_TAGS, tag-filter
      parens, parameter types, World docs
- [ ] No file exceeds 200-line cap
- [ ] No new top-level export beyond what's listed above
- [ ] Performance: a 100-scenario run with `formatStepError` wrapping must not
      slow runs by more than 2% vs Phase 0 baseline (measure with hyperfine)

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `formatStepError`'s wrapped Error breaks user `instanceof` checks | low | We preserve `error.cause`; the original is still reachable. Document. |
| FEATS_TAGS env var leaks into other test runners | very low | Only `runFeatures()` reads it. |
| Tag-filter parens change tokenizer; could break existing flat expressions | medium | Comprehensive regression tests on flat expressions; commit baseline first. |
| Snippet placeholder substitution misidentifies parameters | low | Ship simple version (just `{string}` for quoted literals); iterate later. |

---

## Definition of done

1. All Phase 1 checkboxes ticked
2. Audit checklist fully green
3. `v1.1.0` tagged and published
4. hook-kit E2E negative-path scenarios documented in this file have been
   reproduced manually at least once
5. Phase 2 doc unblocked
