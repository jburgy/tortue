import { test } from "node:test";
import assert from "node:assert/strict";
import { Bracketed, DoubleQuoted, Quoted } from "../src/types.js";
import { tokenize, tokenizeLine } from "../src/lexer.js";

test("tokenizeLine reads plain words", () => {
  assert.deepEqual(tokenizeLine("TO SQUARE"), ["TO", "SQUARE"]);
});

test("tokenizeLine reads numbers, negatives, and decimals", () => {
  assert.deepEqual(tokenizeLine("1 2.5 -3 -.5 4. .25"), [1, 2.5, -3, -0.5, 4, 0.25]);
});

test("tokenizeLine structures single-quoted words", () => {
  assert.deepEqual(tokenizeLine("'word"), [new Quoted("word")]);
});

test("tokenizeLine structures double-quoted words", () => {
  assert.deepEqual(tokenizeLine('"word'), [new DoubleQuoted("word")]);
});

test("tokenizeLine structures double-quoted parenthesized forms", () => {
  assert.deepEqual(tokenizeLine('"(a b c)'), [new DoubleQuoted(["a", "b", "c"])]);
});

test("tokenizeLine structures bracketed lists", () => {
  assert.deepEqual(tokenizeLine("[1 2 3]"), [new Bracketed([1, 2, 3])]);
});

test("tokenizeLine structures nested bracketed lists", () => {
  assert.deepEqual(tokenizeLine("[1 [2 3] 4]"), [
    new Bracketed([1, new Bracketed([2, 3]), 4]),
  ]);
});

test("tokenizeLine drops trailing semicolon comments", () => {
  assert.deepEqual(tokenizeLine("FORWARD 100 ; comment"), ["FORWARD", 100]);
});

test("tokenizeLine drops balanced bang comments", () => {
  assert.deepEqual(tokenizeLine("FORWARD ! ignore this ! 100"), ["FORWARD", 100]);
});

test("tokenize merges multi-line bracketed lists", () => {
  assert.deepEqual(tokenize("PRINT [1 2\n3 4]"), [
    "PRINT",
    new Bracketed([1, 2, 3, 4]),
  ]);
});

test("tokenizeLine reports unclosed bracketed lists", () => {
  assert.throws(() => tokenizeLine("[1 2 3"), /Unmatched \[/);
});
