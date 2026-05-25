// src/reporting/reporters/cucumber-json.ts
//
// Cucumber JSON reporter. Shape matches cucumber-js's output, which is
// what `cucumber-html-reporter` and most other JSON consumers expect:
//
//   [
//     {
//       uri: "tests/features/checkout.feature",
//       id: "shopping-cart-checkout",
//       name: "Shopping cart checkout",
//       tags: [{ name: "@smoke", line: 1 }],
//       elements: [
//         {
//           id: "shopping-cart-checkout;add-item",
//           keyword: "Scenario",
//           name: "Add item",
//           type: "scenario",
//           tags: [],
//           steps: [
//             {
//               keyword: "Given ",
//               name: "the cart is empty",
//               line: 5,
//               result: { status: "passed", duration: 1234567 }
//             },
//             ...
//           ]
//         }
//       ]
//     }
//   ]
//
// duration is in NANOSECONDS (the cucumber-js convention).

import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  FeatsReporter,
  FeatureResult,
  RunSummary,
  ScenarioResult,
  StepResult,
} from "@/reporting/reporter";

const claimedPaths = new Set<string>();
let counter = 0;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function nsFromMs(ms: number): number {
  return Math.round(ms * 1_000_000);
}

function statusForJson(s: StepResult["status"]): string {
  // cucumber-js statuses: passed, failed, skipped, pending, undefined, ambiguous
  return s;
}

interface JsonStep {
  readonly keyword: string;
  readonly name: string;
  readonly line: number;
  readonly result: {
    readonly status: string;
    readonly duration: number;
    readonly error_message?: string;
  };
}

interface JsonScenario {
  readonly id: string;
  readonly keyword: string;
  readonly name: string;
  readonly type: string;
  readonly tags: { readonly name: string; readonly line: number }[];
  readonly steps: JsonStep[];
}

interface JsonFeature {
  readonly uri: string;
  readonly id: string;
  readonly keyword: string;
  readonly name: string;
  readonly description: string;
  readonly tags: { readonly name: string; readonly line: number }[];
  readonly elements: JsonScenario[];
}

function errorMessage(err: unknown): string {
  if (err instanceof AggregateError) {
    return err.errors.map(errorMessage).join("\n");
  }
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

export interface CucumberJsonReporterOpts {
  /** Path to write the JSON file. Use `{n}` for a 1-based instance counter
   *  if multiple instances will run in the same process. */
  readonly outFile: string;
}

export class CucumberJsonReporter implements FeatsReporter {
  private readonly outFile: string;
  private features: FeatureResult[] = [];

  constructor(opts: CucumberJsonReporterOpts) {
    const resolved = opts.outFile.includes("{n}")
      ? opts.outFile.replace("{n}", String(++counter))
      : opts.outFile;
    if (claimedPaths.has(resolved)) {
      throw new Error(
        `CucumberJsonReporter: outFile "${resolved}" was already claimed by another instance in this process. ` +
          `Use a {n} placeholder when running under multi-file bun:test.`,
      );
    }
    claimedPaths.add(resolved);
    this.outFile = resolved;
  }

  onFeatureEnd(result: FeatureResult): void {
    this.features.push(result);
  }

  async onRunEnd(_summary: RunSummary): Promise<void> {
    const json = this.render();
    const dir = dirname(this.outFile);
    if (dir !== "." && dir !== "" && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    await writeFile(this.outFile, JSON.stringify(json, null, 2), "utf-8");
  }

  render(): JsonFeature[] {
    return this.features.map((f) => this.featureToJson(f));
  }

  private featureToJson(f: FeatureResult): JsonFeature {
    const featureId = slugify(f.feature.name);
    return {
      uri: f.feature.uri,
      id: featureId,
      keyword: "Feature",
      name: f.feature.name,
      description: f.feature.description,
      tags: f.feature.tags.map((t) => ({ name: t.name, line: 1 })),
      elements: f.scenarios.map((s) => this.scenarioToJson(s, featureId)),
    };
  }

  private scenarioToJson(s: ScenarioResult, featureId: string): JsonScenario {
    return {
      id: `${featureId};${slugify(s.scenario.name)}`,
      keyword: "Scenario",
      name: s.scenario.name,
      type: "scenario",
      tags: s.scenario.tags.map((t) => ({ name: t.name, line: 1 })),
      steps: s.steps.map((sr) => this.stepToJson(sr)),
    };
  }

  private stepToJson(sr: StepResult): JsonStep {
    return {
      // cucumber-js convention: keyword has a trailing space ("Given ", "When ", "Then ")
      keyword: `${sr.step.keyword} `,
      name: sr.step.text,
      line: sr.step.location.line,
      result: {
        status: statusForJson(sr.status),
        duration: nsFromMs(sr.durationMs),
        ...(sr.error !== undefined ? { error_message: errorMessage(sr.error) } : {}),
      },
    };
  }
}

export function _resetCucumberJsonPathRegistry(): void {
  claimedPaths.clear();
  counter = 0;
}
