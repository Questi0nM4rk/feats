import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FixtureProject } from "@/fixtures/fixture-project";
import { createFixtureProject } from "@/fixtures/fixture-project";

export interface FixtureOpts {
  readonly fixtureDir: string;
}

export async function setupFixture(name: string, opts: FixtureOpts): Promise<FixtureProject> {
  const tmpDir = await mkdtemp(join(tmpdir(), `feats-fixture-${name}-`));
  await cp(join(opts.fixtureDir, name), tmpDir, { recursive: true });
  return createFixtureProject(tmpDir);
}

export async function composeFixtures(names: string[], opts: FixtureOpts): Promise<FixtureProject> {
  const tmpDir = await mkdtemp(join(tmpdir(), "feats-composed-"));
  for (const name of names) {
    await cp(join(opts.fixtureDir, name), tmpDir, { recursive: true });
  }
  return createFixtureProject(tmpDir);
}
