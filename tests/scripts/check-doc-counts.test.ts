// Unit tests for the doc-count drift guard's PURE logic.
//
// The guard script (scripts/check-doc-counts.ts) runs `bun test` in a
// subprocess to get the source-of-truth test count. That execution is
// deliberately NOT exercised here: this file lives under tests/, and running
// `bun test` from within `bun test` would recurse. We test only the pure
// parse + compare functions, which carry all the drift logic. The subprocess
// call is a thin shell around `parseRanCount`, which IS tested.

import { describe, expect, test } from "bun:test";
import {
  extractTestCountClaims,
  extractVersionMarkers,
  findTestCountMismatches,
  findVersionMarkerMismatches,
  parseRanCount,
} from "../../scripts/check-doc-counts.js";

describe("parseRanCount", () => {
  test("extracts the count from a bun test summary line", () => {
    const out = " 356 pass\n 0 fail\nRan 356 tests across 33 files. [2.57s]";
    expect(parseRanCount(out)).toBe(356);
  });

  test("handles the count appearing with no surrounding pass/fail lines", () => {
    expect(parseRanCount("Ran 7 tests across 1 files. [1.00ms]")).toBe(7);
  });

  test("returns the last match when the phrase appears more than once", () => {
    // Defensive: bun prints one summary, but a wrapper could echo an earlier
    // partial. The final 'Ran N tests' is the authoritative total.
    const out = "Ran 10 tests across 2 files.\n...\nRan 356 tests across 33 files.";
    expect(parseRanCount(out)).toBe(356);
  });

  test("returns null when no summary line is present", () => {
    expect(parseRanCount("error: something blew up\nno summary here")).toBeNull();
  });

  test("returns null on an empty string", () => {
    expect(parseRanCount("")).toBeNull();
  });
});

describe("extractTestCountClaims", () => {
  test("matches a bare 'N tests' claim", () => {
    expect(extractTestCountClaims("bun test  # 356 tests")).toEqual([356]);
  });

  test("matches an 'N TypeScript tests' claim", () => {
    expect(extractTestCountClaims("- **356 TypeScript tests** via bun test")).toEqual([356]);
  });

  test("collects every claim in a document", () => {
    const content = "245 tests here\nand 356 TypeScript tests there";
    expect(extractTestCountClaims(content)).toEqual([245, 356]);
  });

  test("does not match an 'N Go tests' phrase as a TypeScript claim", () => {
    // The pattern matches 'N tests' / 'N TypeScript tests' only. A word other
    // than 'TypeScript' between the number and 'tests' (here 'Go') breaks the
    // match, so the number is NOT captured.
    expect(extractTestCountClaims("**52 Go tests**")).toEqual([]);
  });

  test("returns an empty array when there is no claim", () => {
    expect(extractTestCountClaims("no counts in this prose at all")).toEqual([]);
  });
});

describe("findTestCountMismatches", () => {
  const docs = [
    { path: "README.md", content: "- **356 TypeScript tests**" },
    { path: "CLAUDE.md", content: "bun test  # 356 tests" },
  ];

  test("reports no violations when every claim matches the truth", () => {
    expect(findTestCountMismatches(356, docs)).toEqual([]);
  });

  test("reports a violation for a stale claim", () => {
    const stale = [{ path: "README.md", content: "- **245 TypeScript tests**" }];
    const v = findTestCountMismatches(356, stale);
    expect(v).toHaveLength(1);
    expect(v[0]?.detail).toContain("README.md");
    expect(v[0]?.detail).toContain("245");
    expect(v[0]?.detail).toContain("356");
  });

  test("reports one violation per mismatched claim across docs", () => {
    const mixed = [
      { path: "README.md", content: "245 tests" },
      { path: "CLAUDE.md", content: "356 tests" },
    ];
    expect(findTestCountMismatches(356, mixed)).toHaveLength(1);
  });

  test("a doc with no claim is fine (not every doc carries a count)", () => {
    const partial = [
      { path: "README.md", content: "- **356 TypeScript tests**" },
      { path: "CLAUDE.md", content: "no count in this one" },
    ];
    expect(findTestCountMismatches(356, partial)).toEqual([]);
  });
});

describe("extractVersionMarkers", () => {
  test("captures a 'Current: vX.Y.Z' marker", () => {
    expect(extractVersionMarkers("Current: v1.3.0")).toEqual(["1.3.0"]);
  });

  test("captures a 'Status: X.Y.Z' marker without the v prefix", () => {
    expect(extractVersionMarkers("Status: 1.2.3")).toEqual(["1.2.3"]);
  });

  test("captures multiple markers", () => {
    expect(extractVersionMarkers("Current: v1.3.0\nStatus:  v1.3.0")).toEqual(["1.3.0", "1.3.0"]);
  });

  test("ignores plain version strings that are not Current/Status markers", () => {
    // The npm badge and prose mentions of versions must NOT trip the guard;
    // only the hardcoded Current:/Status: markers do.
    expect(extractVersionMarkers("shipped in v1.3.0; see the badge")).toEqual([]);
  });

  test("returns an empty array when there are no markers", () => {
    expect(extractVersionMarkers("no version markers here")).toEqual([]);
  });
});

describe("findVersionMarkerMismatches", () => {
  test("no violations when no markers exist (the preferred state)", () => {
    expect(findVersionMarkerMismatches("1.3.0", "rely on the npm badge")).toEqual([]);
  });

  test("no violations when a marker agrees with package.json", () => {
    expect(findVersionMarkerMismatches("1.3.0", "Current: v1.3.0")).toEqual([]);
  });

  test("reports a violation when a marker disagrees with package.json", () => {
    const v = findVersionMarkerMismatches("1.3.0", "Current: v1.2.0");
    expect(v).toHaveLength(1);
    expect(v[0]?.detail).toContain("1.2.0");
    expect(v[0]?.detail).toContain("1.3.0");
  });
});
