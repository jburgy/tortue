/**
 * @file Pure value-producing Logo primitives translated from MIT LISP LOGO.
 */

import {
  PRIMITIVES,
  PROCEDURE_ARITY,
  defPrimitive,
  defAbbreviations,
  LogoError,
  isTrue,
  NO_VALUE,
} from "./types.js";

/** @typedef {import("./types.js").LogoValue} LogoValue */

const TRUE_WORD = "TRUE";
const FALSE_WORD = "FALSE";
const ABOUT_TOLERANCE = 0.01;
const UNSIGNED_NUMBER_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Convert a JS boolean into Logo's predicate words.
 * @param {boolean} condition
 * @returns {string}
 */
function logoBoolean(condition) {
  return condition ? TRUE_WORD : FALSE_WORD;
}

/**
 * Check whether a value is a Logo word in the ES6 runtime.
 * Numbers count as words for the classic word/list primitives.
 * @param {LogoValue} value
 * @returns {boolean}
 */
function isWordLike(value) {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/**
 * Check whether a value is a Logo list.
 * @param {LogoValue} value
 * @returns {value is LogoValue[]}
 */
function isLogoList(value) {
  return Array.isArray(value);
}

/**
 * Throw a LogoError describing an arity mismatch.
 * @param {string} name
 * @param {number} count
 * @param {number} min
 * @param {number|null} [max=min]
 * @returns {never}
 */
function throwArityError(name, count, min, max = min) {
  if (max === null) {
    throw new LogoError(`${name} NEEDS AT LEAST ${min} INPUTS, GOT ${count}`);
  }
  if (min === max) {
    throw new LogoError(`${name} NEEDS ${min} INPUTS, GOT ${count}`);
  }
  throw new LogoError(`${name} NEEDS ${min} TO ${max} INPUTS, GOT ${count}`);
}

/**
 * Ensure a primitive received enough inputs.
 * @param {string} name
 * @param {LogoValue[]} values
 * @param {number} min
 * @param {number|null} [max=min]
 */
function assertArity(name, values, min, max = min) {
  if (values.length < min) {
    throwArityError(name, values.length, min, max);
  }
  if (max !== null && values.length > max) {
    throwArityError(name, values.length, min, max);
  }
}

/**
 * Ensure a value is numeric.
 * @param {string} name
 * @param {LogoValue} value
 * @returns {number}
 */
function expectNumber(name, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LogoError(`${name} DOESN'T LIKE ${String(value)} AS A NUMBER`);
  }
  return value;
}

/**
 * Ensure a value is a Logo list.
 * @param {string} name
 * @param {LogoValue} value
 * @returns {LogoValue[]}
 */
function expectList(name, value) {
  if (!isLogoList(value)) {
    throw new LogoError(`${name} DOESN'T LIKE ${String(value)} AS A LIST`);
  }
  return value;
}

/**
 * Ensure a value is a Logo word or number.
 * @param {string} name
 * @param {LogoValue} value
 * @returns {string|number}
 */
function expectWordLike(name, value) {
  if (!isWordLike(value)) {
    throw new LogoError(`${name} DOESN'T LIKE ${String(value)} AS A WORD`);
  }
  return value;
}

/**
 * Convert a Logo word-like value to its character sequence.
 * @param {string|number} value
 * @returns {string[]}
 */
function logoCharsOf(value) {
  return Array.from(String(value));
}

/**
 * Re-read a character sequence using Logo's word/number conventions.
 * Like LLOGO's LOGOREADLIST, unsigned numerals become numbers; everything
 * else stays a word. Signed numerals are preserved as words, matching the
 * original note that this path does not reliably manufacture negative numbers.
 * @param {string[]} chars
 * @returns {LogoValue}
 */
function charsToWordOrNumber(chars) {
  if (chars.length === 0) {
    return "";
  }
  const text = chars.join("");
  return UNSIGNED_NUMBER_PATTERN.test(text) ? Number(text) : text;
}

/**
 * Compare two Logo values using LLOGO-style case-insensitive word equality.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {boolean}
 */
function logoEqual(left, right) {
  if (typeof left === "string" && typeof right === "string") {
    return left.toUpperCase() === right.toUpperCase();
  }
  if (typeof left === "number" && typeof right === "number") {
    return Object.is(left, right);
  }
  if (isLogoList(left) && isLogoList(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => logoEqual(value, right[index]))
    );
  }
  return false;
}

/**
 * Apply a pairwise comparison across a numeric input list.
 * @param {string} name
 * @param {LogoValue[]} values
 * @param {(left: number, right: number) => boolean} comparator
 * @returns {string}
 */
function compareNumbers(name, values, comparator) {
  assertArity(name, values, 2, null);
  const numbers = values.map((value) => expectNumber(name, value));
  for (let index = 1; index < numbers.length; index += 1) {
    if (!comparator(numbers[index - 1], numbers[index])) {
      return FALSE_WORD;
    }
  }
  return TRUE_WORD;
}

/**
 * Return the first element or character of a Logo value.
 * @param {LogoValue} value
 * @returns {LogoValue}
 */
function firstValue(value) {
  if (isLogoList(value)) {
    if (value.length === 0) {
      throw new LogoError("FIRST OF AN EMPTY THING");
    }
    return value[0];
  }
  const word = expectWordLike("FIRST", value);
  const chars = logoCharsOf(word);
  if (chars.length === 0) {
    throw new LogoError("FIRST OF AN EMPTY THING");
  }
  return charsToWordOrNumber(chars.slice(0, 1));
}

/**
 * Return everything but the first element or character of a Logo value.
 * @param {LogoValue} value
 * @returns {LogoValue}
 */
function butFirstValue(value) {
  if (isLogoList(value)) {
    if (value.length === 0) {
      throw new LogoError("BUTFIRST OF AN EMPTY THING");
    }
    return value.slice(1);
  }
  const word = expectWordLike("BUTFIRST", value);
  const chars = logoCharsOf(word);
  if (chars.length === 0) {
    throw new LogoError("BUTFIRST OF AN EMPTY THING");
  }
  return charsToWordOrNumber(chars.slice(1));
}

/**
 * Return the last element or character of a Logo value.
 * @param {LogoValue} value
 * @returns {LogoValue}
 */
function lastValue(value) {
  if (isLogoList(value)) {
    if (value.length === 0) {
      throw new LogoError("LAST OF AN EMPTY THING");
    }
    return value.at(-1);
  }
  const word = expectWordLike("LAST", value);
  const chars = logoCharsOf(word);
  if (chars.length === 0) {
    throw new LogoError("LAST OF AN EMPTY THING");
  }
  return charsToWordOrNumber(chars.slice(-1));
}

/**
 * Return everything but the last element or character of a Logo value.
 * @param {LogoValue} value
 * @returns {LogoValue}
 */
function butLastValue(value) {
  if (isLogoList(value)) {
    if (value.length === 0) {
      throw new LogoError("BUTLAST OF AN EMPTY THING");
    }
    return value.slice(0, -1);
  }
  const word = expectWordLike("BUTLAST", value);
  const chars = logoCharsOf(word);
  if (chars.length === 0) {
    throw new LogoError("BUTLAST OF AN EMPTY THING");
  }
  return charsToWordOrNumber(chars.slice(0, -1));
}

/**
 * Count the elements of a list or the characters of a word-like value.
 * @param {LogoValue} value
 * @returns {number}
 */
function countValue(value) {
  if (isLogoList(value)) {
    return value.length;
  }
  return logoCharsOf(expectWordLike("COUNT", value)).length;
}

/**
 * Build a list from all supplied inputs.
 * @param {...LogoValue} values
 * @returns {LogoValue[]}
 */
function joinValues(...values) {
  assertArity("JOIN", values, 2, null);
  return values.slice();
}

/**
 * Prepend one or more values to the front of a list.
 * @param {...LogoValue} values
 * @returns {LogoValue[]}
 */
function fputValues(...values) {
  assertArity("FPUT", values, 2, null);
  const list = expectList("FPUT", values.at(-1));
  return [...values.slice(0, -1), ...list];
}

/**
 * Append one or more values to the end of a list.
 * @param {...LogoValue} values
 * @returns {LogoValue[]}
 */
function lputValues(...values) {
  assertArity("LPUT", values, 2, null);
  const list = expectList("LPUT", values.at(-1));
  return [...list, ...values.slice(0, -1)];
}

/**
 * Concatenate words and splice list inputs one level deep.
 * @param {...LogoValue} values
 * @returns {LogoValue[]}
 */
function sentenceValues(...values) {
  assertArity("SENTENCE", values, 2, null);
  const result = [];
  for (const value of values) {
    if (isWordLike(value)) {
      result.push(value);
      continue;
    }
    if (isLogoList(value)) {
      result.push(...value);
      continue;
    }
    throw new LogoError(`SENTENCE DOESN'T LIKE ${String(value)} AS INPUT`);
  }
  return result;
}

/**
 * Explode a word-like value into Logo characters for WORD.
 * @param {LogoValue} value
 * @returns {string[]}
 */
function wordExplode(value) {
  return logoCharsOf(expectWordLike("WORD", value));
}

/**
 * Concatenate one or more word-like inputs into a new Logo word or number.
 * @param {...LogoValue} values
 * @returns {LogoValue}
 */
function wordValues(...values) {
  assertArity("WORD", values, 2, null);
  return charsToWordOrNumber(values.flatMap((value) => wordExplode(value)));
}

/**
 * Produce a one-character word from a numeric character code (the inverse
 * of `ASCII`).
 * @param {LogoValue} value
 * @returns {string}
 */
function charValue(value) {
  return String.fromCharCode(Math.trunc(expectNumber("CHAR", value)));
}

/**
 * Produce the numeric character code of a one-character word (the inverse
 * of `CHAR`).
 * @param {LogoValue} value
 * @returns {number}
 */
function asciiValue(value) {
  const word = expectWordLike("ASCII", value);
  const text = String(word);
  if (text.length !== 1) {
    throw new LogoError(`ASCII DOESN'T LIKE ${text} AS A ONE-CHARACTER WORD`);
  }
  return text.charCodeAt(0);
}

/**
 * Test whether a name is a currently-defined procedure.
 * @param {LogoValue} value
 * @returns {string}
 */
function contentspValue(value) {
  return logoBoolean(
    typeof value === "string" && PROCEDURE_ARITY.has(value.toUpperCase())
  );
}

/**
 * Test whether a name refers to a registered primitive.
 * @param {LogoValue} value
 * @returns {string}
 */
function primitivepValue(value) {
  return logoBoolean(
    typeof value === "string" &&
      PRIMITIVES.has(value.toUpperCase()) &&
      !PROCEDURE_ARITY.has(value.toUpperCase())
  );
}

/**
 * Test whether inputs are in strictly descending numeric order.
 * @param {...LogoValue} values
 * @returns {string}
 */
function greaterpValues(...values) {
  return compareNumbers("GREATERP", values, (left, right) => left > right);
}

/**
 * Test whether inputs are in strictly ascending numeric order.
 * @param {...LogoValue} values
 * @returns {string}
 */
function lesspValues(...values) {
  return compareNumbers("LESSP", values, (left, right) => left < right);
}

/**
 * `<=` infix: true when the left number is not greater than the right.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {string}
 */
function lessOrEqualValue(left, right) {
  return logoBoolean(expectNumber("<=", left) <= expectNumber("<=", right));
}

/**
 * `>=` infix: true when the left number is not less than the right.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {string}
 */
function greaterOrEqualValue(left, right) {
  return logoBoolean(expectNumber(">=", left) >= expectNumber(">=", right));
}

/**
 * `<>` infix: true when the two inputs are not Logo-equal.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {string}
 */
function notEqualValue(left, right) {
  return logoBoolean(!logoEqual(left, right));
}

/**
 * Test whether a numeric input is zero.
 * @param {LogoValue} value
 * @returns {string}
 */
function zeropValue(value) {
  return logoBoolean(expectNumber("ZEROP", value) === 0);
}

/**
 * Test whether an input is a number.
 * @param {LogoValue} value
 * @returns {string}
 */
function numberpValue(value) {
  return logoBoolean(typeof value === "number" && Number.isFinite(value));
}

/**
 * Test Logo equality.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {string}
 */
function equalValue(left, right) {
  return logoBoolean(logoEqual(left, right));
}

/**
 * Test whether an input is a Logo word.
 * @param {LogoValue} value
 * @returns {string}
 */
function wordpValue(value) {
  return logoBoolean(isWordLike(value));
}

/**
 * Test whether a list contains a given value.
 * @param {LogoValue} value
 * @param {LogoValue} list
 * @returns {string}
 */
function memberValue(value, list) {
  return logoBoolean(expectList("MEMBER", list).some((item) => logoEqual(item, value)));
}

/**
 * Test whether an input is the empty word.
 * @param {LogoValue} value
 * @returns {string}
 */
function emptywpValue(value) {
  return logoBoolean(typeof value === "string" && value.length === 0);
}

/**
 * Test whether an input is the empty sentence.
 * @param {LogoValue} value
 * @returns {string}
 */
function nullValue(value) {
  return logoBoolean(isLogoList(value) && value.length === 0);
}

/**
 * Test whether an input is either the empty word or empty sentence.
 * @param {LogoValue} value
 * @returns {string}
 */
function emptypValue(value) {
  return logoBoolean(
    (typeof value === "string" && value.length === 0) ||
      (isLogoList(value) && value.length === 0)
  );
}

/**
 * Test whether an input is a sentence (a flat list of words).
 * @param {LogoValue} value
 * @returns {string}
 */
function sentencepValue(value) {
  return logoBoolean(isLogoList(value) && value.every((item) => isWordLike(item)));
}

/**
 * Test whether an input is a list.
 * @param {LogoValue} value
 * @returns {string}
 */
function listpValue(value) {
  return logoBoolean(isLogoList(value));
}

/**
 * Test approximate numeric equality using LLOGO's tolerance.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {string}
 */
function isaboutValue(left, right) {
  return logoBoolean(
    Math.abs(expectNumber("ISABOUT", left) - expectNumber("ISABOUT", right)) <
      ABOUT_TOLERANCE
  );
}

/**
 * Logical conjunction over Logo truth values.
 * @param {...LogoValue} values
 * @returns {string}
 */
function bothValues(...values) {
  assertArity("BOTH", values, 2, null);
  return logoBoolean(values.every((value) => isTrue(value)));
}

/**
 * Logical disjunction over Logo truth values.
 * @param {...LogoValue} values
 * @returns {string}
 */
function eitherValues(...values) {
  assertArity("EITHER", values, 2, null);
  return logoBoolean(values.some((value) => isTrue(value)));
}

/**
 * Subtract one number from another.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {number}
 */
function differenceValue(left, right) {
  return expectNumber("DIFFERENCE", left) - expectNumber("DIFFERENCE", right);
}

/**
 * Negate a number.
 * @param {LogoValue} value
 * @returns {number}
 */
function prefixMinusValue(value) {
  return -expectNumber("-", value);
}

/**
 * Return a numeric input unchanged.
 * @param {LogoValue} value
 * @returns {number}
 */
function prefixPlusValue(value) {
  return expectNumber("+", value);
}

/**
 * Divide one number by another.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {number}
 */
function quotientValue(left, right) {
  return expectNumber("QUOTIENT", left) / expectNumber("QUOTIENT", right);
}

/**
 * Sum two or more numbers.
 * @param {...LogoValue} values
 * @returns {number}
 */
function plusValues(...values) {
  assertArity("PLUS", values, 2, null);
  return values.reduce((sum, value) => sum + expectNumber("PLUS", value), 0);
}

/**
 * Multiply two or more numbers.
 * @param {...LogoValue} values
 * @returns {number}
 */
function timesValues(...values) {
  assertArity("TIMES", values, 2, null);
  return values.reduce((product, value) => product * expectNumber("TIMES", value), 1);
}

/**
 * Raise a number to a power.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {number}
 */
function exptValue(left, right) {
  return expectNumber("EXPT", left) ** expectNumber("EXPT", right);
}

/**
 * Return the largest of two or more numbers.
 * @param {...LogoValue} values
 * @returns {number}
 */
function maxValues(...values) {
  assertArity("MAX", values, 2, null);
  return Math.max(...values.map((value) => expectNumber("MAX", value)));
}

/**
 * Return the smallest of two or more numbers.
 * @param {...LogoValue} values
 * @returns {number}
 */
function minValues(...values) {
  assertArity("MIN", values, 2, null);
  return Math.min(...values.map((value) => expectNumber("MIN", value)));
}

/**
 * Return the fixed- or floating-point remainder of a division.
 * @param {LogoValue} left
 * @param {LogoValue} right
 * @returns {number}
 */
function remainderValue(left, right) {
  return expectNumber("REMAINDER", left) % expectNumber("REMAINDER", right);
}

/**
 * Compute the sine of an angle in degrees.
 * @param {LogoValue} value
 * @returns {number}
 */
function sineValue(value) {
  return Math.sin((expectNumber("SINE", value) * Math.PI) / 180);
}

/**
 * Compute the cosine of an angle in degrees.
 * @param {LogoValue} value
 * @returns {number}
 */
function cosineValue(value) {
  return Math.cos((expectNumber("COSINE", value) * Math.PI) / 180);
}

/**
 * Compute an angle in degrees from two numeric inputs.
 * @param {LogoValue} x
 * @param {LogoValue} y
 * @returns {number}
 */
function arctanValue(x, y) {
  return (Math.atan2(expectNumber("ARCTAN", x), expectNumber("ARCTAN", y)) * 180) / Math.PI;
}

/**
 * Round a number to the nearest integer or to a requested count of places.
 * @param {...LogoValue} values
 * @returns {number}
 */
function roundoffValues(...values) {
  assertArity("ROUNDOFF", values, 1, 2);
  const value = expectNumber("ROUNDOFF", values[0]);
  if (Number.isInteger(value)) {
    return value;
  }
  if (values.length === 1) {
    return Math.round(value);
  }
  const places = Math.trunc(expectNumber("ROUNDOFF", values[1]));
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/**
 * Pause execution for the given number of seconds, the ES6 analog of
 * `primit.304`'s `SLEEP`. Implemented as a real-time busy-wait rather than
 * a JS `setTimeout`/`Promise`, because the interpreter (and every primitive
 * in it, including this one) is plain synchronous recursive-descent code —
 * see docs/ARCHITECTURE.md's rationale for running the whole interpreter
 * in a Web Worker instead of threading `async`/`await` through every call.
 * Blocking the worker's single thread like this is harmless: it doesn't
 * freeze the page (the worker is isolated from the main thread), and
 * `Worker.terminate()` can still forcibly stop it mid-wait.
 * @param {LogoValue} seconds
 * @returns {typeof NO_VALUE}
 */
function sleepValue(seconds) {
  const duration = expectNumber("SLEEP", seconds);
  const until = Date.now() + duration * 1000;
  while (Date.now() < until) {
    // Busy-wait: see the doc comment above for why this is acceptable here.
  }
  return NO_VALUE;
}

/**
 * Generate a Logo random number.
 * With no inputs this returns a floating-point value in [0, 1).
 * With two numeric inputs it returns a random value between them, inclusive
 * for integer bounds and half-open for floating bounds, matching LLOGO.
 * @param {...LogoValue} values
 * @returns {number}
 */
function randomValues(...values) {
  assertArity("RANDOM", values, 0, 2);
  const random = Math.random();
  if (values.length === 0) {
    return random;
  }
  if (values.length !== 2) {
    throw new LogoError("RANDOM IN LLOGO ACCEPTS EITHER 0 OR 2 INPUTS");
  }
  const lower = expectNumber("RANDOM", values[0]);
  const upper = expectNumber("RANDOM", values[1]);
  if (Number.isInteger(lower) && Number.isInteger(upper)) {
    return Math.trunc(lower + (upper + 1 - lower) * random);
  }
  return lower + (upper - lower) * random;
}

/**
 * Register a primitive and its aliases.
 * @param {string} name
 * @param {{kind: 'expr'|'fexpr', arity: number|'L', fn: (...args: any[]) => any}} spec
 * @param {string[]} [aliases=[]]
 */
function registerPrimitive(name, spec, aliases = []) {
  defPrimitive(name, spec);
  if (aliases.length > 0) {
    defAbbreviations(name, aliases);
  }
}

/**
 * Populate the shared primitive registry with the pure data primitives.
 */
function registerPrimitives() {
  registerPrimitive("FIRST", { kind: "expr", arity: 1, fn: firstValue }, ["F"]);
  registerPrimitive("BUTFIRST", { kind: "expr", arity: 1, fn: butFirstValue }, ["BF"]);
  registerPrimitive("LOGO-LAST", { kind: "expr", arity: 1, fn: lastValue }, ["LAST", "LA"]);
  registerPrimitive("BUTLAST", { kind: "expr", arity: 1, fn: butLastValue }, ["BL"]);
  registerPrimitive("COUNT", { kind: "expr", arity: 1, fn: countValue });
  registerPrimitive("JOIN", { kind: "expr", arity: "L", fn: joinValues }, ["LIST"]);
  registerPrimitive("FPUT", { kind: "expr", arity: "L", fn: fputValues });
  registerPrimitive("LPUT", { kind: "expr", arity: "L", fn: lputValues });
  registerPrimitive("SENTENCE", { kind: "expr", arity: "L", fn: sentenceValues }, ["S", "SE"]);
  registerPrimitive("WORD", { kind: "expr", arity: "L", fn: wordValues }, ["WD", "&"]);
  registerPrimitive("CHAR", { kind: "expr", arity: 1, fn: charValue });
  registerPrimitive("ASCII", { kind: "expr", arity: 1, fn: asciiValue });

  registerPrimitive("CONTENTSP", { kind: "expr", arity: 1, fn: contentspValue });
  registerPrimitive("PRIMITIVEP", { kind: "expr", arity: 1, fn: primitivepValue });
  registerPrimitive("GREATERP", { kind: "expr", arity: "L", fn: greaterpValues }, [
    "GP",
    "GREATER",
    "GR",
  ]);
  registerPrimitive("INFIX-GREATERP", { kind: "expr", arity: 2, fn: greaterpValues }, [">"]);
  registerPrimitive("LESSP", { kind: "expr", arity: "L", fn: lesspValues }, [
    "LP",
    "LESS",
    "LE",
  ]);
  registerPrimitive("INFIX-LESSP", { kind: "expr", arity: 2, fn: lesspValues }, ["<"]);
  registerPrimitive("ZEROP", { kind: "expr", arity: 1, fn: zeropValue }, ["ZP"]);
  registerPrimitive("NUMBERP", { kind: "expr", arity: 1, fn: numberpValue }, ["NP"]);
  registerPrimitive("ISABOUT", { kind: "expr", arity: 2, fn: isaboutValue });
  registerPrimitive("EQUAL", { kind: "expr", arity: 2, fn: equalValue }, ["IS"]);
  registerPrimitive("INFIX-EQUAL", { kind: "expr", arity: 2, fn: equalValue }, ["="]);
  registerPrimitive("INFIX-LESS-OR-EQUAL", { kind: "expr", arity: 2, fn: lessOrEqualValue }, ["<="]);
  registerPrimitive("INFIX-GREATER-OR-EQUAL", { kind: "expr", arity: 2, fn: greaterOrEqualValue }, [">="]);
  registerPrimitive("INFIX-NOT-EQUAL", { kind: "expr", arity: 2, fn: notEqualValue }, ["<>"]);
  registerPrimitive("WORDP", { kind: "expr", arity: 1, fn: wordpValue }, ["WP"]);
  registerPrimitive("MEMBER", { kind: "expr", arity: 2, fn: memberValue }, ["MEMBERP", "MP"]);
  registerPrimitive("BOTH", { kind: "expr", arity: "L", fn: bothValues }, ["AND", "B"]);
  registerPrimitive("EITHER", { kind: "expr", arity: "L", fn: eitherValues }, ["OR", "EI"]);
  registerPrimitive("EMPTYWP", { kind: "expr", arity: 1, fn: emptywpValue }, ["EWP"]);
  registerPrimitive("NULL", { kind: "expr", arity: 1, fn: nullValue }, ["EMPTYSP", "ESP"]);
  registerPrimitive("EMPTYP", { kind: "expr", arity: 1, fn: emptypValue }, ["EP"]);
  registerPrimitive("SENTENCEP", { kind: "expr", arity: 1, fn: sentencepValue }, ["SP"]);
  registerPrimitive("LISTP", { kind: "expr", arity: 1, fn: listpValue });

  registerPrimitive("LOGO-RANDOM", { kind: "expr", arity: "L", fn: randomValues }, ["RANDOM"]);
  registerPrimitive("ROUNDOFF", { kind: "expr", arity: "L", fn: roundoffValues });
  registerPrimitive("DIFFERENCE", { kind: "expr", arity: 2, fn: differenceValue }, ["DIFF"]);
  registerPrimitive("INFIX-DIFFERENCE", { kind: "expr", arity: 2, fn: differenceValue }, ["-"]);
  registerPrimitive("PREFIX-MINUS", { kind: "expr", arity: 1, fn: prefixMinusValue }, ["MINUS"]);
  registerPrimitive("PREFIX-PLUS", { kind: "expr", arity: 1, fn: prefixPlusValue });
  registerPrimitive("QUOTIENT", { kind: "expr", arity: 2, fn: quotientValue }, ["QUO", "/"]);
  registerPrimitive("INFIX-QUOTIENT", { kind: "expr", arity: 2, fn: quotientValue }, ["//"]);
  registerPrimitive("PLUS", { kind: "expr", arity: "L", fn: plusValues }, ["SUM"]);
  registerPrimitive("INFIX-PLUS", { kind: "expr", arity: 2, fn: plusValues }, ["+"]);
  registerPrimitive("TIMES", { kind: "expr", arity: "L", fn: timesValues }, [
    "PRODUCT",
    "PROD",
  ]);
  registerPrimitive("INFIX-TIMES", { kind: "expr", arity: 2, fn: timesValues }, ["*"]);
  registerPrimitive("INFIX-EXPT", { kind: "expr", arity: 2, fn: exptValue }, ["EXPT", "^"]);
  registerPrimitive("MAX", { kind: "expr", arity: "L", fn: maxValues }, ["MAXIMUM"]);
  registerPrimitive("MIN", { kind: "expr", arity: "L", fn: minValues }, ["MINIMUM"]);
  registerPrimitive("REMAINDER", { kind: "expr", arity: 2, fn: remainderValue }, ["MOD"]);
  registerPrimitive("INFIX-REMAINDER", { kind: "expr", arity: 2, fn: remainderValue }, ["\\"]);
  registerPrimitive("SINE", { kind: "expr", arity: 1, fn: sineValue });
  registerPrimitive("COSINE", { kind: "expr", arity: 1, fn: cosineValue });
  registerPrimitive("ARCTAN", { kind: "expr", arity: 2, fn: arctanValue }, ["ATANGENT"]);
  registerPrimitive("SLEEP", { kind: "expr", arity: 1, fn: sleepValue });
}

registerPrimitives();
