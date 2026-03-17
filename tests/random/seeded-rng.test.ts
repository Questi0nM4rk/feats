import { describe, expect, test } from "bun:test";
import { createRng } from "@/random/seeded-rng";

describe("createRng", () => {
  test("creates rng with explicit seed", () => {
    const rng = createRng(42);
    expect(rng.seed).toBe(42);
  });

  test("is deterministic with same seed", () => {
    const rng1 = createRng(12345);
    const rng2 = createRng(12345);
    const seq1 = Array.from({ length: 10 }, () => rng1.nextInt(0, 100));
    const seq2 = Array.from({ length: 10 }, () => rng2.nextInt(0, 100));
    expect(seq1).toEqual(seq2);
  });

  test("produces different sequences with different seeds", () => {
    const rng1 = createRng(1);
    const rng2 = createRng(2);
    const seq1 = Array.from({ length: 10 }, () => rng1.nextInt(0, 1000));
    const seq2 = Array.from({ length: 10 }, () => rng2.nextInt(0, 1000));
    expect(seq1).not.toEqual(seq2);
  });

  test("reads seed from FEATS_SEED env", () => {
    const original = process.env.FEATS_SEED;
    process.env.FEATS_SEED = "9999";
    const rng = createRng();
    expect(rng.seed).toBe(9999);
    if (original === undefined) {
      delete process.env.FEATS_SEED;
    } else {
      process.env.FEATS_SEED = original;
    }
  });
});

describe("nextInt", () => {
  test("returns integers within range", () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const val = rng.nextInt(1, 10);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(10);
    }
  });

  test("is deterministic", () => {
    const rng1 = createRng(7);
    const rng2 = createRng(7);
    expect(rng1.nextInt(0, 100)).toBe(rng2.nextInt(0, 100));
  });
});

describe("pick", () => {
  test("returns an element from the array", () => {
    const rng = createRng(42);
    const items = ["a", "b", "c", "d"];
    const picked = rng.pick(items);
    expect(items).toContain(picked);
  });

  test("is deterministic with same seed", () => {
    const rng1 = createRng(99);
    const rng2 = createRng(99);
    const items = [1, 2, 3, 4, 5];
    expect(rng1.pick(items)).toBe(rng2.pick(items));
  });

  test("throws on empty array", () => {
    const rng = createRng(1);
    expect(() => rng.pick([])).toThrow();
  });
});

describe("shuffle", () => {
  test("returns all original elements", () => {
    const rng = createRng(42);
    const items = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle(items);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test("does not mutate original array", () => {
    const rng = createRng(42);
    const items = [1, 2, 3, 4, 5];
    rng.shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  test("is deterministic with same seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng1 = createRng(55);
    const rng2 = createRng(55);
    expect(rng1.shuffle(items)).toEqual(rng2.shuffle(items));
  });
});

describe("sample", () => {
  test("returns requested number of elements", () => {
    const rng = createRng(42);
    const items = [1, 2, 3, 4, 5];
    const result = rng.sample(items, 3);
    expect(result).toHaveLength(3);
  });

  test("returns unique elements", () => {
    const rng = createRng(42);
    const items = [1, 2, 3, 4, 5];
    const result = rng.sample(items, 5);
    const unique = new Set(result);
    expect(unique.size).toBe(5);
  });

  test("all sampled elements come from original", () => {
    const rng = createRng(42);
    const items = ["a", "b", "c", "d", "e"];
    const result = rng.sample(items, 3);
    for (const item of result) {
      expect(items).toContain(item);
    }
  });

  test("is deterministic with same seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const rng1 = createRng(77);
    const rng2 = createRng(77);
    expect(rng1.sample(items, 4)).toEqual(rng2.sample(items, 4));
  });

  test("throws when count exceeds array length", () => {
    const rng = createRng(42);
    expect(() => rng.sample([1, 2, 3], 5)).toThrow();
  });
});
