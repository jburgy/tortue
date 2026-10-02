import {
  Bracketed,
  CallExpr,
  DoubleQuoted,
  LogoError,
  LogoListLit,
  Parenthesized,
  PRIMITIVES,
  PROCEDURE_ARITY,
  Quoted,
  VarRef,
  arityOf,
} from "./types.js";

/** @typedef {import("./types.js").LogoValue} LogoValue */
/** @typedef {import("./types.js").RawToken} RawToken */
/** @typedef {LogoValue|VarRef|LogoListLit|CallExpr} ParsedExpr */

/**
 * Precedence used for an ordinary prefix call's own argument slots (e.g.
 * `PRINT`, `FORWARD`, or any user-defined procedure) when the callee isn't
 * itself a declared infix operator. Deliberately lower than every infix
 * operator's precedence (including comparisons, the lowest at 200) so that
 * e.g. `PRINT 5 > 3` or `IF :X > 0 [...]` absorb the whole boolean/
 * arithmetic expression as one argument, matching ordinary user
 * expectations — `parser.129`'s own default-precedence identifier handling
 * is tied up with 1970s infix/prefix homonym disambiguation this port does
 * not replicate; see docs/ARCHITECTURE.md.
 */
const DEFAULT_PRECEDENCE = 150;

/**
 * 11LOGO-style infix precedences from `parser.129`, with `<=`, `>=`, and `<>`
 * grouped alongside the original comparison operators.
 *
 * - assignment `_`: 50 (right associative)
 * - comparisons: 200
 * - addition/subtraction: 400
 * - multiplication/division/remainder: 500
 * - exponentiation `^`: 700 (right associative)
 */
const INFIX_PRECEDENCE = new Map([
  ["_", 50],
  ["<", 200],
  [">", 200],
  ["=", 200],
  ["<=", 200],
  [">=", 200],
  ["<>", 200],
  ["+", 400],
  ["-", 400],
  ["*", 500],
  ["/", 500],
  ["//", 500],
  ["\\", 500],
  ["^", 700],
]);

/**
 * Non-infix forms whose own arguments should extend farther than the default
 * precedence level, mirroring `parser.129`'s `PRECEDENCE` table.
 */
const FORM_PRECEDENCE = new Map([
  ["IF", 100],
  ["BOTH", 100],
  ["NOT", 100],
  ["EITHER", 100],
  ["TEST", 100],
  ["AND", 100],
  ["OR", 100],
  ["DO", 0],
  ["REPEAT", 0],
  ["WHILE", 0],
  ["UNTIL", 0],
  ["FOREVER", 0],
]);

const RIGHT_ASSOCIATIVE_LEVELS = new Set([50, 700]);

/**
 * Mutable left-to-right token cursor, replacing LLOGO's global `TOPARSE`.
 */
class TokenCursor {
  /** @param {RawToken[]} tokens */
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  /** @returns {boolean} */
  eof() {
    return this.index >= this.tokens.length;
  }

  /** @returns {RawToken|undefined} */
  peek() {
    return this.tokens[this.index];
  }

  /** @returns {RawToken} */
  consume() {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }
}

/**
 * Parse one Logo source line into one or more top-level forms.
 *
 * This is the ES6 port of `PARSELINE`/`PARSE-FORM-LIST`: it walks a flat
 * `RawToken[]`, parsing one maximal expression at a time until the line ends.
 *
 * @param {RawToken[]} tokens
 * @returns {ParsedExpr[]}
 */
export function parseLine(tokens) {
  const cursor = new TokenCursor(tokens);
  const forms = [];

  while (!cursor.eof()) {
    forms.push(parseExpression(cursor, null));
  }

  return forms;
}

export default parseLine;

/**
 * Parse one expression, allowing following infix operators whose precedence is
 * strictly greater than the surrounding form's precedence, or equal when the
 * operator associates to the right.
 *
 * @param {TokenCursor} cursor
 * @param {string|null} contextName Function/operator currently collecting this
 *   expression, or `null` for a top-level / parenthesized expression.
 * @returns {ParsedExpr}
 */
function parseExpression(cursor, contextName) {
  let expression = parsePrimary(cursor);
  const contextPrecedence = precedenceOf(contextName);

  while (!cursor.eof()) {
    const operator = infixOperatorOf(cursor.peek());
    if (!operator) {
      break;
    }

    const operatorPrecedence = precedenceOf(operator);
    if (operatorPrecedence < contextPrecedence) {
      break;
    }
    if (
      operatorPrecedence === contextPrecedence &&
      !RIGHT_ASSOCIATIVE_LEVELS.has(operatorPrecedence)
    ) {
      break;
    }

    cursor.consume();
    if (cursor.eof()) {
      throw tooFewInputs(operator);
    }
    if (arityOf(operator) === undefined) {
      throw new LogoError(`${operator} IS AN UNDEFINED FUNCTION`);
    }

    const right = parseExpression(cursor, operator);
    expression = new CallExpr(operator, [expression, right]);
  }

  return expression;
}

/**
 * Parse a single primary expression.
 *
 * @param {TokenCursor} cursor
 * @returns {ParsedExpr}
 */
function parsePrimary(cursor) {
  if (cursor.eof()) {
    throw new LogoError("UNEXPECTED END OF INPUT");
  }

  const token = cursor.consume();

  if (typeof token === "number") {
    return token;
  }

  if (typeof token === "string") {
    return parseWord(token, cursor);
  }

  if (token instanceof Quoted || token instanceof DoubleQuoted) {
    return literalValueOf(token.value);
  }

  if (token instanceof Bracketed) {
    return new LogoListLit(parseListItems(token.items));
  }

  if (token instanceof Parenthesized) {
    return parseParenthesized(token.items);
  }

  throw new LogoError(`UNRECOGNIZED TOKEN: ${String(token)}`);
}

/**
 * Parse a bare word either as a variable reference or a procedure call.
 *
 * @param {string} token
 * @param {TokenCursor} cursor
 * @returns {ParsedExpr}
 */
function parseWord(token, cursor) {
  if (token.startsWith(":")) {
    return new VarRef(token.slice(1));
  }

  const name = token.toUpperCase();
  const arity = arityOf(name);
  if (arity === undefined) {
    throw new LogoError(`${name} IS AN UNDEFINED FUNCTION`);
  }

  // A user-defined procedure always has plain fixed arity and is never a
  // `fexpr`, even when it redefines a `fexpr` primitive (e.g. `TO REPEAT
  // ... END`) — `arityOf` already prefers the procedure's arity in that
  // case (see types.js), so the primitive's `kind` must not leak through.
  const kind = PROCEDURE_ARITY.has(name) ? undefined : PRIMITIVES.get(name)?.kind;
  if (kind === "fexpr" || arity === "L") {
    return new CallExpr(name, parseRestArguments(cursor, name));
  }

  if (typeof arity === "number") {
    return new CallExpr(name, parseFixedArguments(cursor, name, arity));
  }

  throw new LogoError(`SYSTEM BUG - UNKNOWN ARITY FOR ${name}`);
}

/**
 * Parse exactly `arity` expression arguments.
 *
 * @param {TokenCursor} cursor
 * @param {string} calleeName
 * @param {number} arity
 * @returns {ParsedExpr[]}
 */
function parseFixedArguments(cursor, calleeName, arity) {
  const args = [];

  for (let index = 0; index < arity; index += 1) {
    if (cursor.eof()) {
      throw tooFewInputs(calleeName);
    }
    args.push(parseExpression(cursor, calleeName));
  }

  return args;
}

/**
 * Parse LEXPR/FEXPR arguments until end-of-line or until the next token begins
 * an infix expression instead of another argument.
 *
 * @param {TokenCursor} cursor
 * @param {string} calleeName
 * @returns {ParsedExpr[]}
 */
function parseRestArguments(cursor, calleeName) {
  const args = [];

  while (!cursor.eof() && !infixOperatorOf(cursor.peek())) {
    args.push(parseExpression(cursor, calleeName));
  }

  return args;
}

/**
 * Parse a parenthesized group as its own line and require exactly one form.
 *
 * @param {RawToken[]} items
 * @returns {ParsedExpr}
 */
function parseParenthesized(items) {
  const forms = parseLine(items);
  if (forms.length !== 1) {
    throw new LogoError(
      "PARENTHESIZED GROUP MUST CONTAIN EXACTLY ONE FORM"
    );
  }
  return forms[0];
}

/**
 * Parse the items inside a square-bracket literal list.
 *
 * Bracket content is Logo's one genuinely deferred construct: it must stay
 * exactly as the lexer produced it (raw, unresolved `RawToken`s — including
 * `Quoted`/`DoubleQuoted`/nested `Bracketed` wrappers) because the very same
 * `[...]` can be used as inert PRINT-able data (where a bare word like
 * `FORWARD` is just the word `FORWARD`, never looked up as a procedure) or
 * as a deferred instruction list for `REPEAT`/`IF`/`WHILE`/`UNTIL`/
 * `FOREVER`/`RUN` to parse and execute later — and only the primitive
 * actually using the list knows which. See `interpreter.js`'s `materialize`
 * (for the data case) and `runList` (for the code case).
 *
 * @param {RawToken[]} items
 * @returns {RawToken[]}
 */
function parseListItems(items) {
  return items;
}

/**
 * Convert a quoted/double-quoted token payload into a literal runtime value.
 *
 * @param {RawToken|RawToken[]} token
 * @returns {LogoValue}
 */
function literalValueOf(token) {
  if (Array.isArray(token)) {
    return token.map((item) => literalValueOf(item));
  }

  if (typeof token === "number" || typeof token === "string") {
    return token;
  }

  if (token instanceof Quoted || token instanceof DoubleQuoted) {
    return literalValueOf(token.value);
  }

  if (token instanceof Bracketed) {
    return token.items.map((item) => literalValueOf(item));
  }

  if (token instanceof Parenthesized) {
    return token.items.map((item) => literalValueOf(item));
  }

  throw new LogoError(`CANNOT LITERALIZE TOKEN: ${String(token)}`);
}

/**
 * Return the parsing precedence associated with a function or operator name.
 *
 * @param {string|null|undefined} name
 * @returns {number}
 */
function precedenceOf(name) {
  if (!name) {
    return 0;
  }

  const key = name.toUpperCase();
  return (
    INFIX_PRECEDENCE.get(key) ??
    FORM_PRECEDENCE.get(key) ??
    DEFAULT_PRECEDENCE
  );
}

/**
 * Recognize an infix operator token.
 *
 * @param {RawToken|undefined} token
 * @returns {string|null}
 */
function infixOperatorOf(token) {
  if (typeof token !== "string") {
    return null;
  }

  const name = token.toUpperCase();
  return INFIX_PRECEDENCE.has(name) ? name : null;
}

/**
 * Build the standard LLOGO too-few-inputs error.
 *
 * @param {string} name
 * @returns {LogoError}
 */
function tooFewInputs(name) {
  return new LogoError(`TOO FEW INPUTS TO ${name.toUpperCase()}`);
}
