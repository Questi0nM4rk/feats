// src/reporting/from-env.ts
//
// Resolve FEATS_REPORTERS to a list of FeatsReporter instances.
//
// Spec (comma-separated):
//   pretty
//   junit:path/to/junit.xml
//   cucumber-json:path/to/cucumber.json
//
// Whitespace around items is trimmed. Empty / unset → empty array.
// Path values that don't already contain "{n}" are passed through verbatim
// — collision guards inside each reporter still apply if multiple
// runFeatures calls in the same process use the same spec.

import type { FeatsReporter } from "@/reporting/reporter";
import { CucumberJsonReporter } from "@/reporting/reporters/cucumber-json";
import { JUnitReporter } from "@/reporting/reporters/junit";
import { PrettyReporter } from "@/reporting/reporters/pretty";

const KNOWN_REPORTERS = new Set(["pretty", "junit", "cucumber-json"]);

export function reportersFromEnv(envValue: string | undefined): FeatsReporter[] {
  if (envValue === undefined) return [];
  const spec = envValue.trim();
  if (spec === "") return [];

  return spec.split(",").map((raw) => parseOne(raw.trim()));
}

function parseOne(item: string): FeatsReporter {
  const colonIdx = item.indexOf(":");
  const name = colonIdx === -1 ? item : item.slice(0, colonIdx);
  const arg = colonIdx === -1 ? "" : item.slice(colonIdx + 1);

  if (!KNOWN_REPORTERS.has(name)) {
    throw new Error(
      `FEATS_REPORTERS: unknown reporter "${name}". Known: ${[...KNOWN_REPORTERS].join(", ")}.`,
    );
  }

  switch (name) {
    case "pretty":
      if (arg !== "") {
        throw new Error(`FEATS_REPORTERS: "pretty" takes no argument (got ":${arg}")`);
      }
      return new PrettyReporter();
    case "junit":
      if (arg === "") {
        throw new Error(`FEATS_REPORTERS: "junit" requires an output path, e.g. "junit:out.xml"`);
      }
      return new JUnitReporter({ outFile: arg });
    case "cucumber-json":
      if (arg === "") {
        throw new Error(
          `FEATS_REPORTERS: "cucumber-json" requires an output path, e.g. "cucumber-json:out.json"`,
        );
      }
      return new CucumberJsonReporter({ outFile: arg });
    default:
      // Unreachable — KNOWN_REPORTERS guard above.
      throw new Error(`FEATS_REPORTERS: unhandled reporter "${name}"`);
  }
}
