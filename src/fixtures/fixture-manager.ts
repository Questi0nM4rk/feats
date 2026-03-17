import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { FixtureProject } from "@/fixtures/fixture-project";
import { createFixtureProject } from "@/fixtures/fixture-project";

export interface FixtureOpts {
  readonly fixtureDir: string;
}

function resolveFixturePath(fixtureDir: string, name: string): string {
  const resolved = resolve(fixtureDir, name);
  const base = resolve(fixtureDir);
  if (!resolved.startsWith(`${base}/`) && resolved !== base) {
    throw new Error(`Path traversal detected: "${name}" escapes fixture directory`);
  }
  return resolved;
}

export async function setupFixture(name: string, opts: FixtureOpts): Promise<FixtureProject> {
  const srcPath = resolveFixturePath(opts.fixtureDir, name);
  const tmpDir = await mkdtemp(join(tmpdir(), `feats-fixture-${name}-`));
  await cp(srcPath, tmpDir, { recursive: true });
  return createFixtureProject(tmpDir);
}

export async function composeFixtures(names: string[], opts: FixtureOpts): Promise<FixtureProject> {
  const tmpDir = await mkdtemp(join(tmpdir(), "feats-composed-"));
  for (const name of names) {
    const srcPath = resolveFixturePath(opts.fixtureDir, name);
    await cp(srcPath, tmpDir, { recursive: true });
  }
  return createFixtureProject(tmpDir);
}
