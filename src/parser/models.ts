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

export interface Scenario {
  readonly name: string;
  readonly tags: readonly Tag[];
  readonly steps: readonly ParsedStep[];
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
  return {
    rows,
    asObjects(): Record<string, string>[] {
      const header = rows[0];
      if (header === undefined || rows.length < 2) {
        return [];
      }
      const result: Record<string, string>[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
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
      return rows.map((r) => [...r]);
    },
  };
}
