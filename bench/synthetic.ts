// bench/synthetic.ts
//
// Generates a synthetic Feature with N scenarios for perf benchmarking.
// Pure in-memory — no I/O — so timing reflects parser + runner cost only.

import { parseFeature } from "@/parser/adapter";
import type { Feature } from "@/parser/models";

export function generateSyntheticFeature(scenarioCount: number): Feature {
  const scenarios: string[] = [];
  for (let i = 0; i < scenarioCount; i++) {
    scenarios.push(
      `  Scenario: Scenario ${i}\n    Given counter is ${i}\n    When increment by ${i + 1}\n    Then counter equals ${i * 2 + 1}\n`,
    );
  }
  const outline = `
  Scenario Outline: Outline computation
    Given counter is <a>
    When increment by <b>
    Then counter equals <c>

    Examples:
      | a  | b  | c  |
      | 1  | 2  | 3  |
      | 5  | 5  | 10 |
      | 10 | 0  | 10 |
      | 7  | 3  | 10 |
      | 4  | 6  | 10 |
      | 1  | 9  | 10 |
      | 2  | 8  | 10 |
      | 3  | 7  | 10 |
      | 8  | 2  | 10 |
      | 9  | 1  | 10 |
`;
  const source = `Feature: Synthetic perf bench
  Background:
    Given counter is 0

${scenarios.join("")}
${outline}
`;
  return parseFeature(source, "bench/synthetic.feature");
}
