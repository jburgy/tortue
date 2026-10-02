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
