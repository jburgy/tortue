import { test } from "node:test";
import assert from "node:assert/strict";
import { runProgram } from "../src/program.js";
import "../src/primitives.js";

test("runProgram throws a clear error when TO has no procedure name", () => {
  assert.throws(() => runProgram("TO\nPRINT 1\nEND"), /PROCEDURE NAME/);
});

test("runProgram throws a clear error when a TO block never reaches END", () => {
  assert.throws(() => runProgram("TO FOO\nPRINT 1"), /FOO HAS NO END/);
});

test("runProgram succeeds for a well-formed TO...END block", () => {
  const { lastValue } = runProgram("TO FOO\nOUTPUT 42\nEND\nFOO");
  assert.equal(lastValue, 42);
});

test("a bracketed body can span multiple physical lines for readability", () => {
  const { env } = runProgram(
    [
      "MAKE \"N 0",
      "REPEAT 3 [",
      "  PRINT :N",
      "  REPEAT 2 [",
      "    MAKE \"N :N + 1",
      "  ]",
      "]",
    ].join("\n")
  );
  assert.equal(env.thing("N"), 6);
});

test("a TO...END procedure body can itself contain a multi-line bracket", () => {
  const { lastValue } = runProgram(
    [
      "TO TRIPLE.SUM",
      "MAKE \"TOTAL 0",
      "REPEAT 3 [",
      "  MAKE \"TOTAL :TOTAL + 1",
      "]",
      "OUTPUT :TOTAL",
      "END",
      "TRIPLE.SUM",
    ].join("\n")
  );
  assert.equal(lastValue, 3);
});
