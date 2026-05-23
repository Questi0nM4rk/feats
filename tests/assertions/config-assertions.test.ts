import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertConfig } from "@/assertions/config-assertions";

async function makeTmpFile(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "feats-assert-test-"));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("assertConfig JSON", () => {
  test("passes when expected keys match", async () => {
    const path = await makeTmpFile(
      "config.json",
      JSON.stringify({ name: "test", version: "1.0.0" }),
    );
    expect(() => assertConfig(path, { name: "test" })).not.toThrow();
  });

  test("passes with subset match by default", async () => {
    const path = await makeTmpFile(
      "config.json",
      JSON.stringify({ name: "test", extra: "ignored" }),
    );
    expect(() => assertConfig(path, { name: "test" })).not.toThrow();
  });

  test("throws with field-level diff on mismatch", async () => {
    const path = await makeTmpFile("config.json", JSON.stringify({ name: "wrong" }));
    expect(() => assertConfig(path, { name: "test" })).toThrow("name: expected");
  });

  test("throws on missing key", async () => {
    const path = await makeTmpFile("config.json", JSON.stringify({ other: "val" }));
    expect(() => assertConfig(path, { name: "test" })).toThrow("name:");
  });

  test("throws on extra key when subset=false", async () => {
    const path = await makeTmpFile("config.json", JSON.stringify({ name: "test", extra: "val" }));
    expect(() => assertConfig(path, { name: "test" }, { subset: false })).toThrow("extra:");
  });

  test("passes exact match with subset=false", async () => {
    const path = await makeTmpFile("config.json", JSON.stringify({ name: "test" }));
    expect(() => assertConfig(path, { name: "test" }, { subset: false })).not.toThrow();
  });

  test("handles nested objects with field-level diff", async () => {
    const path = await makeTmpFile(
      "config.json",
      JSON.stringify({ compilerOptions: { strict: false } }),
    );
    expect(() => assertConfig(path, { compilerOptions: { strict: true } })).toThrow(
      "compilerOptions.strict",
    );
  });

  test("compares array elements recursively in subset mode", async () => {
    const path = await makeTmpFile("config.json", JSON.stringify({ items: [1, 2, 3] }));
    expect(() => assertConfig(path, { items: [1, 2, 3] })).not.toThrow();
  });

  test("throws on array element mismatch in subset mode", async () => {
    const path = await makeTmpFile("config.json", JSON.stringify({ items: [1, 9, 3] }));
    expect(() => assertConfig(path, { items: [1, 2, 3] })).toThrow("items[1]");
  });
});

describe("assertConfig TOML", () => {
  test("parses toml and passes on match", async () => {
    const path = await makeTmpFile("config.toml", 'name = "test"\nversion = "1.0.0"\n');
    expect(() => assertConfig(path, { name: "test" })).not.toThrow();
  });

  test("throws on mismatch in toml", async () => {
    const path = await makeTmpFile("config.toml", 'name = "wrong"\n');
    expect(() => assertConfig(path, { name: "test" })).toThrow("name:");
  });
});

describe("assertConfig YAML", () => {
  test("parses yaml and passes on match", async () => {
    const path = await makeTmpFile("config.yaml", "name: test\nversion: 1.0.0\n");
    expect(() => assertConfig(path, { name: "test" })).not.toThrow();
  });

  test("parses yml extension", async () => {
    const path = await makeTmpFile("config.yml", "name: test\n");
    expect(() => assertConfig(path, { name: "test" })).not.toThrow();
  });

  test("throws on mismatch in yaml", async () => {
    const path = await makeTmpFile("config.yaml", "name: wrong\n");
    expect(() => assertConfig(path, { name: "test" })).toThrow("name:");
  });

  test("accepts modest alias use (legitimate)", async () => {
    // 5 references to one anchor — well under the 100-alias cap.
    const yaml = `
host: &h "db.example.com"
primary: *h
replica_a: *h
replica_b: *h
replica_c: *h
replica_d: *h
`;
    const path = await makeTmpFile("aliases.yaml", yaml);
    expect(() =>
      assertConfig(path, { primary: "db.example.com", replica_a: "db.example.com" }),
    ).not.toThrow();
  });

  test("rejects billion-laughs alias expansion", async () => {
    // 9-level nesting where each level references the previous 9 times.
    // Without maxAliasCount, this expands to 9^9 = 387M references.
    const yaml = `
a: &a ["x","x","x","x","x","x","x","x","x"]
b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]
c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]
d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]
e: &e [*d,*d,*d,*d,*d,*d,*d,*d,*d]
f: &f [*e,*e,*e,*e,*e,*e,*e,*e,*e]
g: &g [*f,*f,*f,*f,*f,*f,*f,*f,*f]
h: &h [*g,*g,*g,*g,*g,*g,*g,*g,*g]
i: [*h,*h,*h,*h,*h,*h,*h,*h,*h]
`;
    const path = await makeTmpFile("bomb.yaml", yaml);
    expect(() => assertConfig(path, { a: ["x"] })).toThrow();
  });

  test("YAML with multiple anchors but total aliases below 100 still parses", async () => {
    // Build a YAML with 3 anchors each referenced ~30 times each (90 total).
    // All references are to scalar anchors so expansion stays flat — well under
    // the 100-alias limit. Verifies the cap is permissive for real configs.
    const refs = (anchor: string, count: number) =>
      Array.from({ length: count }, (_, i) => `key_${anchor}_${i}: *${anchor}`).join("\n");
    const yaml = `
base_host: &bh "db.internal"
base_port: &bp 5432
base_db: &bd "app_db"
${refs("bh", 30)}
${refs("bp", 30)}
${refs("bd", 30)}
`;
    const path = await makeTmpFile("many-refs.yaml", yaml);
    expect(() => assertConfig(path, { base_host: "db.internal" })).not.toThrow();
  });

  test("YAML parse error (invalid syntax) still throws", async () => {
    // Regression: the maxAliasCount option should not swallow genuine parse errors.
    const yaml = "key: [\n  unclosed bracket\n";
    const path = await makeTmpFile("invalid.yaml", yaml);
    expect(() => assertConfig(path, {})).toThrow();
  });
});

describe("assertConfig format option", () => {
  test("explicit format overrides auto-detection", async () => {
    const path = await makeTmpFile("data.txt", JSON.stringify({ name: "test" }));
    expect(() => assertConfig(path, { name: "test" }, { format: "json" })).not.toThrow();
  });
});
