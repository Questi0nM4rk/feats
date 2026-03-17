import { beforeEach, describe, expect, test } from "bun:test";
import { clearRegistry, Given, getRegistry, Step, Then, When } from "@/registry/step-registry";

beforeEach(() => {
  clearRegistry();
});

describe("clearRegistry", () => {
  test("empties all registered definitions", () => {
    Given("a step", () => {});
    clearRegistry();
    expect(getRegistry().getAll()).toHaveLength(0);
  });
});

describe("Given", () => {
  test("registers a definition with Given keyword", () => {
    Given("a {string} input", async () => {});
    const defs = getRegistry().getAll();
    expect(defs).toHaveLength(1);
    expect(defs[0]?.keyword).toBe("Given");
    expect(defs[0]?.pattern).toBe("a {string} input");
  });
});

describe("When", () => {
  test("registers a definition with When keyword", () => {
    When("I do something", () => {});
    const defs = getRegistry().getAll();
    expect(defs).toHaveLength(1);
    expect(defs[0]?.keyword).toBe("When");
  });
});

describe("Then", () => {
  test("registers a definition with Then keyword", () => {
    Then("the result is {int}", () => {});
    const defs = getRegistry().getAll();
    expect(defs).toHaveLength(1);
    expect(defs[0]?.keyword).toBe("Then");
  });
});

describe("Step", () => {
  test("registers a definition with Step keyword", () => {
    Step("a universal step", () => {});
    const defs = getRegistry().getAll();
    expect(defs).toHaveLength(1);
    expect(defs[0]?.keyword).toBe("Step");
  });
});

describe("multiple registrations", () => {
  test("all definitions accumulate in order", () => {
    Given("setup", () => {});
    When("action", () => {});
    Then("assertion", () => {});

    const defs = getRegistry().getAll();
    expect(defs).toHaveLength(3);
    expect(defs[0]?.keyword).toBe("Given");
    expect(defs[1]?.keyword).toBe("When");
    expect(defs[2]?.keyword).toBe("Then");
  });
});

describe("callback", () => {
  test("callback is stored and callable", async () => {
    let called = false;
    Given("a step", async () => {
      called = true;
    });
    const def = getRegistry().getAll()[0];
    await def?.callback({});
    expect(called).toBe(true);
  });

  test("callback receives world as first argument", async () => {
    let receivedWorld: unknown;
    Given("a step", (world) => {
      receivedWorld = world;
    });
    const world = { userId: "test-123" };
    const def = getRegistry().getAll()[0];
    await def?.callback(world);
    expect(receivedWorld).toBe(world);
  });
});
