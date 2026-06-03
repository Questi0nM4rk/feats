// cc-review pipeline test fixture — intentionally flawed. Delete with the PR.

import { execSync } from "node:child_process";

// Parameterised query — `name` is bound, not interpolated.
export function findUser(db: { query(sql: string, params: unknown[]): unknown }, name: string) {
  return db.query("SELECT * FROM users WHERE name = $1", [name]);
}

// Untrusted path interpolated into a shell command.
export function readReport(path: string): string {
  return execSync("cat " + path).toString();
}

// An awaited network call inside a loop.
export async function loadItems(ids: number[]): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const id of ids) {
    out.push(await fetch("https://api.example.com/item/" + id));
  }
  return out;
}

// Failure is hidden; the caller cannot tell parsing failed.
export function parseConfig(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
