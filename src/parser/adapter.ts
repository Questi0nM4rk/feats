import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import type * as messages from "@cucumber/messages";
import { IdGenerator } from "@cucumber/messages";
import type { DataTable, Feature, ParsedStep, Scenario, StepLocation, Tag } from "@/parser/models";
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

  for (const child of feature.children) {
    if (child.background !== undefined) {
      for (const step of child.background.steps) {
        index.set(step.id, step);
      }
    }
    if (child.scenario !== undefined) {
      for (const step of child.scenario.steps) {
        index.set(step.id, step);
      }
    }
  }

  return index;
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

function compiledScenarioToScenario(
  compiled: messages.Pickle,
  stepIndex: Map<string, messages.Step>,
): Scenario {
  const steps: ParsedStep[] = compiled.steps.map((cs) => {
    const keyword = compiledStepToKeyword(cs, stepIndex);
    const dataTable = compiledStepToDataTable(cs);
    const docString = cs.argument?.docString?.content;
    const location: StepLocation = {
      uri: compiled.uri,
      line: 0,
    };
    return { keyword, text: cs.text, dataTable, docString, location };
  });

  const tags: Tag[] = compiled.tags.map((t) => ({ name: t.name }));

  return { name: compiled.name, tags, steps };
}

function isOutline(scenario: messages.Scenario): boolean {
  return scenario.examples.length > 0;
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
  const compiled = compile(gherkinDoc, uri, newId);
  const compiledByScenarioId = groupCompiledByScenarioId(compiled);

  for (const child of feature.children) {
    if (child.background !== undefined) {
      background = {
        steps: child.background.steps.map((s) => mapStep(s, uri)),
      };
    }

    if (child.scenario !== undefined) {
      const scenario = child.scenario;
      if (isOutline(scenario)) {
        const outlineScenarios = compiledByScenarioId.get(scenario.id) ?? [];
        for (const item of outlineScenarios) {
          scenarios.push(compiledScenarioToScenario(item, stepIndex));
        }
      } else {
        const steps = scenario.steps.map((s) => mapStep(s, uri));
        const scenarioTags = scenario.tags.map(mapTag);
        scenarios.push({ name: scenario.name, tags: scenarioTags, steps });
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
    const absolutePath = `${cwd}/${file}`;
    const source = await Bun.file(absolutePath).text();
    features.push(parseFeature(source, file));
  }

  return features;
}
