/**
 * @file Shared data structures and contracts for the tortue Logo interpreter.
 *
 * This module has no dependencies on any other module in the project; every
 * other module imports from here so that independently-written pieces
 * (lexer, parser, primitives, interpreter, turtle) agree on shapes without
 * needing to read each other's source.
 *
 * See docs/ARCHITECTURE.md for the full design rationale. This file is a
 * straightforward ES6 translation of the data-structure conventions used in
 * MIT LISP LOGO (`src/llogo/reader.201`, `parser.129`, `primit.304`) from
 * the PDP-10/its archive, adapted for a browser/JS runtime.
 */

/**
 * A Logo value at runtime: a word (string), a number, or a list (array of
 * values, recursively). There is no separate "boolean" type in classic
 * Logo; predicates return the words `"TRUE"`/`"FALSE"`.
 * @typedef {string|number|LogoValue[]} LogoValue
 */

/**
 * Sentinel meaning "this call produced nothing to print", mirroring
 * MACLISP's `NO-VALUE`. Never valid inside a Logo list or as a word/number.
 */
export const NO_VALUE = Symbol("NO-VALUE");

/**
 * A reference to a variable, e.g. `:X`. Produced by the parser, consumed by
 * the interpreter's `evalExpr`.
 */
export class VarRef {
  /** @param {string} name Variable name without the leading colon. */
  constructor(name) {
    this.name = name;
  }
}

/**
 * A literal list written with square brackets, e.g. `[1 2 3]`. Its items
 * are themselves unevaluated parse results (words, numbers, nested
 * LogoListLit, or - rarely - VarRef/CallExpr if the list contains `:x` or
 * parenthesized expressions). Evaluating a LogoListLit produces a plain
 * array of evaluated items.
 */
export class LogoListLit {
  /** @param {Array<LogoValue|VarRef|CallExpr|LogoListLit>} items */
  constructor(items) {
    this.items = items;
  }
}

/**
 * A call to a primitive or user-defined procedure, e.g. `FORWARD 100` or,
 * from infix parsing, `1 + 2` (which parses to `CallExpr("+", [1, 2])`).
 */
export class CallExpr {
  /**
   * @param {string} name Procedure name, upper-cased.
   * @param {Array<LogoValue|VarRef|CallExpr|LogoListLit>} args
   */
  constructor(name, args) {
    this.name = name;
    this.args = args;
  }
}

/**
 * One line of a procedure body, carrying its optional old-style line
 * number (used only as a `GO` target; `null` for modern structured code).
 * @typedef {Object} Line
 * @property {number|null} tag
 * @property {CallExpr[]} forms
 */

/**
 * A user-defined procedure created by `TO name :p1 :p2 ... / END`.
 */
export class Procedure {
  /**
   * @param {string} name
   * @param {string[]} params Parameter names without leading colons.
   * @param {Line[]} body
   */
  constructor(name, params, body) {
    this.name = name;
    this.params = params;
    this.body = body;
  }
}

/**
 * Thrown by `OUTPUT` (and by `STOP`, which is `OUTPUT NO_VALUE`) to unwind
 * to the call boundary of the currently-running procedure, mirroring
 * MACLISP's `(OUTPUT (SYN RETURN))` unwinding an enclosing `PROG`.
 */
export class OutputSignal {
  /** @param {LogoValue|typeof NO_VALUE} value */
  constructor(value) {
    this.value = value;
  }
}

/**
 * Thrown by `GO tag` to resume a procedure body at a numbered line,
 * mirroring MACLISP's `(GO (SYN GO))`. Caught by the owning procedure's own
 * body-execution loop. See docs/ARCHITECTURE.md for the scoping
 * limitation versus genuine MACLISP `PROG`/`GO`.
 */
export class GoSignal {
  /** @param {number} tag */
  constructor(tag) {
    this.tag = tag;
  }
}

/**
 * A user-facing Logo error (unbound variable, wrong number of inputs, wrong
 * type, undefined procedure, etc.), the ES6 analog of `error.225`'s
 * `LOGO-ERROR`. Caught at the REPL boundary and printed, not a JS bug.
 */
export class LogoError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "LogoError";
  }
}

/**
 * How a primitive consumes its arguments, matching `primit.304`'s own
 * EXPR/FEXPR distinction (ported as `kind`) and the parser's
 * `HOW-TO-PARSE-INPUTS`/`PARSE-ARGS-PROP` arity rules (ported as `arity`).
 * @typedef {Object} PrimitiveSpec
 * @property {'expr'|'fexpr'} kind
 *   'expr': arguments are evaluated before `fn` is called, like a normal
 *   function call. 'fexpr': `fn` receives the raw, unevaluated argument
 *   expressions plus the calling Environment, and is responsible for
 *   evaluating them itself (used by REPEAT/WHILE/UNTIL/FOREVER/IFTRUE/
 *   IFFALSE, which must evaluate their body forms zero or more times).
 * @property {number|'L'} arity
 *   Fixed number of arguments for 'expr' primitives, or the literal string
 *   'L' meaning "collect the rest of the line" (LLOGO's LEXPR), used by
 *   PRINT, SENTENCE, WORD, and all the FEXPR control primitives.
 * @property {(...args: any[]) => (LogoValue|typeof NO_VALUE)} fn
 */

/**
 * The shared primitive registry. `src/primitives.js` (data/arithmetic/
 * predicates/words/lists) and `src/interpreter.js` (control flow) both
 * populate this single map at module-load time; `src/parser.js` queries it
 * read-only (via `arityOf`/`kindOf` below) to know how to parse each call.
 * @type {Map<string, PrimitiveSpec>}
 */
export const PRIMITIVES = new Map();

/**
 * Register a primitive. Throws if the name is already registered, to catch
 * accidental collisions between primitives.js and interpreter.js.
 * @param {string} name
 * @param {PrimitiveSpec} spec
 */
export function defPrimitive(name, spec) {
  const key = name.toUpperCase();
  if (PRIMITIVES.has(key)) {
    throw new Error(`Primitive ${key} already defined`);
  }
  PRIMITIVES.set(key, spec);
}

/**
 * Register one or more extra names (LLOGO "abbreviations", e.g. `FD` for
 * `FORWARD`) as aliases for an already-registered primitive.
 * @param {string} canonicalName
 * @param {string[]} aliases
 */
export function defAbbreviations(canonicalName, aliases) {
  const spec = PRIMITIVES.get(canonicalName.toUpperCase());
  if (!spec) {
    throw new Error(`Cannot alias unknown primitive ${canonicalName}`);
  }
  for (const alias of aliases) {
    PRIMITIVES.set(alias.toUpperCase(), spec);
  }
}

/**
 * Logo truthiness: the words "TRUE"/"FALSE" are what predicates return;
 * this treats any value other than literal "FALSE" as true, matching
 * MACLISP's `(NOT (EQ TESTFLAG 'FALSE))` pattern used throughout
 * `primit.304` (e.g. IFTRUE/IFFALSE).
 * @param {LogoValue} value
 * @returns {boolean}
 */
export function isTrue(value) {
  return !(typeof value === "string" && value.toUpperCase() === "FALSE");
}
