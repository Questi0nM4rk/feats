import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { composeFixtures, setupFixture } from "@/fixtures/fixture-manager";

const fixtureDir = join(import.meta.dir, "../fixtures");

describe("setupFixture", () => {
  test("copies fixture to a temp dir", async () => {
    const project = await setupFixture("sample-project", { fixtureDir });
    expect(project.hasFile("config.json")).toBe(true);
    expect(project.hasFile("src/main.ts")).toBe(true);
    await project.cleanup();
  });

  test("returns a project in a different dir than the fixture", async () => {
    const project = await setupFixture("sample-project", { fixtureDir });
    expect(project.dir).not.toBe(join(fixtureDir, "sample-project"));
    await project.cleanup();
  });

  test("cleanup removes the temp dir", async () => {
    const project = await setupFixture("sample-project", { fixtureDir });
    const dir = project.dir;
    await project.cleanup();
    expect(project.hasFile.bind(project, "config.json")).not.toThrow();
    const { existsSync } = await import("node:fs");
    expect(existsSync(dir)).toBe(false);
  });

  test("readFile returns file contents", async () => {
    const project = await setupFixture("sample-project", { fixtureDir });
    const content = await project.readFile("config.json");
    expect(content).toContain("sample-project");
    await project.cleanup();
  });

  test("readJson parses json file", async () => {
    const project = await setupFixture("sample-project", { fixtureDir });
    const config = await project.readJson("config.json");
    expect(config).toMatchObject({ name: "sample-project" });
    await project.cleanup();
  });

  test("listFiles returns files matching glob", async () => {
    const project = await setupFixture("sample-project", { fixtureDir });
    const files = await project.listFiles("**/*.ts");
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.includes("main.ts"))).toBe(true);
    await project.cleanup();
  });

  test("listFiles returns all files without glob", async () => {
    const project = await setupFixture("sample-project", { fixtureDir });
    const files = await project.listFiles();
    expect(files.length).toBeGreaterThanOrEqual(2);
    await project.cleanup();
  });
});

describe("composeFixtures", () => {
  test("creates a single temp dir with all fixtures merged", async () => {
    const project = await composeFixtures(["sample-project", "overlay-project"], {
      fixtureDir,
    });
    expect(project.hasFile("src/main.ts")).toBe(true);
    await project.cleanup();
  });

  test("later fixture wins on conflicting files", async () => {
    const project = await composeFixtures(["sample-project", "overlay-project"], {
      fixtureDir,
    });
    const config = await project.readJson("config.json");
    expect(config).toMatchObject({ name: "overlay-project", version: "2.0.0" });
    await project.cleanup();
  });

  test("cleanup removes composed temp dir", async () => {
    const project = await composeFixtures(["sample-project"], { fixtureDir });
    const dir = project.dir;
    await project.cleanup();
    const { existsSync } = await import("node:fs");
    expect(existsSync(dir)).toBe(false);
  });
});
