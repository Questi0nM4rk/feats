import { existsSync } from "node:fs";
import { readFile as fsReadFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { CLIResult } from "@/cli/cli-result";
import { runCli } from "@/cli/cli-runner";

export interface FixtureProject {
  readonly dir: string;
  run(command: string, args?: string[]): Promise<CLIResult>;
  hasFile(path: string): boolean;
  readFile(path: string): Promise<string>;
  readJson(path: string): Promise<unknown>;
  readToml(path: string): Promise<unknown>;
  listFiles(glob?: string): Promise<string[]>;
  cleanup(): Promise<void>;
}

function resolveInFixture(dir: string, path: string): string {
  const resolved = resolve(dir, path);
  const base = resolve(dir);
  if (!resolved.startsWith(`${base}/`) && resolved !== base) {
    throw new Error(`Path traversal detected: "${path}" escapes fixture directory`);
  }
  return resolved;
}

export function createFixtureProject(dir: string): FixtureProject {
  return {
    dir,

    run(command: string, args?: string[]): Promise<CLIResult> {
      return runCli(command, args, { cwd: dir });
    },

    hasFile(path: string): boolean {
      return existsSync(resolveInFixture(dir, path));
    },

    async readFile(path: string): Promise<string> {
      return fsReadFile(resolveInFixture(dir, path), "utf-8");
    },

    async readJson(path: string): Promise<unknown> {
      const contents = await fsReadFile(resolveInFixture(dir, path), "utf-8");
      return JSON.parse(contents) as unknown;
    },

    async readToml(path: string): Promise<unknown> {
      const contents = await fsReadFile(resolveInFixture(dir, path), "utf-8");
      return parseToml(contents);
    },

    async listFiles(glob?: string): Promise<string[]> {
      const pattern = glob ?? "**/*";
      const scanner = new Bun.Glob(pattern);
      const files: string[] = [];
      for await (const file of scanner.scan({ cwd: dir, onlyFiles: true })) {
        files.push(file);
      }
      return files;
    },

    async cleanup(): Promise<void> {
      const { rm } = await import("node:fs/promises");
      await rm(dir, { recursive: true, force: true });
    },
  };
}
