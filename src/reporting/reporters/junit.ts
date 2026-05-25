// src/reporting/reporters/junit.ts
//
// JUnit XML reporter. Jenkins / Maven-Surefire shape:
//   <testsuites name="feats" tests="N" failures="N" skipped="N" time="N">
//     <testsuite name="Feature" tests="N" failures="N" time="N">
//       <testcase name="Scenario" classname="Feature" time="N">
//         <failure message="...">...stack...</failure>  (when failed)
//         <skipped/>                                    (when pending/undefined)
//       </testcase>
//     </testsuite>
//   </testsuites>
//
// File written on onRunEnd. Constructor takes outFile (path). If the same
// path is reused in the same process (multi-file bun:test mode), construct
// throws — match D7 fail-fast behavior. Use the {n} placeholder for that
// case: `new JUnitReporter({ outFile: "junit-{n}.xml" })`.

import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FeatsReporter, FeatureResult, RunSummary } from "@/reporting/reporter";

// Module-scope registry so collisions across multiple JUnitReporter
// constructions in the same process are caught immediately.
const claimedPaths = new Set<string>();
let counter = 0;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function errorMessage(err: unknown): string {
  if (err instanceof AggregateError) {
    return err.errors.map(errorMessage).join("\n");
  }
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

export interface JUnitReporterOpts {
  /** Path to write the XML file. Use `{n}` for a 1-based instance counter
   *  if multiple JUnitReporter instances will run in the same process. */
  readonly outFile: string;
}

export class JUnitReporter implements FeatsReporter {
  private readonly outFile: string;
  private features: FeatureResult[] = [];

  constructor(opts: JUnitReporterOpts) {
    const resolved = opts.outFile.includes("{n}")
      ? opts.outFile.replace("{n}", String(++counter))
      : opts.outFile;
    if (claimedPaths.has(resolved)) {
      throw new Error(
        `JUnitReporter: outFile "${resolved}" was already claimed by another instance in this process. ` +
          `Use a {n} placeholder, e.g. \`outFile: "junit-{n}.xml"\`, when running under multi-file bun:test.`,
      );
    }
    claimedPaths.add(resolved);
    this.outFile = resolved;
  }

  onFeatureEnd(result: FeatureResult): void {
    this.features.push(result);
  }

  async onRunEnd(summary: RunSummary): Promise<void> {
    const xml = this.render(summary);
    const dir = dirname(this.outFile);
    if (dir !== "." && dir !== "" && !existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    await writeFile(this.outFile, xml, "utf-8");
  }

  // Public so callers can drive rendering without writing — useful in
  // tests and in the CLI binary (Phase 2c).
  render(summary: RunSummary): string {
    const lines: string[] = [];
    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(
      `<testsuites name="feats" tests="${summary.scenarios}" failures="${summary.failed}" skipped="${
        summary.skipped + summary.pending + summary.undefinedSteps
      }" time="${(summary.durationMs / 1000).toFixed(3)}">`,
    );

    for (const f of this.features) {
      const ftFailures = f.scenarios.filter((s) => s.status === "failed").length;
      const ftSkipped = f.scenarios.filter(
        (s) => s.status === "skipped" || s.status === "pending" || s.status === "undefined",
      ).length;
      lines.push(
        `  <testsuite name="${escapeXml(f.feature.name)}" tests="${f.scenarios.length}" failures="${ftFailures}" skipped="${ftSkipped}" time="${(f.durationMs / 1000).toFixed(3)}">`,
      );

      for (const s of f.scenarios) {
        const time = (s.durationMs / 1000).toFixed(3);
        lines.push(
          `    <testcase name="${escapeXml(s.scenario.name)}" classname="${escapeXml(f.feature.name)}" time="${time}">`,
        );
        if (s.status === "failed" && s.error !== undefined) {
          const msg = errorMessage(s.error);
          const firstLine = msg.split("\n")[0] ?? "Scenario failed";
          lines.push(
            `      <failure message="${escapeXml(firstLine)}">${escapeXml(msg)}</failure>`,
          );
        } else if (s.status === "pending" || s.status === "undefined" || s.status === "skipped") {
          lines.push(`      <skipped/>`);
        }
        lines.push(`    </testcase>`);
      }
      lines.push(`  </testsuite>`);
    }

    lines.push(`</testsuites>`);
    return lines.join("\n");
  }
}

// Internal: exposed for tests so they can reset the path-collision tracker
// between test runs without spawning subprocesses.
export function _resetJUnitPathRegistry(): void {
  claimedPaths.clear();
  counter = 0;
}
