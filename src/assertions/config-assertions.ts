import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

export interface AssertConfigOpts {
  readonly format?: "json" | "toml" | "yaml";
  readonly subset?: boolean;
}

type ConfigFormat = "json" | "toml" | "yaml";

function detectFormat(filePath: string): ConfigFormat {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".toml") return "toml";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  throw new Error(`Cannot auto-detect config format from extension: ${ext}`);
}

function parseConfig(content: string, format: ConfigFormat): unknown {
  if (format === "json") return JSON.parse(content) as unknown;
  if (format === "toml") return parseToml(content);
  return parseYaml(content) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diffValues(expected: unknown, actual: unknown, path: string, subset: boolean): string[] {
  if (isRecord(expected) && isRecord(actual)) {
    return diffObjects(expected, actual, path, subset);
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    return diffArrays(expected, actual, path, subset);
  }

  const expectedStr = JSON.stringify(expected);
  const actualStr = JSON.stringify(actual);
  if (actualStr !== expectedStr) {
    return [`${path}: expected ${expectedStr}, got ${actualStr}`];
  }
  return [];
}

function diffArrays(
  expected: unknown[],
  actual: unknown[],
  path: string,
  subset: boolean,
): string[] {
  const errors: string[] = [];

  if (!subset && expected.length !== actual.length) {
    errors.push(`${path}: expected array length ${expected.length}, got ${actual.length}`);
    return errors;
  }

  for (let i = 0; i < expected.length; i++) {
    if (i >= actual.length) {
      errors.push(`${path}[${i}]: expected ${JSON.stringify(expected[i])}, got undefined`);
      continue;
    }
    errors.push(...diffValues(expected[i], actual[i], `${path}[${i}]`, subset));
  }

  return errors;
}

function diffObjects(
  expected: Record<string, unknown>,
  actual: unknown,
  path: string,
  subset: boolean,
): string[] {
  const errors: string[] = [];

  if (!isRecord(actual)) {
    errors.push(`${path}: expected object, got ${typeof actual}`);
    return errors;
  }

  for (const [key, expectedVal] of Object.entries(expected)) {
    const fullPath = path !== "" ? `${path}.${key}` : key;
    const actualVal = actual[key];

    if (actualVal === undefined) {
      errors.push(`${fullPath}: expected ${JSON.stringify(expectedVal)}, got undefined`);
      continue;
    }

    errors.push(...diffValues(expectedVal, actualVal, fullPath, subset));
  }

  if (!subset) {
    for (const key of Object.keys(actual)) {
      if (!(key in expected)) {
        const fullPath = path !== "" ? `${path}.${key}` : key;
        errors.push(`${fullPath}: unexpected key in actual`);
      }
    }
  }

  return errors;
}

export function assertConfig(
  filePath: string,
  expected: Record<string, unknown>,
  opts?: AssertConfigOpts,
): void {
  const subset = opts?.subset ?? true;
  const format = opts?.format ?? detectFormat(filePath);
  const content = readFileSync(filePath, "utf-8");
  const actual = parseConfig(content, format);

  const errors = diffObjects(expected, actual, "", subset);
  if (errors.length > 0) {
    throw new Error(`Config assertion failed:\n  ${errors.join("\n  ")}`);
  }
}
