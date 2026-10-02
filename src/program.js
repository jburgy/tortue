/**
 * @file Loads a whole Logo script (as typed into the textarea) into
 * procedures + top-level instructions, and runs it. This is the ES6
 * replacement for `unedit.212`'s interactive line-by-line procedure editor
 * (see docs/ARCHITECTURE.md): since the whole script is available upfront
 * here, procedures are found with a simple two-pass scan rather than an
 * interactive one-line-at-a-time teletype editor.
 */

import { tokenize } from "./lexer.js";
import { parseLine } from "./parser.js";
import {
  Environment,
  declareProcedure,
  defineProcedure,
  evalExpr,
  setRunList,
} from "./interpreter.js";
import { Procedure, NO_VALUE, LogoError } from "./types.js";

// Wire the interpreter's bracket-body execution (REPEAT/IF/WHILE/.../FOREVER)
// to the real parser, once, the first time this module loads.
setRunList(parseLine);

/**
 * Split a script into physical lines, recording which lines open a `TO`
 * procedure definition and which close it with `END`.
 * @param {string} sourceText
 * @returns {string[]}
 */
function toLines(sourceText) {
  return sourceText.split(/\r\n|\r|\n/);
}

/**
 * Tokenize one physical line's text, returning `null` for a blank/
 * comment-only line (nothing to parse).
 * @param {import('./types.js').RawToken[]} tokens
 * @returns {import('./types.js').RawToken[]|null}
 */
function nonEmpty(tokens) {
  return tokens.length === 0 ? null : tokens;
}

/**
 * Messages `lexer.js` throws specifically when it runs out of input with a
 * `[` or `(` still open — i.e. "there might be more on the next physical
 * line", as opposed to a genuine syntax error. Matched here (rather than
 * exposing a dedicated error class from lexer.js) because these three
 * exact strings are the full set of "unterminated" cases it can raise; see
 * `src/lexer.js`'s `parseSequence`/`readParenthesizedTokens`.
 */
const UNTERMINATED_MESSAGES = new Set([
  "Unmatched [",
  "Unmatched (",
  "Unmatched ( in double-quoted list",
]);

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isUnterminated(error) {
  return error instanceof LogoError && UNTERMINATED_MESSAGES.has(error.message);
}

/**
 * Tokenize the "logical line" starting at `lines[index]`: if it ends with
 * an unclosed `[` or `(`, additional physical lines are folded in (joined
 * by a newline, so a trailing `; comment` on an earlier line doesn't eat
 * the continuation) until the brackets balance or the script runs out —
 * this is what lets a bracketed body (`REPEAT`/`IF`/`WHILE`/.../`FOREVER`,
 * or a `TO` block) span multiple lines for readability instead of forcing
 * everything onto one very long line.
 * @param {string[]} lines
 * @param {number} index
 * @returns {{tokens: import('./types.js').RawToken[]|null, nextIndex: number}}
 */
function readLogicalLine(lines, index) {
  let text = lines[index];
  let nextIndex = index + 1;
  while (true) {
    try {
      return { tokens: nonEmpty(tokenize(text)), nextIndex };
    } catch (error) {
      if (isUnterminated(error) && nextIndex < lines.length) {
        text += "\n" + lines[nextIndex];
        nextIndex += 1;
        continue;
      }
      throw error;
    }
  }
}

/**
 * Parse one procedure-body physical line into a `Line` (tag + forms),
 * per docs/ARCHITECTURE.md: a leading bare number is an old-style line tag
 * used only as a `GO` target.
 * @param {import('./types.js').RawToken[]} tokens
 * @returns {import('./types.js').Line}
 */
function toBodyLine(tokens) {
  let tag = null;
  let rest = tokens;
  if (typeof tokens[0] === "number") {
    tag = tokens[0];
    rest = tokens.slice(1);
  }
  return { tag, forms: parseLine(rest) };
}

/**
 * Scan a script into `{ procedures, topLevel }`:
 * - `procedures`: `{ name, params, bodyLines }[]` (bodyLines are still raw
 *   token arrays at this point — not yet parsed).
 * - `topLevel`: an ordered list of `{ kind: 'line', tokens }` or
 *   `{ kind: 'procedure', index }` entries, preserving the original
 *   interleaving of definitions and top-level commands so that a command
 *   appearing *after* a `TO` block runs after that procedure exists (and,
 *   per the two-pass scheme, a command appearing *before* it can still
 *   call it, since every procedure's arity is registered up front).
 * @param {string} sourceText
 */
function scan(sourceText) {
  const lines = toLines(sourceText);
  /** @type {{name: string, params: string[], bodyLines: import('./types.js').RawToken[][]}[]} */
  const procedures = [];
  /** @type {Array<{kind:'line', tokens: import('./types.js').RawToken[]}|{kind:'procedure', index:number}>} */
  const topLevel = [];

  let i = 0;
  while (i < lines.length) {
    const { tokens, nextIndex } = readLogicalLine(lines, i);
    i = nextIndex;
    if (tokens === null) continue;

    if (typeof tokens[0] === "string" && tokens[0].toUpperCase() === "TO") {
      if (typeof tokens[1] !== "string") {
        throw new LogoError("TO NEEDS A PROCEDURE NAME");
      }
      const name = tokens[1];
      const params = tokens
        .slice(2)
        .map(String)
        .filter((t) => t.startsWith(":"))
        .map((t) => t.slice(1));
      const bodyLines = [];
      let sawEnd = false;
      while (i < lines.length) {
        const body = readLogicalLine(lines, i);
        i = body.nextIndex;
        if (body.tokens === null) continue;
        if (
          body.tokens.length === 1 &&
          typeof body.tokens[0] === "string" &&
          body.tokens[0].toUpperCase() === "END"
        ) {
          sawEnd = true;
          break;
        }
        bodyLines.push(body.tokens);
      }
      if (!sawEnd) {
        throw new LogoError(`${name.toUpperCase()} HAS NO END`);
      }
      topLevel.push({ kind: "procedure", index: procedures.length });
      procedures.push({ name, params, bodyLines });
      continue;
    }

    topLevel.push({ kind: "line", tokens });
  }

  return { procedures, topLevel };
}

/**
 * Parse and run a whole Logo script against the given environment (a fresh
 * one is created if omitted), in source order: `TO ... END` blocks define
 * their procedure before any later top-level line runs, but — thanks to the
 * two-pass arity scan — procedures may still call each other regardless of
 * definition order (mutual/forward recursion), matching docs/
 * ARCHITECTURE.md's documented simplification versus the original
 * incremental REPL.
 *
 * Note this forward-reference support only covers calls made from *inside*
 * a procedure body, which isn't actually run until it's invoked (typically
 * well after the whole script has loaded). A top-level instruction line
 * sitting *between* two `TO` blocks that immediately calls the second,
 * not-yet-reached one will still fail with "undefined function": pass 1
 * only registers arities (for parsing), while pass 2's `defineProcedure`
 * — which is what actually makes a procedure *callable* — still only runs
 * when the loop below reaches that `TO` block's position in source order.
 * @param {string} sourceText
 * @param {Environment} [env]
 * @returns {{env: Environment, lastValue: import('./types.js').LogoValue|typeof NO_VALUE}}
 */
export function runProgram(sourceText, env = new Environment()) {
  const { procedures, topLevel } = scan(sourceText);

  // Pass 1: register every procedure's arity so forward/mutual calls parse.
  for (const { name, params } of procedures) {
    declareProcedure(name, params);
  }

  // Pass 2: parse each procedure's body now that every name's arity is
  // known, and parse+run top-level lines in their original order.
  let lastValue = NO_VALUE;
  for (const entry of topLevel) {
    if (entry.kind === "procedure") {
      const { name, params, bodyLines } = procedures[entry.index];
      const body = bodyLines.map(toBodyLine);
      defineProcedure(new Procedure(name, params, body));
    } else {
      const forms = parseLine(entry.tokens);
      for (const form of forms) {
        lastValue = evalExpr(form, env);
      }
    }
  }

  return { env, lastValue };
}
