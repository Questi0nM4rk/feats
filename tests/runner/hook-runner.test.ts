import { beforeEach, describe, expect, test } from "bun:test";
import { After, Before, clearHooks, getAfterHooks, getBeforeHooks } from "@/runner/hook-runner";

beforeEach(() => {
  clearHooks();
});

describe("clearHooks", () => {
  test("removes all before and after hooks", () => {
    Before(() => {});
    After(() => {});
    clearHooks();
    expect(getBeforeHooks()).toHaveLength(0);
    expect(getAfterHooks()).toHaveLength(0);
  });
});

describe("Before", () => {
  test("registers a hook without tag filter", () => {
    Before(() => {});
    const hooks = getBeforeHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]?.tagFilter).toBeUndefined();
  });

  test("registers a hook with tag filter", () => {
    Before("@smoke", () => {});
    const hooks = getBeforeHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]?.tagFilter).toBe("@smoke");
  });

  test("callback is stored and callable", async () => {
    let called = false;
    Before(async () => {
      called = true;
    });
    const hook = getBeforeHooks()[0];
    await hook?.callback({});
    expect(called).toBe(true);
  });

  test("callback with tag filter is stored", async () => {
    let calledWith: unknown;
    Before("@fast", (world) => {
      calledWith = world;
    });
    const world = { id: "test" };
    const hook = getBeforeHooks()[0];
    await hook?.callback(world);
    expect(calledWith).toBe(world);
  });

  test("multiple Before hooks accumulate in order", () => {
    Before(() => {});
    Before("@smoke", () => {});
    Before(async () => {});
    expect(getBeforeHooks()).toHaveLength(3);
  });
});

describe("After", () => {
  test("registers a hook without tag filter", () => {
    After(() => {});
    const hooks = getAfterHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]?.tagFilter).toBeUndefined();
  });

  test("registers a hook with tag filter", () => {
    After("@wip", () => {});
    const hooks = getAfterHooks();
    expect(hooks).toHaveLength(1);
    expect(hooks[0]?.tagFilter).toBe("@wip");
  });

  test("callback is stored and callable", async () => {
    let called = false;
    After(async () => {
      called = true;
    });
    const hook = getAfterHooks()[0];
    await hook?.callback({});
    expect(called).toBe(true);
  });

  test("Before and After hooks are stored independently", () => {
    Before(() => {});
    After(() => {});
    expect(getBeforeHooks()).toHaveLength(1);
    expect(getAfterHooks()).toHaveLength(1);
  });
});

describe("hook execution order", () => {
  test("before hooks run in registration order", async () => {
    const order: number[] = [];
    Before(() => {
      order.push(1);
    });
    Before(() => {
      order.push(2);
    });
    Before(() => {
      order.push(3);
    });

    const world = {};
    for (const hook of getBeforeHooks()) {
      await hook.callback(world);
    }
    expect(order).toEqual([1, 2, 3]);
  });

  test("after hooks run in registration order", async () => {
    const order: number[] = [];
    After(() => {
      order.push(1);
    });
    After(() => {
      order.push(2);
    });

    const world = {};
    for (const hook of getAfterHooks()) {
      await hook.callback(world);
    }
    expect(order).toEqual([1, 2]);
  });
});
