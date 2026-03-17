import type { ParsedStep } from "@/parser/models";

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function formatStepError(step: ParsedStep, error: unknown): string {
  const location = `${step.location.uri}:${step.location.line}`;
  const keyword = step.keyword;
  const text = step.text;
  const message = extractMessage(error);

  return `  ${location}\n    ${keyword} ${text}\n\n  Error: ${message}`;
}
