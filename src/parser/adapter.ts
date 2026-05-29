import { join } from "node:path";
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import type * as messages from "@cucumber/messages";
import { IdGenerator } from "@cucumber/messages";
import type {
  DataTable,
  Feature,
  ParsedStep,
  RuleInfo,
  Scenario,
  StepLocation,
  Tag,
} from "@/parser/models";
import { createDataTable } from "@/parser/models";

type StepKeyword = "Given" | "When" | "Then" | "And" | "But";

const KNOWN_KEYWORDS: StepKeyword[] = ["Given", "When", "Then", "And", "But"];

function normalizeKeyword(raw: string): StepKeyword {
  const trimmed = raw.trim();
  const found = KNOWN_KEYWORDS.find((k) => trimmed.startsWith(k));
  return found ?? "Given";
}

function mapTag(tag: messages.Tag): Tag {
  return { name: tag.name };
}

function mapDataTable(dt: messages.DataTable | undefined): DataTable | undefined {
  if (dt === undefined) return undefined;
  const rows = dt.rows.map((row) => row.cells.map((cell) => cell.value));
  return createDataTable(rows);
}

function mapStep(step: messages.Step, uri: string): ParsedStep {
  const location: StepLocation = { uri, line: step.location.line };
  const dataTable = mapDataTable(step.dataTable);
  const docString = step.docString?.content;

  return {
    keyword: normalizeKeyword(step.keyword),
    text: step.text,
    dataTable,
    docString,
    location,
  };
}

function buildStepIndex(gherkinDoc: messages.GherkinDocument): Map<string, messages.Step> {
  const index = new Map<string, messages.Step>();
  const feature = gherkinDoc.feature;
  if (feature === undefined) return index;

  const indexChildren = (
    children: readonly messages.FeatureChild[] | readonly messages.RuleChild[],
  ): void => {
    for (const child of children) {
      if (child.background !== undefined) {
        for (const step of child.background.steps) index.set(step.id, step);
      }
      if (child.scenario !== undefined) {
        for (const step of child.scenario.steps) index.set(step.id, step);
      }
      // Rules contain their own children (backgrounds + scenarios) which
      // must also be indexed so compiled pickle steps can resolve their AST.
      if ("rule" in child && child.rule !== undefined) {
        indexChildren(child.rule.children);
      }
    }
  };

  indexChildren(feature.children);
  return index;
}

// Cucumber's compile() merges Background steps into each Pickle. For outline
// scenarios we must strip them again — the feature-runner re-runs Background
// explicitly before each scenario via `feature.background.steps`, so leaving
// them in `scenario.steps` would cause Background to execute twice.
// Plain (non-outline) scenarios use the AST directly and are unaffected.
function buildBackgroundStepIds(gherkinDoc: messages.GherkinDocument): Set<string> {
  const ids = new Set<string>();
  const feature = gherkinDoc.feature;
  if (feature === undefined) return ids;
  const collect = (
    children: readonly messages.FeatureChild[] | readonly messages.RuleChild[],
  ): void => {
    for (const child of children) {
      if (child.background !== undefined) {
        for (const step of child.background.steps) ids.add(step.id);
      }
      if ("rule" in child && child.rule !== undefined) collect(child.rule.children);
    }
  };
  collect(feature.children);
  return ids;
}

function compiledStepToKeyword(
  compiledStep: messages.PickleStep,
  stepIndex: Map<string, messages.Step>,
): StepKeyword {
  for (const nodeId of compiledStep.astNodeIds) {
    const step = stepIndex.get(nodeId);
    if (step !== undefined) {
      return normalizeKeyword(step.keyword);
    }
  }
  return "Given";
}

function compiledStepToDataTable(compiledStep: messages.PickleStep): DataTable | undefined {
  const dt = compiledStep.argument?.dataTable;
  if (dt === undefined) return undefined;
  return mapPickleDataTable(dt);
}

function mapPickleDataTable(dt: messages.PickleTable): DataTable {
  const rows = dt.rows.map((row) => row.cells.map((cell) => cell.value));
  return createDataTable(rows);
}

function compiledStepToLocation(
  compiledStep: messages.PickleStep,
  stepIndex: Map<string, messages.Step>,
  uri: string,
): StepLocation {
  for (const nodeId of compiledStep.astNodeIds) {
    const step = stepIndex.get(nodeId);
    if (step !== undefined) {
      return { uri, line: step.location.line };
    }
  }
  return { uri, line: 0 };
}

function compiledScenarioToScenario(
  compiled: messages.Pickle,
  stepIndex: Map<string, messages.Step>,
  backgroundStepIds: ReadonlySet<string>,
): Scenario {
  const scenarioOnlySteps = compiled.steps.filter(
    (cs) => !cs.astNodeIds.some((id) => backgroundStepIds.has(id)),
  );
  const steps: ParsedStep[] = scenarioOnlySteps.map((cs) => {
    const keyword = compiledStepToKeyword(cs, stepIndex);
    const dataTable = compiledStepToDataTable(cs);
    const docString = cs.argument?.docString?.content;
    const location = compiledStepToLocation(cs, stepIndex, compiled.uri);
    return { keyword, text: cs.text, dataTable, docString, location };
  });

  const tags: Tag[] = compiled.tags.map((t) => ({ name: t.name }));

  return { name: compiled.name, tags, steps };
}

function isOutline(scenario: messages.Scenario): boolean {
  return scenario.examples.length > 0;
}

// When a Scenario Outline's name has no <placeholder>, every compiled example
// inherits the same name. Test reports then can't tell rows apart. Append a
// 1-based index only to the duplicates so single-row outlines and outlines
// with placeholder-bearing names stay clean.
function disambiguateOutlineNames(scenarios: Scenario[]): Scenario[] {
  const counts = new Map<string, number>();
  for (const s of scenarios) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);

  const seen = new Map<string, number>();
  return scenarios.map((s) => {
    if ((counts.get(s.name) ?? 0) <= 1) return s;
    const n = (seen.get(s.name) ?? 0) + 1;
    seen.set(s.name, n);
    return { ...s, name: `${s.name} [${n}]` };
  });
}

function groupCompiledByScenarioId(
  compiled: readonly messages.Pickle[],
): Map<string, messages.Pickle[]> {
  const map = new Map<string, messages.Pickle[]>();
  for (const item of compiled) {
    for (const astNodeId of item.astNodeIds) {
      const existing = map.get(astNodeId);
      if (existing !== undefined) {
        existing.push(item);
      } else {
        map.set(astNodeId, [item]);
      }
    }
  }
  return map;
}

export function parseFeature(source: string, uri: string): Feature {
  const newId = IdGenerator.uuid();
  const builder = new AstBuilder(newId);
  const matcher = new GherkinClassicTokenMatcher();
  const parser = new Parser(builder, matcher);

  const gherkinDoc = parser.parse(source);
  const feature = gherkinDoc.feature;

  if (feature === undefined) {
    return {
      name: "",
      description: "",
      tags: [],
      background: undefined,
      scenarios: [],
      uri,
    };
  }

  const tags: Tag[] = feature.tags.map(mapTag);
  let background: { readonly steps: readonly ParsedStep[] } | undefined;
  const scenarios: Scenario[] = [];

  const stepIndex = buildStepIndex(gherkinDoc);
  const backgroundStepIds = buildBackgroundStepIds(gherkinDoc);
  const compiled = compile(gherkinDoc, uri, newId);
  const compiledByScenarioId = groupCompiledByScenarioId(compiled);

  const processScenarioChild = (scenario: messages.Scenario, rule: RuleInfo | undefined): void => {
    if (isOutline(scenario)) {
      const outlineScenarios = compiledByScenarioId.get(scenario.id) ?? [];
      const mapped = outlineScenarios.map((item) => {
        const base = compiledScenarioToScenario(item, stepIndex, backgroundStepIds);
        return rule !== undefined ? { ...base, rule } : base;
      });
      scenarios.push(...disambiguateOutlineNames(mapped));
    } else {
      const steps = scenario.steps.map((s) => mapStep(s, uri));
      const scenarioTags = scenario.tags.map(mapTag);
      const built: Scenario = { name: scenario.name, tags: scenarioTags, steps };
      scenarios.push(rule !== undefined ? { ...built, rule } : built);
    }
  };

  for (const child of feature.children) {
    if (child.background !== undefined) {
      background = {
        steps: child.background.steps.map((s) => mapStep(s, uri)),
      };
    }

    if (child.scenario !== undefined) {
      processScenarioChild(child.scenario, undefined);
    }

    // Rules group scenarios under a named bucket and may carry their own
    // background + tags. We surface scenarios flat in `feature.scenarios`
    // (backwards-compat) with `scenario.rule` attached as metadata. A
    // rule's own background is NOT yet merged — the runner only honors
    // feature-level background. Phase 3 can deepen this.
    if (child.rule !== undefined) {
      const ruleInfo: RuleInfo = {
        name: child.rule.name,
        tags: child.rule.tags.map(mapTag),
      };
      for (const ruleChild of child.rule.children) {
        if (ruleChild.scenario !== undefined) {
          processScenarioChild(ruleChild.scenario, ruleInfo);
        }
      }
    }
  }

  return {
    name: feature.name,
    description: feature.description,
    tags,
    background,
    scenarios,
    uri,
  };
}

export async function loadFeatures(
  globPattern: string,
  opts?: { cwd?: string },
): Promise<Feature[]> {
  const cwd = opts?.cwd ?? process.cwd();
  const glob = new Bun.Glob(globPattern);
  const features: Feature[] = [];

  for await (const file of glob.scan({ cwd, absolute: false })) {
    const absolutePath = join(cwd, file);
    const source = await Bun.file(absolutePath).text();
    features.push(parseFeature(source, file));
  }

  return features;
}
