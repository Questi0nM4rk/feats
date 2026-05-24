// tests/reporting/from-env.test.ts

import { describe, expect, test } from "bun:test";
import { reportersFromEnv } from "@/reporting/from-env";
import {
  _resetCucumberJsonPathRegistry,
  CucumberJsonReporter,
} from "@/reporting/reporters/cucumber-json";
import { _resetJUnitPathRegistry, JUnitReporter } from "@/reporting/reporters/junit";
import { PrettyReporter } from "@/reporting/reporters/pretty";

describe("reportersFromEnv", () => {
  test("undefined / empty → empty array (no reporters)", () => {
    expect(reportersFromEnv(undefined)).toEqual([]);
    expect(reportersFromEnv("")).toEqual([]);
    expect(reportersFromEnv("   ")).toEqual([]);
  });

  test("'pretty' → one PrettyReporter", () => {
    const rs = reportersFromEnv("pretty");
    expect(rs).toHaveLength(1);
    expect(rs[0]).toBeInstanceOf(PrettyReporter);
  });

  test("'junit:path.xml' → one JUnitReporter", () => {
    _resetJUnitPathRegistry();
    const rs = reportersFromEnv("junit:/tmp/feats-env-junit.xml");
    expect(rs).toHaveLength(1);
    expect(rs[0]).toBeInstanceOf(JUnitReporter);
  });

  test("'cucumber-json:path.json' → one CucumberJsonReporter", () => {
    _resetCucumberJsonPathRegistry();
    const rs = reportersFromEnv("cucumber-json:/tmp/feats-env-cuc.json");
    expect(rs).toHaveLength(1);
    expect(rs[0]).toBeInstanceOf(CucumberJsonReporter);
  });

  test("comma-separated triple yields three reporters in order", () => {
    _resetJUnitPathRegistry();
    _resetCucumberJsonPathRegistry();
    const rs = reportersFromEnv(
      "pretty,junit:/tmp/feats-env-1.xml,cucumber-json:/tmp/feats-env-1.json",
    );
    expect(rs).toHaveLength(3);
    expect(rs[0]).toBeInstanceOf(PrettyReporter);
    expect(rs[1]).toBeInstanceOf(JUnitReporter);
    expect(rs[2]).toBeInstanceOf(CucumberJsonReporter);
  });

  test("whitespace around items is trimmed", () => {
    _resetJUnitPathRegistry();
    const rs = reportersFromEnv("  pretty , junit:/tmp/feats-env-ws.xml  ");
    expect(rs).toHaveLength(2);
  });

  test("unknown reporter name → throws with helpful message", () => {
    expect(() => reportersFromEnv("nonsense")).toThrow(/unknown reporter/);
  });

  test("'pretty' with an argument → throws (pretty takes no arg)", () => {
    expect(() => reportersFromEnv("pretty:foo")).toThrow(/takes no argument/);
  });

  test("'junit' without path → throws", () => {
    expect(() => reportersFromEnv("junit")).toThrow(/requires an output path/);
  });

  test("'cucumber-json' without path → throws", () => {
    expect(() => reportersFromEnv("cucumber-json")).toThrow(/requires an output path/);
  });
});
