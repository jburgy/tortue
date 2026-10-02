import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_VALUE,
  VarRef,
  LogoListLit,
  CallExpr,
  Procedure,
  OutputSignal,
  GoSignal,
  LogoError,
  PRIMITIVES,
  defPrimitive,
  defAbbreviations,
  isTrue,
} from "../src/types.js";

test("NO_VALUE is a unique symbol", () => {
  assert.equal(typeof NO_VALUE, "symbol");
});

test("VarRef, CallExpr, LogoListLit, Procedure store their fields", () => {
  const v = new VarRef("X");
  assert.equal(v.name, "X");

  const lit = new LogoListLit([1, 2, 3]);
  assert.deepEqual(lit.items, [1, 2, 3]);

  const call = new CallExpr("FORWARD", [100]);
  assert.equal(call.name, "FORWARD");
  assert.deepEqual(call.args, [100]);

  const proc = new Procedure("SQUARE", ["SIZE"], [
    { tag: null, forms: [new CallExpr("FORWARD", [new VarRef("SIZE")])] },
  ]);
  assert.equal(proc.name, "SQUARE");
  assert.deepEqual(proc.params, ["SIZE"]);
  assert.equal(proc.body.length, 1);
});

test("OutputSignal and GoSignal carry their payload", () => {
  const out = new OutputSignal(42);
  assert.equal(out.value, 42);
  const go = new GoSignal(20);
  assert.equal(go.tag, 20);
});

test("LogoError is an Error with name LogoError", () => {
  const err = new LogoError("FORWARD DOESN'T LIKE INPUT WORD");
  assert.ok(err instanceof Error);
  assert.equal(err.name, "LogoError");
  assert.equal(err.message, "FORWARD DOESN'T LIKE INPUT WORD");
});

test("defPrimitive registers into the shared PRIMITIVES map and rejects duplicates", () => {
  defPrimitive("TEST.DUMMY", { kind: "expr", arity: 1, fn: (x) => x });
  assert.ok(PRIMITIVES.has("TEST.DUMMY"));
  assert.throws(() =>
    defPrimitive("TEST.DUMMY", { kind: "expr", arity: 1, fn: (x) => x })
  );
});

test("defAbbreviations aliases an existing primitive", () => {
  defPrimitive("TEST.FORWARD", { kind: "expr", arity: 1, fn: (x) => x });
  defAbbreviations("TEST.FORWARD", ["TEST.FD"]);
  assert.equal(PRIMITIVES.get("TEST.FD"), PRIMITIVES.get("TEST.FORWARD"));
  assert.throws(() => defAbbreviations("TEST.NOPE", ["TEST.NOPE2"]));
});

test("isTrue treats everything but the word FALSE as true", () => {
  assert.equal(isTrue("TRUE"), true);
  assert.equal(isTrue("FALSE"), false);
  assert.equal(isTrue("false"), false);
  assert.equal(isTrue(0), true);
  assert.equal(isTrue(""), true);
  assert.equal(isTrue([]), true);
});
