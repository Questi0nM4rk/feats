// tests/reporting/reporters/junit.test.ts
//
// Tests are direct-invocation (no runFeatures end-to-end) — the contract
// suite covers the integration. Here we verify the XML shape, escaping,
// status mapping, and the path-collision fail-fast behavior.

import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Feature, ParsedStep, Scenario } from "@/parser/models";
import type { FeatureResult, RunSummary } from "@/reporting/reporter";
import { _resetJUnitPathRegistry, JUnitReporter } from "@/reporting/reporters/junit";

function makeFeature(name: string, tags: string[] = []): Feature {
  return {
    name,
    description: "",
    tags: tags.map((t) => ({ name: t })),
    background: undefined,
    scenarios: [],
    uri: "test.feature",
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
    location: { uri: "f", line },
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
  durationMs: 100,
};

describe("JUnitReporter — render", () => {
  test("emits a well-formed XML preamble + testsuites + testsuite", () => {
    _resetJUnitPathRegistry();
    const r = new JUnitReporter({ outFile: "/tmp/feats-junit-render-1.xml" });
    const feature = makeFeature("Checkout");
    const scenario = makeScenario("happy path");
    const stepResult = {
      step: makeStep("the cart is empty"),
      status: "passed" as const,
      durationMs: 1,
    };
    const fr: FeatureResult = {
      feature,
      scenarios: [
        {
          scenario,
          feature,
          status: "passed",
          steps: [stepResult],
          durationMs: 1,
        },
      ],
      durationMs: 1,
    };
    r.onFeatureEnd?.(fr);
    const xml = r.render(baseSummary);

    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<testsuites name="feats"');
    expect(xml).toContain('<testsuite name="Checkout"');
    expect(xml).toContain('<testcase name="happy path" classname="Checkout"');
  });

  test("failed scenario emits <failure> with the error message", () => {
    _resetJUnitPathRegistry();
    const r = new JUnitReporter({ outFile: "/tmp/feats-junit-render-2.xml" });
    const feature = makeFeature("F");
    const scenario = makeScenario("oops");
    const fr: FeatureResult = {
      feature,
      scenarios: [
        {
          scenario,
          feature,
          status: "failed",
          steps: [
            {
              step: makeStep("a step"),
              status: "failed",
              durationMs: 1,
              error: new Error("STEP_KABOOM"),
            },
          ],
          durationMs: 1,
          error: new Error("STEP_KABOOM"),
        },
      ],
      durationMs: 1,
    };
    r.onFeatureEnd?.(fr);
    const xml = r.render({ ...baseSummary, passed: 0, failed: 1 });
    // The "message" attribute is the FIRST line of the error stack (or its
    // .message when no stack). Error.stack's first line is "Error: <message>".
    expect(xml).toContain('<failure message="Error: STEP_KABOOM">');
    expect(xml).toContain("STEP_KABOOM");
    expect(xml).toContain("</failure>");
  });

  test("pending / undefined / skipped statuses emit <skipped/>", () => {
    _resetJUnitPathRegistry();
    const r = new JUnitReporter({ outFile: "/tmp/feats-junit-render-3.xml" });
    const feature = makeFeature("F");
    const fr: FeatureResult = {
      feature,
      scenarios: [
        {
          scenario: makeScenario("pending"),
          feature,
          status: "pending",
          steps: [],
          durationMs: 0,
        },
        {
          scenario: makeScenario("undefined"),
          feature,
          status: "undefined",
          steps: [],
          durationMs: 0,
        },
      ],
      durationMs: 0,
    };
    r.onFeatureEnd?.(fr);
    const xml = r.render({
      ...baseSummary,
      scenarios: 2,
      passed: 0,
      pending: 1,
      undefinedSteps: 1,
    });
    // Both should render as <skipped/>
    const matches = xml.match(/<skipped\s*\/>/g);
    expect(matches?.length).toBe(2);
  });

  test("XML special characters in scenario / feature names are escaped", () => {
    _resetJUnitPathRegistry();
    const r = new JUnitReporter({ outFile: "/tmp/feats-junit-render-4.xml" });
    const feature = makeFeature('AT&T "prod" <env>');
    const fr: FeatureResult = {
      feature,
      scenarios: [
        {
          scenario: makeScenario("name with 'apos' & <brackets>"),
          feature,
          status: "passed",
          steps: [],
          durationMs: 0,
        },
      ],
      durationMs: 0,
    };
    r.onFeatureEnd?.(fr);
    const xml = r.render(baseSummary);
    expect(xml).toContain("AT&amp;T &quot;prod&quot; &lt;env&gt;");
    expect(xml).toContain("name with &apos;apos&apos; &amp; &lt;brackets&gt;");
    // No raw `<` or `&` in attribute values (other than the legit element delimiters).
    expect(xml).not.toContain("name=\"name with 'apos' & <brackets>\"");
  });

  test("duration is in seconds with 3 decimal places", () => {
    _resetJUnitPathRegistry();
    const r = new JUnitReporter({ outFile: "/tmp/feats-junit-render-5.xml" });
    const feature = makeFeature("F");
    const fr: FeatureResult = {
      feature,
      scenarios: [
        {
          scenario: makeScenario("s"),
          feature,
          status: "passed",
          steps: [],
          durationMs: 1234.5,
        },
      ],
      durationMs: 1234.5,
    };
    r.onFeatureEnd?.(fr);
    const xml = r.render({ ...baseSummary, durationMs: 1234.5 });
    // toFixed(3) rounds 1.2345 to 1.234 (banker's rounding); 3 decimals always.
    expect(xml).toContain('time="1.234"');
  });
});

describe("JUnitReporter — file write", () => {
  test("onRunEnd writes the XML to the specified path", async () => {
    _resetJUnitPathRegistry();
    const dir = await mkdtemp(join(tmpdir(), "junit-write-"));
    const outFile = join(dir, "report.xml");
    const r = new JUnitReporter({ outFile });
    const feature = makeFeature("F");
    r.onFeatureEnd?.({
      feature,
      scenarios: [
        { scenario: makeScenario("s"), feature, status: "passed", steps: [], durationMs: 1 },
      ],
      durationMs: 1,
    });
    await r.onRunEnd?.(baseSummary);

    const written = await readFile(outFile, "utf-8");
    expect(written).toContain("<?xml");
    expect(written).toContain('<testsuite name="F"');
  });

  test("creates intermediate directories", async () => {
    _resetJUnitPathRegistry();
    const dir = await mkdtemp(join(tmpdir(), "junit-mkdir-"));
    const outFile = join(dir, "nested", "dirs", "report.xml");
    const r = new JUnitReporter({ outFile });
    r.onFeatureEnd?.({
      feature: makeFeature("F"),
      scenarios: [],
      durationMs: 0,
    });
    await r.onRunEnd?.(baseSummary);

    const written = await readFile(outFile, "utf-8");
    expect(written).toContain("<?xml");
  });
});

describe("JUnitReporter — path collision (D7 fail-fast)", () => {
  test("constructing two reporters with the same outFile in one process throws", () => {
    _resetJUnitPathRegistry();
    new JUnitReporter({ outFile: "/tmp/feats-junit-collide.xml" });
    expect(() => new JUnitReporter({ outFile: "/tmp/feats-junit-collide.xml" })).toThrow(
      /already claimed/,
    );
  });

  test("`{n}` placeholder yields unique paths for each instance", () => {
    _resetJUnitPathRegistry();
    const r1 = new JUnitReporter({ outFile: "/tmp/feats-junit-{n}.xml" });
    const r2 = new JUnitReporter({ outFile: "/tmp/feats-junit-{n}.xml" });
    // No throw — the {n} expands to "1" and "2".
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });
});
