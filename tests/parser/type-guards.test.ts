// type-guards.test.ts
//
// Tests for isDataTable / isDocString (§1.8). These are public exports
// step authors use to narrow the trailing `unknown` args their callbacks
// receive when the step has a Gherkin data table or doc string.

import { describe, expect, test } from "bun:test";
import { createDataTable, isDataTable, isDocString } from "@/parser/models";

describe("isDataTable", () => {
  test("recognizes a real DataTable produced by createDataTable", () => {
    const dt = createDataTable([
      ["name", "role"],
      ["Ada", "admin"],
    ]);
    expect(isDataTable(dt)).toBe(true);
  });

  test("rejects plain objects that lack the helper methods", () => {
    expect(isDataTable({ rows: [["a"]] })).toBe(false);
    expect(isDataTable({ asObjects: () => [], asLists: () => [] })).toBe(false); // no rows
  });

  test("rejects malformed rows: non-array rows", () => {
    // A common confusion: rows that are NOT arrays of strings. The guard
    // must reject these even when asObjects/asLists are present, otherwise
    // narrowed code crashes on the first .map / iteration.
    expect(
      isDataTable({
        rows: [42],
        asObjects: () => [],
        asLists: () => [],
      }),
    ).toBe(false);
  });

  test("rejects malformed rows: non-string cells", () => {
    expect(
      isDataTable({
        rows: [[1, 2, 3]],
        asObjects: () => [],
        asLists: () => [],
      }),
    ).toBe(false);
  });

  test("accepts empty rows array (valid edge case)", () => {
    expect(
      isDataTable({
        rows: [],
        asObjects: () => [],
        asLists: () => [],
      }),
    ).toBe(true);
  });

  test("rejects null, undefined, strings, numbers, arrays", () => {
    expect(isDataTable(null)).toBe(false);
    expect(isDataTable(undefined)).toBe(false);
    expect(isDataTable("hello")).toBe(false);
    expect(isDataTable(42)).toBe(false);
    expect(isDataTable([])).toBe(false);
  });

  test("narrows the type so .asObjects() is callable without casts", () => {
    const x: unknown = createDataTable([["k"], ["v"]]);
    if (isDataTable(x)) {
      // Compile-time check: x is DataTable here, .asObjects exists.
      expect(x.asObjects()).toEqual([{ k: "v" }]);
    } else {
      throw new Error("unreachable");
    }
  });
});

describe("isDocString", () => {
  test("recognizes a string", () => {
    expect(isDocString("hello")).toBe(true);
    expect(isDocString("")).toBe(true);
  });

  test("rejects non-strings", () => {
    expect(isDocString(undefined)).toBe(false);
    expect(isDocString(null)).toBe(false);
    expect(isDocString(42)).toBe(false);
    expect(isDocString({})).toBe(false);
    expect(isDocString([])).toBe(false);
  });
});
