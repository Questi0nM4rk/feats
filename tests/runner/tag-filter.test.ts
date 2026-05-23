// tag-filter.test.ts
//
// Standalone tests for matchesTagFilter — precedence, edge cases, malformed
// expressions. Existing feature-runner.test.ts covers the integration; this
// file covers the parser/evaluator in isolation.

import { describe, expect, test } from "bun:test";
import type { Tag } from "@/parser/models";
import { matchesTagFilter } from "@/runner/tag-filter";

const tag = (name: string): Tag => ({ name });
const tags = (...names: string[]): Tag[] => names.map(tag);

describe("matchesTagFilter — atoms", () => {
  test("single tag matches", () => {
    expect(matchesTagFilter(tags("@smoke"), "@smoke")).toBe(true);
  });

  test("single tag misses", () => {
    expect(matchesTagFilter(tags("@slow"), "@smoke")).toBe(false);
  });

  test("auto-prefixes bare names with @", () => {
    // "smoke" should be normalized to "@smoke"
    expect(matchesTagFilter(tags("@smoke"), "smoke")).toBe(true);
  });

  test("empty filter matches anything", () => {
    expect(matchesTagFilter([], "")).toBe(true);
    expect(matchesTagFilter(tags("@anything"), "  ")).toBe(true);
  });
});

describe("matchesTagFilter — operators", () => {
  test("and: both required", () => {
    expect(matchesTagFilter(tags("@a", "@b"), "@a and @b")).toBe(true);
    expect(matchesTagFilter(tags("@a"), "@a and @b")).toBe(false);
  });

  test("or: either suffices", () => {
    expect(matchesTagFilter(tags("@a"), "@a or @b")).toBe(true);
    expect(matchesTagFilter(tags("@b"), "@a or @b")).toBe(true);
    expect(matchesTagFilter(tags("@c"), "@a or @b")).toBe(false);
  });

  test("not: negates", () => {
    expect(matchesTagFilter(tags("@smoke"), "not @slow")).toBe(true);
    expect(matchesTagFilter(tags("@slow"), "not @slow")).toBe(false);
  });

  test("double negation", () => {
    expect(matchesTagFilter(tags("@a"), "not not @a")).toBe(true);
    expect(matchesTagFilter(tags(), "not not @a")).toBe(false);
  });
});

describe("matchesTagFilter — precedence (not > and > or)", () => {
  test("a or b and c → a or (b and c)", () => {
    // Has @a alone → true regardless of b/c
    expect(matchesTagFilter(tags("@a"), "@a or @b and @c")).toBe(true);
    // Has @b and @c → true
    expect(matchesTagFilter(tags("@b", "@c"), "@a or @b and @c")).toBe(true);
    // Has only @b → false (b and c requires both)
    expect(matchesTagFilter(tags("@b"), "@a or @b and @c")).toBe(false);
    // Has only @c → false
    expect(matchesTagFilter(tags("@c"), "@a or @b and @c")).toBe(false);
  });

  test("not a and b → (not a) and b", () => {
    expect(matchesTagFilter(tags("@b"), "not @a and @b")).toBe(true);
    expect(matchesTagFilter(tags("@a", "@b"), "not @a and @b")).toBe(false);
    expect(matchesTagFilter(tags(), "not @a and @b")).toBe(false);
  });

  test("not a or b → (not a) or b", () => {
    // No tags → not @a is true → result true
    expect(matchesTagFilter(tags(), "not @a or @b")).toBe(true);
    // Has @a only → not @a is false, @b is false → false
    expect(matchesTagFilter(tags("@a"), "not @a or @b")).toBe(false);
    // Has @a and @b → not @a is false, @b is true → true
    expect(matchesTagFilter(tags("@a", "@b"), "not @a or @b")).toBe(true);
  });
});

describe("matchesTagFilter — case insensitivity for operators", () => {
  test("AND/OR/NOT are accepted", () => {
    expect(matchesTagFilter(tags("@a", "@b"), "@a AND @b")).toBe(true);
    expect(matchesTagFilter(tags("@a"), "@a OR @b")).toBe(true);
    expect(matchesTagFilter(tags(), "NOT @a")).toBe(true);
  });
});

describe("matchesTagFilter — malformed expressions", () => {
  test("trailing operator throws", () => {
    expect(() => matchesTagFilter(tags("@a"), "@a and")).toThrow(/Malformed|unexpected end/);
  });

  test("operator at start throws", () => {
    expect(() => matchesTagFilter(tags("@a"), "and @a")).toThrow(/Malformed|expected tag/);
  });

  test("two operators in a row throws", () => {
    expect(() => matchesTagFilter(tags("@a", "@b"), "@a and and @b")).toThrow(
      /Malformed|expected tag/,
    );
  });
});
