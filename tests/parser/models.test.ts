import { describe, expect, test } from "bun:test";
import { createDataTable } from "@/parser/models";

describe("createDataTable", () => {
  test("asObjects returns empty array when no header row", () => {
    const dt = createDataTable([]);
    expect(dt.asObjects()).toEqual([]);
  });

  test("asObjects returns empty array when only header exists", () => {
    const dt = createDataTable([["name", "age"]]);
    expect(dt.asObjects()).toEqual([]);
  });

  test("asObjects maps rows to objects using header keys", () => {
    const dt = createDataTable([
      ["name", "age"],
      ["Alice", "30"],
      ["Bob", "25"],
    ]);
    expect(dt.asObjects()).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ]);
  });

  test("asObjects uses empty string for missing cell values", () => {
    const dt = createDataTable([
      ["a", "b", "c"],
      ["x", "y"],
    ]);
    const result = dt.asObjects();
    expect(result[0]).toEqual({ a: "x", b: "y", c: "" });
  });

  test("asLists returns all rows as mutable string arrays", () => {
    const dt = createDataTable([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(dt.asLists()).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("asLists returns a copy not the original reference", () => {
    const rows = [["a", "b"]] as const;
    const dt = createDataTable(rows);
    const lists = dt.asLists();
    expect(lists).not.toBe(rows);
  });

  test("rows property holds original readonly rows", () => {
    const rows = [
      ["x", "y"],
      ["1", "2"],
    ] as const;
    const dt = createDataTable(rows);
    expect(dt.rows).toEqual(rows);
  });
});
