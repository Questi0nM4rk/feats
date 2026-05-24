// reset.test.ts
//
// Tests for resetFeats() and the test-isolation export trio
// (clearRegistry / clearHooks / clearParameterTypeRegistry). All four are
// new public exports in §1.9.
//
// Every test starts with `resetFeats()` so a failure in one cannot leak
// shared module state into the next (the very property under test).

import { beforeEach, describe, expect, test } from "bun:test";
import { defineParameterType, getParameterTypeRegistry } from "@/registry/parameter-types";
import { Given, getRegistry } from "@/registry/step-registry";
import { After, Before, getAfterHooks, getBeforeHooks } from "@/runner/hook-runner";
import { resetFeats } from "@/state/reset";

describe("resetFeats", () => {
  beforeEach(() => {
    resetFeats();
  });

  test("clears the step registry", () => {
    Given("a step that should be cleared", () => {});
    expect(getRegistry().getAll().length).toBeGreaterThan(0);
    resetFeats();
    expect(getRegistry().getAll()).toHaveLength(0);
  });

  test("clears Before and After hooks", () => {
    Before(() => {});
    After(() => {});
    expect(getBeforeHooks().length).toBeGreaterThan(0);
    expect(getAfterHooks().length).toBeGreaterThan(0);
    resetFeats();
    expect(getBeforeHooks()).toHaveLength(0);
    expect(getAfterHooks()).toHaveLength(0);
  });

  test("clears custom parameter types", () => {
    defineParameterType({
      name: "uniqueResetType",
      regexp: /xyz/,
      transformer: (s) => s,
    });
    const beforeReset = getParameterTypeRegistry();
    // ParameterTypeRegistry doesn't expose a list method we can rely on, so
    // we check by attempting to look up the parameter type — if defined, it
    // throws on re-define.
    expect(() =>
      defineParameterType({
        name: "uniqueResetType",
        regexp: /xyz/,
        transformer: (s) => s,
      }),
    ).toThrow();
    resetFeats();
    // After reset, re-defining with the same name must succeed.
    const afterReset = getParameterTypeRegistry();
    expect(afterReset).not.toBe(beforeReset); // registry instance replaced
    expect(() =>
      defineParameterType({
        name: "uniqueResetType",
        regexp: /xyz/,
        transformer: (s) => s,
      }),
    ).not.toThrow();
  });

  test("calling resetFeats on already-empty state is a no-op", () => {
    resetFeats();
    resetFeats();
    expect(getRegistry().getAll()).toHaveLength(0);
    expect(getBeforeHooks()).toHaveLength(0);
    expect(getAfterHooks()).toHaveLength(0);
  });
});
