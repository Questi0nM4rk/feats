// src/reporting/reporters/pretty.ts
//
// Human-readable console reporter. One line per step with status icon and
// duration. Failed scenarios get the Gherkin step context + the raw error
// message indented underneath. Honors NO_COLOR and !process.stdout.isTTY.

import type { Feature, Scenario } from "@/parser/models";
import type {
  FeatsReporter,
  FeatureResult,
  RunSummary,
  ScenarioResult,
  StepResult,
} from "@/reporting/reporter";

const ENABLE_COLOR =
  process.env.NO_COLOR === undefined &&
  process.env.NO_COLOR !== "" &&
  process.stdout.isTTY === true;

const RESET = "\x1b[0m";
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
} as const;

function color(name: keyof typeof colors, s: string): string {
  if (!ENABLE_COLOR) return s;
  return `${colors[name]}${s}${RESET}`;
}

function statusIcon(status: StepResult["status"]): string {
  switch (status) {
    case "passed":
      return color("green", "✓");
    case "failed":
      return color("red", "✗");
    case "skipped":
      return color("dim", "−");
    case "pending":
      return color("yellow", "~");
    case "undefined":
      return color("yellow", "?");
  }
}

function fmtDuration(ms: number): string {
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function errorMessage(err: unknown): string {
  if (err instanceof AggregateError) {
    return err.errors.map(errorMessage).join("\n");
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface PrettyReporterOpts {
  /** Override the output stream (defaults to process.stdout). */
  readonly write?: (chunk: string) => void;
}

export class PrettyReporter implements FeatsReporter {
  private readonly write: (chunk: string) => void;
  private failedScenarios: { feature: string; scenario: string; error: unknown }[] = [];

  constructor(opts?: PrettyReporterOpts) {
    this.write = opts?.write ?? ((chunk) => process.stdout.write(chunk));
  }

  onFeatureStart(feature: Feature): void {
    this.write(`\n${color("bold", `Feature: ${feature.name}`)}\n`);
  }

  onScenarioStart(scenario: Scenario, _feature: Feature): void {
    this.write(`\n  ${color("cyan", `Scenario: ${scenario.name}`)}\n`);
  }

  onStep(result: StepResult): void {
    const icon = statusIcon(result.status);
    const keyword = result.step.keyword;
    const dur =
      result.status === "skipped" ? "" : `  ${color("dim", `(${fmtDuration(result.durationMs)})`)}`;
    this.write(`    ${icon} ${keyword} ${result.step.text}${dur}\n`);

    if (result.status === "failed" && result.error !== undefined) {
      const loc = `${result.step.location.uri}:${result.step.location.line}`;
      this.write(`        ${color("dim", loc)}\n`);
      this.write(`        ${color("red", errorMessage(result.error))}\n`);
    } else if (result.status === "undefined" && result.error !== undefined) {
      // matchStep's error includes uri:line and a snippet — already formatted.
      this.write(`        ${color("yellow", errorMessage(result.error))}\n`);
    }
  }

  onScenarioEnd(result: ScenarioResult): void {
    if (result.status === "failed" && result.error !== undefined) {
      this.failedScenarios.push({
        feature: result.feature.name,
        scenario: result.scenario.name,
        error: result.error,
      });
    }
  }

  onFeatureEnd(_result: FeatureResult): void {
    // Nothing extra — per-feature totals are visible from the rendered output.
  }

  onRunEnd(summary: RunSummary): void {
    const parts: string[] = [];
    parts.push(`${summary.features} feature${summary.features === 1 ? "" : "s"}`);
    parts.push(`${summary.scenarios} scenario${summary.scenarios === 1 ? "" : "s"}`);

    const counts: string[] = [];
    if (summary.passed > 0) counts.push(color("green", `${summary.passed} passed`));
    if (summary.failed > 0) counts.push(color("red", `${summary.failed} failed`));
    if (summary.pending > 0) counts.push(color("yellow", `${summary.pending} pending`));
    if (summary.skipped > 0) counts.push(color("dim", `${summary.skipped} skipped`));
    if (summary.undefinedSteps > 0)
      counts.push(color("yellow", `${summary.undefinedSteps} undefined`));

    const tally = counts.length > 0 ? ` (${counts.join(", ")})` : "";
    this.write(`\n${parts.join(", ")}${tally} — ${fmtDuration(summary.durationMs)}\n`);

    if (this.failedScenarios.length > 0) {
      this.write(`\n${color("bold", "Failures:")}\n`);
      for (const { feature, scenario, error } of this.failedScenarios) {
        this.write(`  ${color("red", `✗ ${feature} > ${scenario}`)}\n`);
        const msg = errorMessage(error)
          .split("\n")
          .map((line) => `      ${line}`)
          .join("\n");
        this.write(`${msg}\n`);
      }
    }
  }
}
