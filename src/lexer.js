// Browser textareas already handle reader.201's raw TTY rubout/echo editing, so this port only tokenizes and structures plain input text.

import { Bracketed, DoubleQuoted, LogoError, Parenthesized, Quoted } from "./types.js";

/** @typedef {import("./types.js").RawToken} RawToken */

/** @typedef {{ source: string, index: number }} Scanner */

const SPECIAL_CHARS = new Set([
  "'",
  '"',
  "[",
  "]",
  "(",
  ")",
  "+",
  "-",
  "*",
  "/",
  "=",
  "<",
  ">",
  ";",
  "!",
]);

const NUMBER_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Tokenize an entire Logo source string.
 *
 * Rather than recursively calling `LINE` at end-of-line, this scans the whole
 * source as one logical stream, so a bracket list or double-quoted
 * parenthesized form can continue across physical newlines.
 *
 * @param {string} sourceText Full Logo source text, possibly containing newlines.
 * @returns {RawToken[]} The structured token stream for the whole source.
 */
export function tokenize(sourceText) {
  const scanner = createScanner(sourceText);
  return parseSequence(scanner, null);
}

/**
 * Tokenize one physical line of Logo source.
 *
 * This is a convenience wrapper around {@link tokenize}; unlike the multi-line
 * entry point, any bracket list, `! ... !` comment, or `"(...)` form left open
 * at end-of-line is reported as an error.
 *
 * @param {string} text One physical line of Logo source.
 * @returns {RawToken[]} The structured token stream for that line.
 */
export function tokenizeLine(text) {
  return tokenize(text);
}

/**
 * Build a scanner over a source string.
 *
 * @param {string} source
 * @returns {Scanner}
 */
function createScanner(source) {
  return { source, index: 0 };
}

/**
 * Parse a token sequence until EOF or a closing bracket.
 *
 * @param {Scanner} scanner
 * @param {string|null} terminator Closing delimiter for nested structures.
 * @returns {RawToken[]}
 */
function parseSequence(scanner, terminator) {
  /** @type {RawToken[]} */
  const tokens = [];

  while (true) {
    skipIgnored(scanner);

    const ch = peek(scanner);
    if (ch === null) {
      if (terminator === "]") {
        throw new LogoError("Unmatched [");
      }
      if (terminator === ")") {
        throw new LogoError("Unmatched (");
      }
      return tokens;
    }

    if (terminator !== null && ch === terminator) {
      advance(scanner);
      return tokens;
    }

    if (ch === "]") {
      throw new LogoError("Unmatched ]");
    }

    if (ch === ")") {
      throw new LogoError("Unmatched )");
    }

    tokens.push(parseToken(scanner));
  }
}

/**
 * Parse one token at the current scanner position.
 *
 * @param {Scanner} scanner
 * @returns {RawToken}
 */
function parseToken(scanner) {
  const ch = peek(scanner);

  if (ch === null) {
    throw new LogoError("Unexpected end of input");
  }

  if (ch === "'") {
    advance(scanner);
    return new Quoted(readQuotedValue(scanner, "QUOTE"));
  }

  if (ch === '"') {
    advance(scanner);
    return new DoubleQuoted(readDoubleQuotedValue(scanner));
  }

  if (ch === "[") {
    advance(scanner);
    return new Bracketed(parseSequence(scanner, "]"));
  }

  if (ch === "(") {
    advance(scanner);
    return new Parenthesized(parseSequence(scanner, ")"));
  }

  if (ch === "-" && startsNegativeNumber(scanner)) {
    return readNumber(scanner, true);
  }

  const twoCharOp = peek2(scanner);
  if (twoCharOp === "<=" || twoCharOp === ">=" || twoCharOp === "<>") {
    advance(scanner);
    advance(scanner);
    return twoCharOp;
  }

  if (SPECIAL_CHARS.has(ch)) {
    advance(scanner);
    return ch;
  }

  return readBareToken(scanner);
}

/**
 * Peek the next two characters as a string, for recognizing the two-character
 * comparison operators `<=`, `>=`, and `<>` (which `parser.js`'s infix
 * precedence table treats as single tokens, unlike single-character `<`/`>`/`=`).
 *
 * @param {Scanner} scanner
 * @returns {string|null}
 */
function peek2(scanner) {
  const a = peek(scanner);
  if (a !== "<" && a !== ">") return null;
  const b = scanner.source[scanner.index + 1] ?? null;
  if (b === null) return null;
  return a + b;
}

/**
 * Read the value quoted by `'`.
 *
 * @param {Scanner} scanner
 * @param {string} label Error-label text.
 * @returns {RawToken}
 */
function readQuotedValue(scanner, label) {
  skipWhitespace(scanner);

  const ch = peek(scanner);
  if (ch === null || ch === ";" || ch === "!") {
    throw new LogoError(`${label} WHAT?`);
  }

  if (ch === "[") {
    advance(scanner);
    return new Bracketed(parseSequence(scanner, "]"));
  }

  if (ch === "(") {
    advance(scanner);
    return new Parenthesized(parseSequence(scanner, ")"));
  }

  if (ch === "'") {
    advance(scanner);
    return new Quoted(readQuotedValue(scanner, label));
  }

  if (ch === '"') {
    advance(scanner);
    return new DoubleQuoted(readDoubleQuotedValue(scanner));
  }

  return readQuotedWord(scanner);
}

/**
 * Read the value quoted by `"`.
 *
 * @param {Scanner} scanner
 * @returns {RawToken|RawToken[]}
 */
function readDoubleQuotedValue(scanner) {
  skipWhitespace(scanner);

  const ch = peek(scanner);
  if (ch === null || ch === ";" || ch === "!") {
    throw new LogoError('DOUBLE-QUOTE WHAT?');
  }

  if (ch === "(") {
    advance(scanner);
    return readParenthesizedTokens(scanner);
  }

  if (ch === "[") {
    advance(scanner);
    return new Bracketed(parseSequence(scanner, "]"));
  }

  if (ch === "'") {
    advance(scanner);
    return new Quoted(readQuotedValue(scanner, "QUOTE"));
  }

  if (ch === '"') {
    advance(scanner);
    return new DoubleQuoted(readDoubleQuotedValue(scanner));
  }

  return readQuotedWord(scanner);
}

/**
 * Read the contents of a `"(...)` form.
 *
 * Nested parentheses are preserved as bare `"("`/`")"` tokens in the returned
 * array while still being balanced during lexing.
 *
 * @param {Scanner} scanner
 * @returns {RawToken[]}
 */
function readParenthesizedTokens(scanner) {
  /** @type {RawToken[]} */
  const tokens = [];

  while (true) {
    skipIgnored(scanner);

    const ch = peek(scanner);
    if (ch === null) {
      throw new LogoError("Unmatched ( in double-quoted list");
    }

    if (ch === ")") {
      advance(scanner);
      return tokens;
    }

    if (ch === "(") {
      advance(scanner);
      tokens.push("(");
      tokens.push(...readParenthesizedTokens(scanner));
      tokens.push(")");
      continue;
    }

    if (ch === "]") {
      throw new LogoError("Unmatched ]");
    }

    tokens.push(parseToken(scanner));
  }
}

/**
 * Read an unquoted bare word or number.
 *
 * @param {Scanner} scanner
 * @returns {RawToken}
 */
function readBareToken(scanner) {
  const start = scanner.index;

  while (true) {
    const ch = peek(scanner);
    if (ch === null || isWhitespace(ch) || SPECIAL_CHARS.has(ch)) {
      break;
    }
    advance(scanner);
  }

  const lexeme = scanner.source.slice(start, scanner.index);
  if (NUMBER_PATTERN.test(lexeme)) {
    return Number(lexeme);
  }
  return lexeme;
}

/**
 * Read a quoted word, leaving all special characters inside it untouched.
 *
 * @param {Scanner} scanner
 * @returns {string}
 */
function readQuotedWord(scanner) {
  const start = scanner.index;

  while (true) {
    const ch = peek(scanner);
    if (ch === null || isWhitespace(ch)) {
      break;
    }
    advance(scanner);
  }

  const word = scanner.source.slice(start, scanner.index);
  if (word.length === 0) {
    throw new LogoError("QUOTE WHAT?");
  }
  return word;
}

/**
 * Read a negative number whose leading `-` is immediately attached to its
 * digits or decimal point.
 *
 * @param {Scanner} scanner
 * @param {boolean} signed
 * @returns {number}
 */
function readNumber(scanner, signed) {
  const start = scanner.index;

  if (signed) {
    advance(scanner);
  }

  while (isDigit(peek(scanner))) {
    advance(scanner);
  }

  if (peek(scanner) === ".") {
    advance(scanner);
    while (isDigit(peek(scanner))) {
      advance(scanner);
    }
  }

  const lexeme = scanner.source.slice(start, scanner.index);
  return Number(lexeme);
}

/**
 * Skip whitespace and comments.
 *
 * @param {Scanner} scanner
 * @returns {void}
 */
function skipIgnored(scanner) {
  while (true) {
    skipWhitespace(scanner);

    const ch = peek(scanner);
    if (ch === ";") {
      skipLineComment(scanner);
      continue;
    }

    if (ch === "!") {
      skipBlockComment(scanner);
      continue;
    }

    return;
  }
}

/**
 * Skip whitespace characters.
 *
 * @param {Scanner} scanner
 * @returns {void}
 */
function skipWhitespace(scanner) {
  while (isWhitespace(peek(scanner))) {
    advance(scanner);
  }
}

/**
 * Skip from `;` through the end of the current physical line.
 *
 * @param {Scanner} scanner
 * @returns {void}
 */
function skipLineComment(scanner) {
  while (true) {
    const ch = peek(scanner);
    if (ch === null || ch === "\n") {
      return;
    }
    advance(scanner);
  }
}

/**
 * Skip a balanced `! ... !` block comment.
 *
 * @param {Scanner} scanner
 * @returns {void}
 */
function skipBlockComment(scanner) {
  advance(scanner);

  while (true) {
    const ch = peek(scanner);
    if (ch === null) {
      throw new LogoError("Unterminated !...! comment");
    }
    advance(scanner);
    if (ch === "!") {
      return;
    }
  }
}

/**
 * Peek at the current character.
 *
 * @param {Scanner} scanner
 * @returns {string|null}
 */
function peek(scanner) {
  return scanner.index < scanner.source.length
    ? scanner.source[scanner.index]
    : null;
}

/**
 * Consume and return the current character.
 *
 * @param {Scanner} scanner
 * @returns {string}
 */
function advance(scanner) {
  const ch = scanner.source[scanner.index];
  scanner.index += 1;
  return ch;
}

/**
 * Test whether the current `-` starts a negative numeric literal.
 *
 * @param {Scanner} scanner
 * @returns {boolean}
 */
function startsNegativeNumber(scanner) {
  const next = scanner.source[scanner.index + 1] ?? null;
  const afterNext = scanner.source[scanner.index + 2] ?? null;

  return isDigit(next) || (next === "." && isDigit(afterNext));
}

/**
 * Test whether a character is whitespace.
 *
 * @param {string|null} ch
 * @returns {boolean}
 */
function isWhitespace(ch) {
  return ch !== null && /\s/.test(ch);
}

/**
 * Test whether a character is an ASCII digit.
 *
 * @param {string|null} ch
 * @returns {boolean}
 */
function isDigit(ch) {
  return ch !== null && ch >= "0" && ch <= "9";
}

export default tokenize;
