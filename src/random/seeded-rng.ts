export interface SeededRng {
  readonly seed: number;
  nextInt(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  sample<T>(items: readonly T[], count: number): T[];
}

// Mulberry32 algorithm — deterministic, pure math
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = Math.imul(s ^ (s >>> 15), 1 | s);
    z = (z ^ (z + Math.imul(z ^ (z >>> 7), 61 | z))) >>> 0;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed?: number): SeededRng {
  let resolvedSeed: number;

  const envSeed = process.env.FEATS_SEED;
  if (envSeed !== undefined && envSeed !== "") {
    const parsed = Number(envSeed);
    resolvedSeed = Number.isNaN(parsed) ? Date.now() : parsed;
  } else if (seed !== undefined) {
    resolvedSeed = seed;
  } else {
    resolvedSeed = Date.now();
    process.stderr.write(
      `[feats] RNG seed: ${resolvedSeed} (replay with FEATS_SEED=${resolvedSeed})\n`,
    );
  }

  const next = mulberry32(resolvedSeed);

  return {
    seed: resolvedSeed,

    nextInt(min: number, max: number): number {
      if (min > max) {
        throw new Error(`nextInt: min (${min}) must not exceed max (${max})`);
      }
      return Math.floor(next() * (max - min + 1)) + min;
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("Cannot pick from empty array");
      }
      const idx = Math.floor(next() * items.length);
      const item = items[idx];
      if (item === undefined) {
        throw new Error(`Index ${idx} out of bounds`);
      }
      return item;
    },

    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const a = result[i];
        const b = result[j];
        if (a !== undefined && b !== undefined) {
          result[i] = b;
          result[j] = a;
        }
      }
      return result;
    },

    sample<T>(items: readonly T[], count: number): T[] {
      if (count < 0) {
        throw new Error(`sample: count must be non-negative, got ${count}`);
      }
      if (count > items.length) {
        throw new Error(`Cannot sample ${count} elements from array of length ${items.length}`);
      }
      const shuffled = [...items];
      for (let i = shuffled.length - 1; i > shuffled.length - count - 1; i--) {
        const j = Math.floor(next() * (i + 1));
        const a = shuffled[i];
        const b = shuffled[j];
        if (a !== undefined && b !== undefined) {
          shuffled[i] = b;
          shuffled[j] = a;
        }
      }
      return shuffled.slice(shuffled.length - count);
    },
  };
}
