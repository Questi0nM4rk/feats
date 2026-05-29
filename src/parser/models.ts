export interface Tag {
  readonly name: string;
}

export interface StepLocation {
  readonly uri: string;
  readonly line: number;
}

export interface DataTable {
  readonly rows: readonly (readonly string[])[];
  asObjects(): Record<string, string>[];
  asLists(): string[][];
}

export interface ParsedStep {
  readonly keyword: "Given" | "When" | "Then" | "And" | "But";
  readonly text: string;
  readonly dataTable: DataTable | undefined;
  readonly docString: string | undefined;
  readonly location: StepLocation;
}

/**
 * Optional Rule metadata attached to a Scenario when the scenario is
 * nested under a `Rule:` block. Lets reporters render the grouping
 * without changing the flat `feature.scenarios` shape that Phase 1 and
 * Phase 2a consumers rely on.
 */
export interface RuleInfo {
  readonly name: string;
  readonly tags: readonly Tag[];
}

export interface Scenario {
  readonly name: string;
  readonly tags: readonly Tag[];
  readonly steps: readonly ParsedStep[];
  /** Present when this scenario was declared inside a `Rule:` block. */
  readonly rule?: RuleInfo;
}

export interface Feature {
  readonly name: string;
  readonly description: string;
  readonly tags: readonly Tag[];
  readonly background: { readonly steps: readonly ParsedStep[] } | undefined;
  readonly scenarios: readonly Scenario[];
  readonly uri: string;
}

export function createDataTable(rows: readonly (readonly string[])[]): DataTable {
  // Defensive copy to prevent external mutation of the rows reference
  const frozenRows: readonly (readonly string[])[] = rows.map((r) => [...r]);

  return {
    rows: frozenRows,
    asObjects(): Record<string, string>[] {
      const header = frozenRows[0];
      if (header === undefined || frozenRows.length < 2) {
        return [];
      }
      const result: Record<string, string>[] = [];
      for (let i = 1; i < frozenRows.length; i++) {
        const row = frozenRows[i];
        if (row === undefined) continue;
        const obj: Record<string, string> = {};
        for (let j = 0; j < header.length; j++) {
          const key = header[j];
          const val = row[j];
          if (key !== undefined) {
            obj[key] = val ?? "";
          }
        }
        result.push(obj);
      }
      return result;
    },
    asLists(): string[][] {
      return frozenRows.map((r) => [...r]);
    },
  };
}

/**
 * Type guard for the trailing `unknown` arg that step callbacks receive when
 * the step has a Gherkin data table. Lets consumers narrow without `as` casts.
 *
 * ```ts
 * Given("a table of users", (world, arg) => {
 *   if (!isDataTable(arg)) throw new Error("expected data table");
 *   for (const user of arg.asObjects()) { ... }
 * });
 * ```
 */
export function isDataTable(x: unknown): x is DataTable {
  if (typeof x !== "object" || x === null) return false;
  const obj = x as { rows?: unknown; asObjects?: unknown; asLists?: unknown };
  return (
    Array.isArray(obj.rows) &&
    obj.rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === "string")) &&
    typeof obj.asObjects === "function" &&
    typeof obj.asLists === "function"
  );
}

/**
 * Type guard for the trailing `unknown` arg that step callbacks receive when
 * the step has a Gherkin doc string (a triple-quoted block).
 */
export function isDocString(x: unknown): x is string {
  return typeof x === "string";
}
