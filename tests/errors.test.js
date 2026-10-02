import assert from "node:assert/strict";
import { test } from "node:test";

import {
  unboundVariable,
  undefinedFunction,
  wrongNumberOfArgs,
  wrongTypeArgument,
} from "../src/errors.js";
import { LogoError, NO_VALUE } from "../src/types.js";

test("unboundVariable returns a LogoError with classic wording", () => {
  const error = unboundVariable("size");

  assert.ok(error instanceof LogoError);
  assert.equal(error.name, "LogoError");
  assert.equal(error.message, "SIZE HAS NO VALUE");
});

test("undefinedFunction returns a LogoError with classic wording", () => {
  const error = undefinedFunction("polygon");

  assert.ok(error instanceof LogoError);
  assert.equal(error.name, "LogoError");
  assert.equal(error.message, "POLYGON IS AN UNDEFINED FUNCTION");
});

test("wrongTypeArgument formats the offending Logo value", () => {
  const error = wrongTypeArgument("FIRST", ["A", "B"]);

  assert.ok(error instanceof LogoError);
  assert.equal(error.name, "LogoError");
  assert.equal(error.message, "THE INPUT [A B] TO FIRST IS OF THE WRONG TYPE");
});

test("wrongTypeArgument handles inputs that did not output", () => {
  const error = wrongTypeArgument("SUM", NO_VALUE);

  assert.ok(error instanceof LogoError);
  assert.equal(error.name, "LogoError");
  assert.equal(
    error.message,
    "AN ARGUMENT TO SUM WAS SOMETHING THAT DIDN'T OUTPUT"
  );
});

test("wrongNumberOfArgs returns the generic message when arity is unknown", () => {
  const error = wrongNumberOfArgs("REPEAT");

  assert.ok(error instanceof LogoError);
  assert.equal(error.name, "LogoError");
  assert.equal(error.message, "WRONG NUMBER OF INPUTS TO REPEAT");
});

test("wrongNumberOfArgs can render fixed and ranged expectations", () => {
  const fixed = wrongNumberOfArgs("WORD", 2);
  const ranged = wrongNumberOfArgs("TEST", { min: 1, max: 2 });

  assert.equal(fixed.message, "WORD EXPECTED 2 INPUTS");
  assert.equal(ranged.message, "TEST EXPECTED BETWEEN 1 AND 2 INPUTS");
});
