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
- **Snippet placeholder substitution** (so generated snippets actually match
  parameterized steps, not just the literal example)
- Add `uri:line` context to ambiguous-step errors
- `FEATS_TAGS` env var as default `tagFilter`
- Tag-filter parens (`(@a or @b) and not @c`)
- `defineParameterType` documentation + canonical examples
- Documentation for `World` generics and shared step modules
- **Public exports moved from Phase 0** (test-isolation helpers and type guards
  — see §1.8 and §1.9). These force the minor bump to `1.1.0`.

## Out of scope

- Reporter interface (Phase 2)
- New keywords or lifecycle hooks (Phase 2)
- CLI binary (Phase 2)
- Anything that changes step-callback signatures

## Design contract for Phase 2

**Phase 1 wraps step errors via `new Error(formatStepError(step, err), { cause: err })`.
This is the `bun:test` rendering helper, not the runner's contract with reporters.**
When Phase 2 introduces the reporter interface, reporters receive the raw `step`
and raw `error` (the `cause`), not the wrapped Error. The wrap exists only so
that `bun:test`'s default reporter (when no Phase 2 reporters are registered)
shows Gherkin context. Document this in Phase 2 and in `docs/reporters.md`.

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

### 1.7 Snippet placeholder substitution (REQUIRED)

**Why this is no longer "optional":** Without substitution, the snippet for
`When I add "Widget" to the cart` is

```ts
When("I add \"Widget\" to the cart", async (world) => { /* ... */ });
```

This pattern matches *only* the literal string `"Widget"`. A user copying it
into their step file gets a step that breaks the next time the example changes
to `"Gadget"`. The whole point of wiring the snippet (§1.2) is to give users a
working starting point. Without substitution, we're shipping a half-feature.

**Substitution rules (start simple, expand cautiously):**

| In the step text  | Becomes in the pattern | Becomes in the callback args |
|-------------------|------------------------|------------------------------|
| `"..."` (any quoted string) | `{string}` | `arg1: string` |
| Bare integer `42` | `{int}`    | `arg2: number` |
| Bare decimal `3.14` | `{float}` | `arg3: number` |

Example: `When I add "Widget" 3 times for $9.99` →

```ts
When("I add {string} {int} times for ${float}", async (world, name, count, price) => {
  // TODO: implement
  throw new Error("Not implemented");
});
```

**Implementation:**
- New helper in `src/reporting/pending-steps.ts` that walks the step text,
  replaces matches with cucumber-expression placeholders, and accumulates the
  callback parameter list with sensibly-named args.
- Naming heuristic: derive from preceding word (`name`, `count`, `price`) or
  fall back to `arg1`, `arg2`, etc.

**Out of scope for Phase 1** (defer to future patch if useful):
- Custom parameter type detection (e.g., recognize `<email>` patterns)
- Plural detection
- Punctuation handling beyond basic quotes and numbers

**Tests:**
- [ ] Literal quoted string → `{string}` + named arg
- [ ] Bare integer → `{int}`
- [ ] Bare decimal → `{float}`
- [ ] Mixed: all three in one step
- [ ] No substitutable tokens → snippet unchanged (regression)
- [ ] Step with backslashes/quotes in non-substituted parts → still escaped correctly

- [ ] Implemented
- [ ] Tests pass
- [ ] hook-kit smoke: comment out a step in hook-kit, confirm generated
      snippet is copy-paste-correct without edits

### 1.8 New export: DataTable / DocString type guards

Moved here from Phase 0 (was 0.5) because new exports require a minor bump.

ai-guardrails' `tests/steps/suppress.steps.ts` does a runtime guard:
```ts
if (typeof (table as DataTable).asLists !== "function") { /* ... */ }
```
This signals the type isn't trusted at the boundary. Step callbacks receive
`...args: unknown[]`, so the consumer has to cast. Type guards close the gap
without changing the callback signature (which would be breaking).

```ts
// src/parser/models.ts — add at bottom
export function isDataTable(x: unknown): x is DataTable {
  return (
    typeof x === "object" &&
    x !== null &&
    "rows" in x &&
    typeof (x as DataTable).asObjects === "function" &&
    typeof (x as DataTable).asLists === "function"
  );
}

export function isDocString(x: unknown): x is string {
  return typeof x === "string";
}
```

- [ ] Added `isDataTable` and `isDocString` in `src/parser/models.ts`
- [ ] Re-exported from `src/feats.ts`
- [ ] Tested (positive: real DataTable; negative: plain object, null, undefined,
      string for isDataTable)
- [ ] Documented in README with a usage snippet showing the ai-guardrails-style
      pattern simplified

### 1.9 New exports: test-isolation helpers

Moved here from Phase 0 (was 0.6) because new exports require a minor bump.

The functions exist internally. Test files that mix step modules need a way
to reset between describe blocks.

- [ ] Re-export `clearRegistry` from `step-registry.ts` in `feats.ts`
- [ ] Re-export `clearHooks` from `hook-runner.ts` in `feats.ts`
- [ ] Re-export `clearParameterTypeRegistry` from `parameter-types.ts` in `feats.ts`
- [ ] Add a single convenience wrapper `resetFeats()` in a new
      `src/state/reset.ts` that calls all three
- [ ] Re-export `resetFeats` from `feats.ts`
- [ ] Document in README under a new "Test isolation" section, with a
      `beforeEach(resetFeats)` example

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
      parens, parameter types, World docs, test-isolation helpers
- [ ] No file exceeds 200-line cap
- [ ] Public exports added in this phase, no others: `clearRegistry`,
      `clearHooks`, `clearParameterTypeRegistry`, `resetFeats`, `isDataTable`,
      `isDocString`. Verify with `git diff v1.0.2 -- src/feats.ts`.
- [ ] Performance: `bun run bench` median time within 2% of
      `bench/baseline-1.0.2.json`; if exceeded, profile before merge
- [ ] Snippet substitution: paste a generated snippet from a hook-kit
      undefined-step error directly into the step file; it works without edits

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
