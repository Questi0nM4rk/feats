import type { Tag } from "@/parser/models";

/**
 * Evaluates a tag filter expression against a set of tags.
 *
 * Supports:
 *   - `@tag`, `not @tag`
 *   - `@a and @b`, `@a or @b`
 *   - parentheses for grouping: `(@a or @b) and not @c`
 *
 * Operator precedence: `not` > `and` > `or`.
 */

type TokenKind = "tag" | "and" | "or" | "not" | "lparen" | "rparen";

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  // Insert spaces around parens so the whitespace split treats them as
  // standalone tokens rather than glued onto a tag name.
  const normalized = expr.replace(/\(/g, " ( ").replace(/\)/g, " ) ");
  const parts = normalized
    .trim()
    .split(/\s+/)
    .filter((p) => p !== "");

  for (const part of parts) {
    if (part === "(") {
      tokens.push({ kind: "lparen", value: "(" });
    } else if (part === ")") {
      tokens.push({ kind: "rparen", value: ")" });
    } else if (part.toLowerCase() === "and") {
      tokens.push({ kind: "and", value: "and" });
    } else if (part.toLowerCase() === "or") {
      tokens.push({ kind: "or", value: "or" });
    } else if (part.toLowerCase() === "not") {
      tokens.push({ kind: "not", value: "not" });
    } else {
      const tag = part.startsWith("@") ? part : `@${part}`;
      tokens.push({ kind: "tag", value: tag });
    }
  }

  return tokens;
}

function hasTag(tags: readonly Tag[], tagName: string): boolean {
  return tags.some((t) => t.name === tagName);
}

/**
 * Recursive descent parser for tag expressions.
 * Grammar:
 *   expr     := or_expr
 *   or_expr  := and_expr ("or" and_expr)*
 *   and_expr := not_expr ("and" not_expr)*
 *   not_expr := "not" not_expr | atom
 *   atom     := tag | "(" or_expr ")"
 */
function parseOrExpr(tokens: Token[], pos: { index: number }, tags: readonly Tag[]): boolean {
  let left = parseAndExpr(tokens, pos, tags);

  while (pos.index < tokens.length) {
    const token = tokens[pos.index];
    if (token === undefined || token.kind !== "or") break;
    pos.index++;
    const right = parseAndExpr(tokens, pos, tags);
    left = left || right;
  }

  return left;
}

function parseAndExpr(tokens: Token[], pos: { index: number }, tags: readonly Tag[]): boolean {
  let left = parseNotExpr(tokens, pos, tags);

  while (pos.index < tokens.length) {
    const token = tokens[pos.index];
    if (token === undefined || token.kind !== "and") break;
    pos.index++;
    const right = parseNotExpr(tokens, pos, tags);
    left = left && right;
  }

  return left;
}

function parseNotExpr(tokens: Token[], pos: { index: number }, tags: readonly Tag[]): boolean {
  const token = tokens[pos.index];
  if (token !== undefined && token.kind === "not") {
    pos.index++;
    const inner = parseNotExpr(tokens, pos, tags);
    return !inner;
  }
  return parseAtom(tokens, pos, tags);
}

function parseAtom(tokens: Token[], pos: { index: number }, tags: readonly Tag[]): boolean {
  const token = tokens[pos.index];
  if (token === undefined) {
    throw new Error("Malformed tag filter expression: unexpected end of input");
  }
  if (token.kind === "lparen") {
    pos.index++;
    const inner = parseOrExpr(tokens, pos, tags);
    const closing = tokens[pos.index];
    if (closing === undefined || closing.kind !== "rparen") {
      throw new Error(`Malformed tag filter expression: expected ')' at position ${pos.index}`);
    }
    pos.index++;
    return inner;
  }
  if (token.kind !== "tag") {
    throw new Error(
      `Malformed tag filter expression: expected tag or '(', got "${token.value}" at position ${pos.index}`,
    );
  }
  pos.index++;
  return hasTag(tags, token.value);
}

export function matchesTagFilter(tags: readonly Tag[], filterExpr: string): boolean {
  if (filterExpr.trim() === "") return true;

  const tokens = tokenize(filterExpr);
  const pos = { index: 0 };
  const result = parseOrExpr(tokens, pos, tags);
  if (pos.index < tokens.length) {
    const trailing = tokens[pos.index];
    throw new Error(
      `Malformed tag filter expression: unexpected "${trailing?.value ?? ""}" at position ${pos.index}`,
    );
  }
  return result;
}
