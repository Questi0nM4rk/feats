// bench/run.ts
//
// Runs the synthetic feature parser N times, records median + p95 in ms.
// Designed to be invoked as: `bun run bench`
//
// Writes a JSON report to bench/last-run.json with shape:
//   { iterations, scenarioCount, medianMs, p95Ms, gitRev }
//
// CI compares median across two runs on the same machine. The committed
// baseline-1.x.x.json is an *informational* artifact; absolute numbers
// across machines are not directly comparable.

import { writeFileSync } from "node:fs";
import { generateSyntheticFeature } from "./synthetic";

const ITERATIONS = Number(process.env.FEATS_BENCH_ITERATIONS ?? "30");
const SCENARIO_COUNT = Number(process.env.FEATS_BENCH_SCENARIOS ?? "100");

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const lo = sorted[mid - 1] ?? 0;
    const hi = sorted[mid] ?? 0;
    return (lo + hi) / 2;
  }
  return sorted[mid] ?? 0;
}

function percentile(xs: number[], p: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

const samples: number[] = [];
for (let i = 0; i < ITERATIONS; i++) {
  const start = performance.now();
  const feature = generateSyntheticFeature(SCENARIO_COUNT);
  // Touch the result so JIT can't dead-code-eliminate the parse work.
  if (feature.scenarios.length === 0) throw new Error("bench produced 0 scenarios");
  samples.push(performance.now() - start);
}

const med = median(samples);
const p95 = percentile(samples, 95);

const report = {
  iterations: ITERATIONS,
  scenarioCount: SCENARIO_COUNT,
  medianMs: Number(med.toFixed(3)),
  p95Ms: Number(p95.toFixed(3)),
  timestamp: new Date().toISOString(),
};

const outPath = new URL("./last-run.json", import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(
  `bench: ${ITERATIONS} iters × ${SCENARIO_COUNT} scenarios — median ${med.toFixed(2)}ms, p95 ${p95.toFixed(2)}ms`,
);
console.log(`report → ${outPath}`);
