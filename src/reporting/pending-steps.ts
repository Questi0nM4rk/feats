import type { ParsedStep } from "@/parser/models";

type StepKeyword = "Given" | "When" | "Then" | "Step";

function resolveKeyword(step: ParsedStep): StepKeyword {
  if (step.keyword === "And" || step.keyword === "But") {
    return "Step";
  }
  return step.keyword;
}

// Order matters in alternation: floats before ints (`3.14` must not match `3`).
const TOKEN_PATTERN = /-?\d+\.\d+|-?\d+|"[^"]*"/g;

function placeholderFor(token: string): string {
  if (token.startsWith('"')) return "{string}";
  if (token.includes(".")) return "{float}";
  return "{int}";
}

function escapeForPattern(s: string): string {
  // Snippet patterns are cucumber-expressions, not regex. Escape only the
  // hazards for embedding in a JS double-quoted string literal.
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

interface Substituted {
  readonly pattern: string;
  readonly argCount: number;
}

function substitutePlaceholders(text: string): Substituted {
  let pattern = "";
  let lastIndex = 0;
  let count = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const start = match.index;
    if (start === undefined) continue;
    pattern += text.slice(lastIndex, start) + placeholderFor(match[0]);
    lastIndex = start + match[0].length;
    count++;
  }
  pattern += text.slice(lastIndex);
  return { pattern, argCount: count };
}

export function generateStepSnippet(step: ParsedStep): string {
  const keyword = resolveKeyword(step);
  const { pattern, argCount } = substitutePlaceholders(step.text);
  const escapedPattern = escapeForPattern(pattern);
  const args = ["world", ...Array.from({ length: argCount }, (_, i) => `arg${i + 1}`)].join(", ");
  return `${keyword}("${escapedPattern}", async (${args}) => {\n  // TODO: implement\n  throw new Error("Not implemented");\n});`;
}
