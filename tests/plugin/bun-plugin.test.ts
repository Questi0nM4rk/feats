// bun-plugin.test.ts
//
// Integration test for the @questi0nm4rk/feats/plugin Bun plugin. Builds a
// trivial bundle that imports a .feature file and asserts the imported
// default export is the parsed Feature shape.

import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import featsPlugin from "@/plugin/bun-plugin";

const FEATURE_SRC = `
Feature: Plugin smoke
  Scenario: It parses
    Given a step
    When something happens
    Then it works
`;

describe("Bun plugin (@questi0nm4rk/feats/plugin)", () => {
  test("loads .feature files as parsed Feature objects", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feats-plugin-"));
    const featurePath = join(dir, "sample.feature");
    const entryPath = join(dir, "entry.ts");
    await writeFile(featurePath, FEATURE_SRC, "utf-8");
    await writeFile(
      entryPath,
      `import feature from "./sample.feature";\nexport default feature;\n`,
      "utf-8",
    );

    const build = await Bun.build({
      entrypoints: [entryPath],
      plugins: [featsPlugin],
      target: "bun",
    });

    expect(build.success).toBe(true);
    expect(build.outputs).toHaveLength(1);

    // Whitespace/quoting from the bundler is opaque — instead of asserting on
    // textual shape, import the artifact and assert on its runtime value.
    const outPath = join(dir, "bundle.js");
    const firstOutput = build.outputs[0];
    if (firstOutput === undefined) throw new Error("expected build output");
    await Bun.write(outPath, await firstOutput.text());
    const mod = (await import(outPath)) as {
      default: {
        name: string;
        scenarios: { name: string; steps: { keyword: string; text: string }[] }[];
      };
    };

    expect(mod.default.name).toBe("Plugin smoke");
    expect(mod.default.scenarios).toHaveLength(1);
    const scen = mod.default.scenarios[0];
    expect(scen?.name).toBe("It parses");
    expect(scen?.steps.map((s) => s.text)).toEqual(["a step", "something happens", "it works"]);
    expect(scen?.steps.map((s) => s.keyword)).toEqual(["Given", "When", "Then"]);
  });

  test("plugin name is set", () => {
    expect(featsPlugin.name).toBe("feats-gherkin");
  });

  test("parses outline-bearing features through the plugin", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feats-plugin-outline-"));
    const featurePath = join(dir, "outline.feature");
    const entryPath = join(dir, "entry.ts");
    await writeFile(
      featurePath,
      `
Feature: F
  Scenario Outline: Sums
    Given <a> plus <b>

    Examples:
      | a | b |
      | 1 | 2 |
      | 3 | 4 |
`,
      "utf-8",
    );
    await writeFile(entryPath, `import f from "./outline.feature";\nexport default f;\n`, "utf-8");

    const build = await Bun.build({
      entrypoints: [entryPath],
      plugins: [featsPlugin],
      target: "bun",
    });
    expect(build.success).toBe(true);

    const outPath = join(dir, "bundle.js");
    const firstOutput = build.outputs[0];
    if (firstOutput === undefined) throw new Error("expected build output");
    await Bun.write(outPath, await firstOutput.text());
    const mod = (await import(outPath)) as {
      default: { scenarios: { name: string }[] };
    };

    // Outline produces one scenario per example row.
    expect(mod.default.scenarios).toHaveLength(2);
  });
});
