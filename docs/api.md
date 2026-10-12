# API exports

| Export | Description |
|--------|-------------|
| `Given`, `When`, `Then`, `Step` | Register step definitions |
| `defineParameterType` | Register custom cucumber parameter types |
| `Before`, `After` | Lifecycle hooks (with optional tag filter) |
| `loadFeatures(glob)` | Parse `.feature` files matching a glob |
| `parseFeature(source, uri)` | Parse a feature from a string |
| `runFeatures(features, opts?)` | Generate `bun:test` describe/test blocks |
| `isDataTable`, `isDocString` | Type guards for step-callback trailing args |
| `resetFeats` | Clear registry + hooks + parameter types (test isolation) |
| `clearRegistry`, `clearHooks`, `clearParameterTypeRegistry` | Fine-grained resets |
| `setupFixture(name, opts)` | Copy a fixture directory to a temp dir |
| `composeFixtures(names, opts)` | Merge multiple fixture dirs into one temp dir |
| `runCli(command, args?, opts?)` | Run a CLI process and capture output |
| `assertConfig(filePath, expected, opts?)` | Assert JSON/TOML/YAML config file contents |
| `assertOutput(result, expectations)` | Assert CLI output (stdout, stderr, exitCode) |
| `createRng(seed?)` | Create a seeded deterministic RNG |
