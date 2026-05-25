// tests/reporting/reporters/cucumber-json.test.ts

import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Feature, ParsedStep, Scenario } from "@/parser/models";
import type { RunSummary, StepResult } from "@/reporting/reporter";
import {
  _resetCucumberJsonPathRegistry,
  CucumberJsonReporter,
} from "@/reporting/reporters/cucumber-json";

function makeFeature(name: string, tags: string[] = []): Feature {
  return {
    name,
    description: "Some description",
    tags: tags.map((t) => ({ name: t })),
    background: undefined,
    scenarios: [],
    uri: "tests/features/checkout.feature",
  };
}

function makeScenario(name: string, tags: string[] = []): Scenario {
  return { name, tags: tags.map((t) => ({ name: t })), steps: [] };
}

function makeStep(text: string, line = 1, keyword: ParsedStep["keyword"] = "Given"): ParsedStep {
  return {
    keyword,
    text,
    dataTable: undefined,
    docString: undefined,
    location: { uri: "tests/features/checkout.feature", line },
  };
}

const baseSummary: RunSummary = {
  features: 1,
  scenarios: 1,
  passed: 1,
  failed: 0,
  pending: 0,
  skipped: 0,
  undefinedSteps: 0,
  durationMs: 50,
};

describe("CucumberJsonReporter — render", () => {
  test("emits a top-level array with one feature object", () => {
    _resetCucumberJsonPathRegistry();
    const r = new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-1.json" });
    r.onFeatureEnd?.({
      feature: makeFeature("Checkout", ["@smoke"]),
      scenarios: [],
      durationMs: 0,
    });
    const json = r.render();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(1);
    expect(json[0]?.name).toBe("Checkout");
    expect(json[0]?.uri).toBe("tests/features/checkout.feature");
    expect(json[0]?.keyword).toBe("Feature");
    expect(json[0]?.tags?.[0]?.name).toBe("@smoke");
  });

  test("scenarios appear under `elements` with type='scenario'", () => {
    _resetCucumberJsonPathRegistry();
    const r = new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-2.json" });
    const feature = makeFeature("F");
    const scenario = makeScenario("happy", ["@critical"]);
    r.onFeatureEnd?.({
      feature,
      scenarios: [
        {
          scenario,
          feature,
          status: "passed",
          steps: [],
          durationMs: 1,
        },
      ],
      durationMs: 1,
    });
    const json = r.render();
    expect(json[0]?.elements).toHaveLength(1);
    expect(json[0]?.elements?.[0]?.name).toBe("happy");
    expect(json[0]?.elements?.[0]?.type).toBe("scenario");
    expect(json[0]?.elements?.[0]?.keyword).toBe("Scenario");
    expect(json[0]?.elements?.[0]?.tags?.[0]?.name).toBe("@critical");
  });

  test("step keyword has a trailing space (cucumber-js convention)", () => {
    _resetCucumberJsonPathRegistry();
    const r = new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-3.json" });
    const feature = makeFeature("F");
    const sr: StepResult = {
      step: makeStep("the cart is empty", 5, "Given"),
      status: "passed",
      durationMs: 1.234,
    };
    r.onFeatureEnd?.({
      feature,
      scenarios: [
        {
          scenario: makeScenario("s"),
          feature,
          status: "passed",
          steps: [sr],
          durationMs: 1.234,
        },
      ],
      durationMs: 1.234,
    });
    const json = r.render();
    const step = json[0]?.elements?.[0]?.steps?.[0];
    expect(step?.keyword).toBe("Given ");
    expect(step?.name).toBe("the cart is empty");
    expect(step?.line).toBe(5);
  });

  test("duration is in nanoseconds (cucumber-js convention)", () => {
    _resetCucumberJsonPathRegistry();
    const r = new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-4.json" });
    const feature = makeFeature("F");
    const sr: StepResult = {
      step: makeStep("a step"),
      status: "passed",
      durationMs: 2.5, // 2.5 ms = 2,500,000 ns
    };
    r.onFeatureEnd?.({
      feature,
      scenarios: [
        {
          scenario: makeScenario("s"),
          feature,
          status: "passed",
          steps: [sr],
          durationMs: 2.5,
        },
      ],
      durationMs: 2.5,
    });
    const json = r.render();
    expect(json[0]?.elements?.[0]?.steps?.[0]?.result?.duration).toBe(2_500_000);
  });

  test("failed step includes error_message", () => {
    _resetCucumberJsonPathRegistry();
    const r = new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-5.json" });
    const feature = makeFeature("F");
    const err = new Error("STEP_BOOM");
    const sr: StepResult = {
      step: makeStep("a failing step"),
      status: "failed",
      durationMs: 1,
      error: err,
    };
    r.onFeatureEnd?.({
      feature,
      scenarios: [
        {
          scenario: makeScenario("s"),
          feature,
          status: "failed",
          steps: [sr],
          durationMs: 1,
        },
      ],
      durationMs: 1,
    });
    const json = r.render();
    const result = json[0]?.elements?.[0]?.steps?.[0]?.result;
    expect(result?.status).toBe("failed");
    expect(result?.error_message).toContain("STEP_BOOM");
  });

  test("passed step has no error_message field", () => {
    _resetCucumberJsonPathRegistry();
    const r = new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-6.json" });
    const feature = makeFeature("F");
    r.onFeatureEnd?.({
      feature,
      scenarios: [
        {
          scenario: makeScenario("s"),
          feature,
          status: "passed",
          steps: [{ step: makeStep("a step"), status: "passed", durationMs: 1 }],
          durationMs: 1,
        },
      ],
      durationMs: 1,
    });
    const json = r.render();
    const result = json[0]?.elements?.[0]?.steps?.[0]?.result;
    expect(result?.status).toBe("passed");
    expect("error_message" in (result ?? {})).toBe(false);
  });

  test("ids are slugified from names", () => {
    _resetCucumberJsonPathRegistry();
    const r = new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-7.json" });
    r.onFeatureEnd?.({
      feature: makeFeature("Shopping Cart Checkout"),
      scenarios: [
        {
          scenario: makeScenario("Add 'Widget' to the cart!"),
          feature: makeFeature("Shopping Cart Checkout"),
          status: "passed",
          steps: [],
          durationMs: 0,
        },
      ],
      durationMs: 0,
    });
    const json = r.render();
    expect(json[0]?.id).toBe("shopping-cart-checkout");
    // Scenario id is `${featureId};${slugified scenario name}`
    expect(json[0]?.elements?.[0]?.id).toBe("shopping-cart-checkout;add-widget-to-the-cart");
  });
});

describe("CucumberJsonReporter — file write", () => {
  test("onRunEnd writes the JSON file", async () => {
    _resetCucumberJsonPathRegistry();
    const dir = await mkdtemp(join(tmpdir(), "cuc-json-write-"));
    const outFile = join(dir, "report.json");
    const r = new CucumberJsonReporter({ outFile });
    const feature = makeFeature("F");
    r.onFeatureEnd?.({
      feature,
      scenarios: [
        {
          scenario: makeScenario("s"),
          feature,
          status: "passed",
          steps: [],
          durationMs: 0,
        },
      ],
      durationMs: 0,
    });
    await r.onRunEnd?.(baseSummary);

    const written = await readFile(outFile, "utf-8");
    const parsed = JSON.parse(written) as { name: string }[];
    expect(parsed[0]?.name).toBe("F");
  });
});

describe("CucumberJsonReporter — path collision (D7 fail-fast)", () => {
  test("constructing two reporters with the same outFile throws", () => {
    _resetCucumberJsonPathRegistry();
    new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-collide.json" });
    expect(() => new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-collide.json" })).toThrow(
      /already claimed/,
    );
  });

  test("`{n}` placeholder works", () => {
    _resetCucumberJsonPathRegistry();
    const r1 = new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-{n}.json" });
    const r2 = new CucumberJsonReporter({ outFile: "/tmp/feats-cuc-{n}.json" });
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });
});
