import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Bracketed,
  CallExpr,
  LogoError,
  LogoListLit,
  Parenthesized,
  PRIMITIVES,
  VarRef,
  defAbbreviations,
  defPrimitive,
} from "../src/types.js";
import { parseLine } from "../src/parser.js";

/**
 * @param {string} name
 * @param {{kind: 'expr'|'fexpr', arity: number|'L', fn: (...args: any[]) => any}} spec
 */
function ensurePrimitive(name, spec) {
  if (!PRIMITIVES.has(name.toUpperCase())) {
    defPrimitive(name, spec);
  }
}

/**
 * @param {string} canonical
 * @param {string[]} aliases
 */
function ensureAbbreviations(canonical, aliases) {
  const missing = aliases.filter((alias) => !PRIMITIVES.has(alias.toUpperCase()));
  if (missing.length > 0) {
    defAbbreviations(canonical, missing);
  }
}

ensurePrimitive("FORWARD", { kind: "expr", arity: 1, fn: (x) => x });
ensurePrimitive("RIGHT", { kind: "expr", arity: 1, fn: (x) => x });
ensurePrimitive("PRINT", { kind: "expr", arity: "L", fn: (...xs) => xs.at(-1) });
ensurePrimitive("REPEAT", { kind: "fexpr", arity: "L", fn: () => undefined });
ensurePrimitive("PAIR", { kind: "expr", arity: 2, fn: (a, b) => [a, b] });
ensurePrimitive("+", { kind: "expr", arity: 2, fn: (a, b) => a + b });
ensurePrimitive("-", { kind: "expr", arity: 2, fn: (a, b) => a - b });
ensurePrimitive("*", { kind: "expr", arity: 2, fn: (a, b) => a * b });
ensurePrimitive("/", { kind: "expr", arity: 2, fn: (a, b) => a / b });
ensurePrimitive("=", { kind: "expr", arity: 2, fn: (a, b) => a === b });
ensurePrimitive("<", { kind: "expr", arity: 2, fn: (a, b) => a < b });
ensurePrimitive(">", { kind: "expr", arity: 2, fn: (a, b) => a > b });
ensurePrimitive("<=", { kind: "expr", arity: 2, fn: (a, b) => a <= b });
ensurePrimitive(">=", { kind: "expr", arity: 2, fn: (a, b) => a >= b });
ensureAbbreviations("FORWARD", ["FD"]);

test("parseLine returns an empty array for an empty line", () => {
  assert.deepEqual(parseLine([]), []);
});

test("parseLine parses a simple prefix call", () => {
  assert.deepEqual(parseLine(["FORWARD", 100]), [
    new CallExpr("FORWARD", [100]),
  ]);
});

test("parseLine parses multiple top-level forms on one line", () => {
  assert.deepEqual(parseLine(["FORWARD", 100, "RIGHT", 90]), [
    new CallExpr("FORWARD", [100]),
    new CallExpr("RIGHT", [90]),
  ]);
});

test("parseLine applies infix precedence", () => {
  assert.deepEqual(parseLine([1, "+", 2, "*", 3]), [
    new CallExpr("+", [1, new CallExpr("*", [2, 3])]),
  ]);
});

test("parseLine lets an ordinary call's own argument absorb a comparison", () => {
  // Deliberate deviation from parser.129's "A"=B/HEADING=360 homonym-avoidance
  // idiom (which makes an ordinary call's *result* the left operand of a
  // following infix op): for an argument-taking command like PRINT, users
  // overwhelmingly mean `PRINT (X = 3)`, not the near-useless `(PRINT X) = 3`.
  // See docs/ARCHITECTURE.md and the DEFAULT_PRECEDENCE comment in parser.js.
  assert.deepEqual(parseLine(["PRINT", ":X", "=", 3]), [
    new CallExpr("PRINT", [new CallExpr("=", [new VarRef("X"), 3])]),
  ]);
});

test("parseLine lets parenthesized groups override infix precedence", () => {
  assert.deepEqual(parseLine([new Parenthesized([1, "+", 2]), "*", 3]), [
    new CallExpr("*", [new CallExpr("+", [1, 2]), 3]),
  ]);
});

test("parseLine parses :name as a VarRef", () => {
  assert.deepEqual(parseLine([":X"]), [new VarRef("X")]);
});

test("parseLine turns bracketed tokens into LogoListLit arguments", () => {
  assert.deepEqual(parseLine(["PRINT", new Bracketed([1, 2, 3])]), [
    new CallExpr("PRINT", [new LogoListLit([1, 2, 3])]),
  ]);
});

test("parseLine throws LogoError for an undefined function", () => {
  assert.throws(
    () => parseLine(["__PARSER_TEST_MISSING__"]),
    (error) =>
      error instanceof LogoError &&
      error.message === "__PARSER_TEST_MISSING__ IS AN UNDEFINED FUNCTION"
  );
});

test("parseLine throws LogoError when a fixed-arity primitive runs out of inputs", () => {
  assert.throws(
    () => parseLine(["PAIR", 1]),
    (error) =>
      error instanceof LogoError && error.message === "TOO FEW INPUTS TO PAIR"
  );
});
