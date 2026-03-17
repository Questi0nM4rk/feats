import { beforeEach, describe, expect, test } from "bun:test";
import type { ParsedStep } from "@/parser/models";
import { clearRegistry, Given, Then, When } from "@/registry/step-registry";
import { executeStep } from "@/runner/scenario-runner";

function makeStep(text: string, keyword: ParsedStep["keyword"] = "Given"): ParsedStep {
  return {
    keyword,
    text,
    dataTable: undefined,
    docString: undefined,
    location: { uri: "features/test.feature", line: 1 },
  };
}

beforeEach(() => {
  clearRegistry();
});

describe("executeStep", () => {
  test("invokes the matching step callback", async () => {
    let invoked = false;
    Given("a simple step", () => {
      invoked = true;
    });
    await executeStep({}, makeStep("a simple step"));
    expect(invoked).toBe(true);
  });

  test("passes world to the callback", async () => {
    let received: unknown;
    Given("a step with world", (world) => {
      received = world;
    });
    const world = { userId: "abc" };
    await executeStep(world, makeStep("a step with world"));
    expect(received).toBe(world);
  });

  test("passes extracted string argument to callback", async () => {
    let captured: unknown;
    When("I enter {string} as username", (_world, value) => {
      captured = value;
    });
    await executeStep({}, makeStep('I enter "alice" as username', "When"));
    expect(captured).toBe("alice");
  });

  test("passes extracted int argument to callback", async () => {
    let captured: unknown;
    Then("there are {int} items", (_world, count) => {
      captured = count;
    });
    await executeStep({}, makeStep("there are 7 items", "Then"));
    expect(captured).toBe(7);
  });

  test("passes multiple arguments to callback", async () => {
    const args: unknown[] = [];
    Given("I add {int} and {int}", (_world, a, b) => {
      args.push(a, b);
    });
    await executeStep({}, makeStep("I add 3 and 4"));
    expect(args).toEqual([3, 4]);
  });

  test("throws when no step definition matches", async () => {
    expect(executeStep({}, makeStep("an unregistered step"))).rejects.toThrow(/Undefined step/);
  });

  test("awaits async step callbacks", async () => {
    let resolved = false;
    Given("an async step", async () => {
      await Promise.resolve();
      resolved = true;
    });
    await executeStep({}, makeStep("an async step"));
    expect(resolved).toBe(true);
  });
});
