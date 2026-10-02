import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LogoError,
  NO_VALUE,
  PRIMITIVES,
  PROCEDURE_ARITY,
} from "../src/types.js";
import "../src/primitives.js";

/**
 * Look up a registered primitive function by name.
 * @param {string} name
 * @returns {(...args: any[]) => any}
 */
function primitiveFn(name) {
  const spec = PRIMITIVES.get(name.toUpperCase());
  assert.ok(spec, `missing primitive ${name}`);
  return spec.fn;
}

test("word/list primitives follow the LLOGO contracts", () => {
  const first = primitiveFn("FIRST");
  const butfirst = primitiveFn("BUTFIRST");
  const last = primitiveFn("LAST");
  const butlast = primitiveFn("BUTLAST");
  const count = primitiveFn("COUNT");
  const join = primitiveFn("JOIN");
  const fput = primitiveFn("FPUT");
  const lput = primitiveFn("LPUT");
  const sentence = primitiveFn("SENTENCE");
  const word = primitiveFn("WORD");
  const char = primitiveFn("CHAR");

  assert.equal(first("HELLO"), "H");
  assert.equal(first(123), 1);
  assert.equal(first(["A", "B"]), "A");
  assert.throws(() => first(""), LogoError);
  assert.throws(() => butfirst([]), LogoError);

  assert.equal(butfirst("HELLO"), "ELLO");
  assert.equal(butfirst(12345), 2345);
  assert.equal(last("HELLO"), "O");
  assert.equal(last([1, 2, 3]), 3);
  assert.equal(butlast("HELLO"), "HELL");
  assert.deepEqual(butlast([1, 2, 3]), [1, 2]);

  assert.equal(count("HELLO"), 5);
  assert.equal(count(12345), 5);
  assert.equal(count([1, 2, 3]), 3);

  assert.deepEqual(join(1, "A", [2, 3]), [1, "A", [2, 3]]);
  assert.deepEqual(fput(1, 2, [3, 4]), [1, 2, 3, 4]);
  assert.deepEqual(lput(1, 2, [3, 4]), [3, 4, 1, 2]);
  assert.deepEqual(sentence("HELLO", [1, 2], "WORLD"), ["HELLO", 1, 2, "WORLD"]);

  assert.equal(word("HEL", "LO"), "HELLO");
  assert.equal(word(1, 2), 12);
  assert.equal(word("-", 1), "-1");
  assert.equal(char(65), "A");
});

test("ASCII and CHAR are true inverses, not aliases of the same function", () => {
  const ascii = primitiveFn("ASCII");
  const char = primitiveFn("CHAR");

  assert.equal(ascii("A"), 65);
  assert.equal(char(65), "A");
  assert.notEqual(PRIMITIVES.get("ASCII"), PRIMITIVES.get("CHAR"));
  assert.throws(() => ascii("AB"), LogoError);
});

test("predicate and logical primitives return Logo TRUE/FALSE words", () => {
  const contentsp = primitiveFn("CONTENTSP");
  const primitivep = primitiveFn("PRIMITIVEP");
  const greaterp = primitiveFn("GREATERP");
  const lessp = primitiveFn("LESSP");
  const zerop = primitiveFn("ZEROP");
  const numberp = primitiveFn("NUMBERP");
  const equal = primitiveFn("EQUAL");
  const wordp = primitiveFn("WORDP");
  const member = primitiveFn("MEMBER");
  const emptywp = primitiveFn("EMPTYWP");
  const emptyp = primitiveFn("EMPTYP");
  const sentencep = primitiveFn("SENTENCEP");
  const listp = primitiveFn("LISTP");
  const nullp = primitiveFn("NULL");
  const isabout = primitiveFn("ISABOUT");
  const both = primitiveFn("BOTH");
  const either = primitiveFn("EITHER");

  PROCEDURE_ARITY.set("MYPROC", 2);
  try {
    assert.equal(contentsp("MYPROC"), "TRUE");
    assert.equal(contentsp("NOPE"), "FALSE");
  } finally {
    PROCEDURE_ARITY.delete("MYPROC");
  }

  assert.equal(primitivep("FIRST"), "TRUE");
  assert.equal(primitivep("NOT-A-PRIMITIVE"), "FALSE");
  assert.equal(greaterp(5, 4, 3), "TRUE");
  assert.equal(lessp(1, 2, 3), "TRUE");
  assert.equal(zerop(0), "TRUE");
  assert.equal(numberp(3.5), "TRUE");
  assert.equal(numberp("3.5"), "FALSE");
  assert.equal(equal("hello", "HELLO"), "TRUE");
  assert.equal(equal([1, "A"], [1, "a"]), "TRUE");
  assert.equal(wordp(""), "TRUE");
  assert.equal(wordp(0), "TRUE");
  assert.equal(member("b", ["A", "B", "C"]), "TRUE");
  assert.equal(emptywp(""), "TRUE");
  assert.equal(emptyp([]), "TRUE");
  assert.equal(sentencep([1, "A", 2]), "TRUE");
  assert.equal(sentencep([1, [2]]), "FALSE");
  assert.equal(listp([]), "TRUE");
  assert.equal(nullp([]), "TRUE");
  assert.equal(isabout(10, 10.005), "TRUE");
  assert.equal(isabout(10, 10.02), "FALSE");
  assert.equal(both("TRUE", "TRUE", 0), "TRUE");
  assert.equal(both("TRUE", "FALSE"), "FALSE");
  assert.equal(either("FALSE", "TRUE"), "TRUE");
});

test("arithmetic primitives preserve LLOGO numeric behavior", () => {
  const difference = primitiveFn("DIFFERENCE");
  const infixDifference = primitiveFn("INFIX-DIFFERENCE");
  const infixMinus = primitiveFn("-");
  const prefixMinus = primitiveFn("PREFIX-MINUS");
  const infixPlus = primitiveFn("+");
  const prefixPlus = primitiveFn("PREFIX-PLUS");
  const quotient = primitiveFn("QUOTIENT");
  const plus = primitiveFn("PLUS");
  const times = primitiveFn("TIMES");
  const expt = primitiveFn("EXPT");
  const max = primitiveFn("MAX");
  const min = primitiveFn("MIN");
  const remainder = primitiveFn("REMAINDER");
  const sine = primitiveFn("SINE");
  const cosine = primitiveFn("COSINE");
  const arctan = primitiveFn("ARCTAN");
  const roundoff = primitiveFn("ROUNDOFF");
  const random = primitiveFn("RANDOM");

  assert.equal(difference(10, 3), 7);
  assert.equal(infixDifference(10, 3), 7);
  assert.equal(infixMinus(10, 3), 7);
  assert.equal(prefixMinus(5), -5);
  assert.equal(prefixPlus(-5), -5);
  assert.equal(infixPlus(1, 2), 3);
  assert.equal(quotient(9, 2), 4.5);
  assert.equal(plus(1, 2, 3, 4), 10);
  assert.equal(times(2, 3, 4), 24);
  assert.equal(expt(2, 5), 32);
  assert.equal(max(3, 9, 4), 9);
  assert.equal(min(3, 9, 4), 3);
  assert.equal(remainder(5.5, 2), 1.5);
  assert.ok(Math.abs(sine(30) - 0.5) < 1e-12);
  assert.ok(Math.abs(cosine(60) - 0.5) < 1e-12);
  assert.ok(Math.abs(arctan(1, 1) - 45) < 1e-12);
  assert.equal(roundoff(1.234), 1);
  assert.equal(roundoff(1.235, 2), 1.24);

  const unit = random();
  assert.ok(unit >= 0 && unit < 1);

  for (let index = 0; index < 50; index += 1) {
    const sample = random(2, 4);
    assert.ok(Number.isInteger(sample));
    assert.ok(sample >= 2 && sample <= 4);
  }

  const floatSample = random(1.5, 2.5);
  assert.ok(floatSample >= 1.5 && floatSample < 2.5);
  assert.throws(() => random(10), LogoError);
});

test("SLEEP pauses for approximately the requested duration", () => {
  const sleep = primitiveFn("SLEEP");
  const start = Date.now();
  assert.equal(sleep(0.05), NO_VALUE);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 45, `expected at least ~50ms, slept ${elapsed}ms`);
  assert.throws(() => sleep("ABC"), LogoError);
});

test("abbreviations and synonyms resolve to the same primitive spec", () => {
  assert.equal(PRIMITIVES.get("F"), PRIMITIVES.get("FIRST"));
  assert.equal(PRIMITIVES.get("BF"), PRIMITIVES.get("BUTFIRST"));
  assert.equal(PRIMITIVES.get("LA"), PRIMITIVES.get("LAST"));
  assert.equal(PRIMITIVES.get("LIST"), PRIMITIVES.get("JOIN"));
  assert.equal(PRIMITIVES.get("SE"), PRIMITIVES.get("SENTENCE"));
  assert.equal(PRIMITIVES.get("WD"), PRIMITIVES.get("WORD"));
  assert.equal(PRIMITIVES.get("AND"), PRIMITIVES.get("BOTH"));
  assert.equal(PRIMITIVES.get("OR"), PRIMITIVES.get("EITHER"));
  assert.equal(PRIMITIVES.get("SUM"), PRIMITIVES.get("PLUS"));
  assert.equal(PRIMITIVES.get("PRODUCT"), PRIMITIVES.get("TIMES"));
  assert.equal(PRIMITIVES.get("RANDOM"), PRIMITIVES.get("LOGO-RANDOM"));
  assert.equal(PRIMITIVES.get("EXPT"), PRIMITIVES.get("INFIX-EXPT"));
});
