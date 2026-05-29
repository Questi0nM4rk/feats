// src/cli/feats-cli.ts
//
// `feats` CLI binary entry point. Minimal viable: parse args, load step
// definition modules, glob features, run core-runner, exit with the
// suggested code.
//
//   feats [glob...] [--require <glob>] [--tags <expr>] [--reporter <spec>]
//
// Defaults:
//   - features glob: tests/features/**/*.feature
//   - steps glob:    **/*.steps.ts (CWD-relative, recursive)
//   - reporter:      pretty (so the user always sees something)

import { isAbsolute, resolve } from "node:path";
import { loadFeatures } from "@/parser/adapter";
import { reportersFromEnv } from "@/reporting/from-env";
import type { FeatsReporter } from "@/reporting/reporter";
import { PrettyReporter } from "@/reporting/reporters/pretty";
import { runCore } from "@/runner/core-runner";

interface ParsedArgs {
  readonly features: readonly string[];
  readonly requires: readonly string[];
  readonly tags: string | undefined;
  readonly reporters: readonly string[];
  readonly help: boolean;
  readonly version: boolean;
}

const USAGE = `feats — BDD/Gherkin runner for Bun

Usage:
  feats [feature-glob...] [options]

Options:
  --require <glob>     Glob of step-definition modules to load (repeatable).
                       Default: **/*.steps.ts
  --tags <expr>        Tag filter expression. Same syntax as FEATS_TAGS.
                       Default: "" (run all).
  --reporter <spec>    Reporter spec (repeatable). Same syntax as
                       FEATS_REPORTERS items, e.g. "pretty",
                       "junit:out.xml", "cucumber-json:out.json".
                       Default: pretty.
  --help, -h           Show this help.
  --version, -v        Print version.

Examples:
  feats
  feats tests/features/checkout.feature --reporter pretty --reporter junit:out.xml
  feats 'tests/**/*.feature' --tags '@critical and not @slow'

Environment:
  FEATS_REPORTERS      Used when no --reporter flag is given.
  FEATS_TAGS           Used when no --tags flag is given.

Exit codes:
  0  all scenarios passed (or only pending/skipped)
  1  one or more failures, undefined steps, or runtime errors
  2  CLI usage error
`;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const features: string[] = [];
  const requires: string[] = [];
  let tags: string | undefined;
  const reporters: string[] = [];
  let help = false;
  let version = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--version" || arg === "-v") {
      version = true;
      continue;
    }
    if (arg === "--require") {
      const next = argv[++i];
      if (next === undefined) throw new CliError("--require requires a value");
      requires.push(next);
      continue;
    }
    if (arg === "--tags") {
      const next = argv[++i];
      if (next === undefined) throw new CliError("--tags requires a value");
      tags = next;
      continue;
    }
    if (arg === "--reporter") {
      const next = argv[++i];
      if (next === undefined) throw new CliError("--reporter requires a value");
      reporters.push(next);
      continue;
    }
    if (arg?.startsWith("--") === true) {
      throw new CliError(`Unknown option: ${arg}`);
    }
    if (arg !== undefined) features.push(arg);
  }

  return { features, requires, tags, reporters, help, version };
}

export class CliError extends Error {
  readonly exitCode = 2;
}

async function resolveRequires(patterns: readonly string[], cwd: string): Promise<string[]> {
  const found: string[] = [];
  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern);
    for await (const file of glob.scan({ cwd, absolute: true })) {
      found.push(file);
    }
  }
  return found;
}

function buildReporters(specs: readonly string[]): FeatsReporter[] {
  if (specs.length > 0) return reportersFromEnv(specs.join(","));
  // No --reporter flags: respect FEATS_REPORTERS, else default to pretty
  // so the user always gets readable output from the CLI.
  const fromEnv = reportersFromEnv(process.env.FEATS_REPORTERS);
  if (fromEnv.length > 0) return fromEnv;
  return [new PrettyReporter()];
}

export async function runFeatsCli(
  argv: readonly string[],
  cwd: string = process.cwd(),
): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    if (err instanceof CliError) {
      process.stderr.write(`${err.message}\n\n${USAGE}`);
      return err.exitCode;
    }
    throw err;
  }

  if (parsed.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (parsed.version) {
    // package.json version is the source of truth.
    const pkgPath = resolve(import.meta.dir, "..", "..", "package.json");
    const pkg = (await Bun.file(pkgPath).json()) as { version: string };
    process.stdout.write(`feats ${pkg.version}\n`);
    return 0;
  }

  const featureGlobs =
    parsed.features.length > 0 ? parsed.features : ["tests/features/**/*.feature"];
  const requireGlobs = parsed.requires.length > 0 ? parsed.requires : ["**/*.steps.ts"];

  // Load step-definition modules first so Given/When/Then calls register
  // into the global registry before runCore snapshots it.
  const stepFiles = await resolveRequires(requireGlobs, cwd);
  if (stepFiles.length === 0) {
    process.stderr.write(
      `feats: no step-definition files matched ${requireGlobs.join(", ")} (under ${cwd}).\n` +
        `Pass --require <glob> to point at your steps.\n`,
    );
    return 2;
  }
  for (const file of stepFiles) {
    await import(isAbsolute(file) ? file : resolve(cwd, file));
  }

  // Load features.
  const features = [];
  for (const pattern of featureGlobs) {
    features.push(...(await loadFeatures(pattern, { cwd })));
  }
  if (features.length === 0) {
    process.stderr.write(`feats: no feature files matched ${featureGlobs.join(", ")}.\n`);
    return 2;
  }

  const reporters = buildReporters(parsed.reporters);

  try {
    const { exitCode } = await runCore(features, {
      ...(parsed.tags !== undefined ? { tagFilter: parsed.tags } : {}),
      reporters,
    });
    return exitCode;
  } catch (err) {
    // Hook errors (BeforeAll etc.) bubble out of runCore — surface them
    // with a non-zero exit so CI flags the run.
    process.stderr.write(`feats: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
