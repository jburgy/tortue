import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  clearOutputBuffer,
  formatValue,
  getOutputBuffer,
  setOutputSink,
} from "../src/printer.js";
import { NO_VALUE, PRIMITIVES } from "../src/types.js";

afterEach(() => {
  setOutputSink(null);
  clearOutputBuffer();
});

test("formatValue renders words and numbers bare", () => {
  assert.equal(formatValue("HELLO"), "HELLO");
  assert.equal(formatValue(42), "42");
});

test("formatValue renders the empty list", () => {
  assert.equal(formatValue([]), "[]");
});

test("formatValue renders a flat list with single spaces", () => {
  // In print.165, DPRIN1 prints one blank between adjacent list elements and
  // no extra padding after the opening bracket or before the closing bracket.
  assert.equal(formatValue(["A", 2, "C"]), "[A 2 C]");
});

test("formatValue renders nested lists recursively", () => {
  assert.equal(formatValue(["A", ["B", "C"], []]), "[A [B C] []]");
});

test("PRINT and TYPE primitives are registered and route output through the sink", () => {
  const printed = [];
  setOutputSink((text) => printed.push(text));

  const printPrimitive = PRIMITIVES.get("PRINT");
  const typePrimitive = PRIMITIVES.get("TYPE");

  assert.ok(printPrimitive);
  assert.ok(typePrimitive);
  assert.equal(printPrimitive.fn(["HELLO", "THERE"]), NO_VALUE);
  assert.equal(typePrimitive.fn(["A", ["B", "C"]]), NO_VALUE);

  assert.deepEqual(printed, ["HELLO THERE", "\n", "A [B C]"]);
});

test("the default sink buffers output in memory", () => {
  const blankPrimitive = PRIMITIVES.get("BLANK");
  const lineFeedPrimitive = PRIMITIVES.get("LINEFEED");

  blankPrimitive.fn();
  lineFeedPrimitive.fn();

  assert.equal(getOutputBuffer(), " \n");
});
