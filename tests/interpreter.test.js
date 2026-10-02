import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Environment,
  evalExpr,
  callProcedure,
  runBody,
  declareProcedure,
  defineProcedure,
  setRunList,
  PROCEDURES,
} from "../src/interpreter.js";
import {
  VarRef,
  CallExpr,
  LogoListLit,
  Procedure,
  NO_VALUE,
  defPrimitive,
  PRIMITIVES,
} from "../src/types.js";

// A couple of harmless test-only primitives, namespaced to avoid clashing
// with real ones registered by other modules sharing the same PRIMITIVES map.
if (!PRIMITIVES.has("TEST.ADD")) {
  defPrimitive("TEST.ADD", { kind: "expr", arity: 2, fn: (a, b) => a + b });
}
if (!PRIMITIVES.has("TEST.GT")) {
  defPrimitive("TEST.GT", {
    kind: "expr",
    arity: 2,
    fn: (a, b) => (a > b ? "TRUE" : "FALSE"),
  });
}

test("Environment: MAKE sets global, THING reads it, unbound THING throws", () => {
  const env = new Environment();
  assert.throws(() => env.thing("X"));
  env.make("X", 42);
  assert.equal(env.thing("x"), 42); // case-insensitive
});

test("Environment: LOCAL shadows and unlocal restores the outer value", () => {
  const env = new Environment();
  env.make("X", "GLOBAL");
  env.pushFrame();
  env.local("X");
  env.make("X", "LOCAL");
  assert.equal(env.thing("X"), "LOCAL");
  env.popFrame();
  assert.equal(env.thing("X"), "GLOBAL");
});

test("evalExpr: literal list materializes nested LogoListLit into arrays", () => {
  const env = new Environment();
  const lit = new LogoListLit([1, "A", new LogoListLit([2, 3])]);
  assert.deepEqual(evalExpr(lit, env), [1, "A", [2, 3]]);
});

test("evalExpr: VarRef reads from the environment", () => {
  const env = new Environment();
  env.make("Y", "HELLO");
  assert.equal(evalExpr(new VarRef("Y"), env), "HELLO");
});

test("evalExpr: CallExpr invokes a registered primitive with evaluated args", () => {
  const env = new Environment();
  const call = new CallExpr("TEST.ADD", [1, new CallExpr("TEST.ADD", [2, 3])]);
  assert.equal(evalExpr(call, env), 6);
});

test("callProcedure: binds params as locals, unbinds on return", () => {
  const env = new Environment();
  env.make("SIZE", "OUTER");
  const proc = new Procedure(
    "ECHO",
    ["SIZE"],
    [{ tag: null, forms: [new CallExpr("OUTPUT", [new VarRef("SIZE")])] }]
  );
  const result = callProcedure(proc, [99], env);
  assert.equal(result, 99);
  assert.equal(env.thing("SIZE"), "OUTER");
});

test("callProcedure: wrong argument count throws", () => {
  const env = new Environment();
  const proc = new Procedure("NEEDS2", ["A", "B"], []);
  assert.throws(() => callProcedure(proc, [1], env));
});

test("runBody: falls off the end with NO_VALUE when there is no OUTPUT/STOP", () => {
  const env = new Environment();
  const body = [{ tag: null, forms: [new CallExpr("TEST.ADD", [1, 1])] }];
  assert.equal(runBody(body, env), NO_VALUE);
});

test("runBody: OUTPUT stops the procedure immediately with its value", () => {
  const env = new Environment();
  const body = [
    { tag: null, forms: [new CallExpr("OUTPUT", [7])] },
    { tag: null, forms: [new CallExpr("OUTPUT", [999])] },
  ];
  assert.equal(runBody(body, env), 7);
});

test("runBody: STOP is OUTPUT NO_VALUE", () => {
  const env = new Environment();
  const body = [{ tag: null, forms: [new CallExpr("STOP", [])] }];
  assert.equal(runBody(body, env), NO_VALUE);
});

test("runBody: GO jumps to the matching numbered line, supporting backward loops", () => {
  const env = new Environment();
  env.make("N", 0);
  // 10: N <- N+1 / 20: IF N < 3 GO 10 / OUTPUT N
  const body = [
    {
      tag: 10,
      forms: [
        new CallExpr("MAKE", ["N", new CallExpr("TEST.ADD", [new VarRef("N"), 1])]),
      ],
    },
    {
      tag: 20,
      forms: [
        new CallExpr("IF", [
          new CallExpr("TEST.GT", [3, new VarRef("N")]),
          new CallExpr("GO", [10]),
        ]),
        new CallExpr("OUTPUT", [new VarRef("N")]),
      ],
    },
  ];
  assert.equal(runBody(body, env), 3);
});

test("runBody: GO to an unknown tag raises a LogoError", () => {
  const env = new Environment();
  const body = [{ tag: null, forms: [new CallExpr("GO", [999])] }];
  assert.throws(() => runBody(body, env));
});

test("TEST/IFTRUE/IFFALSE follow the global TESTFLAG convention", () => {
  const env = new Environment();
  evalExpr(new CallExpr("TEST", ["TRUE"]), env);
  assert.equal(evalExpr(new CallExpr("IFTRUE", [1]), env), 1);
  assert.equal(evalExpr(new CallExpr("IFFALSE", [2]), env), NO_VALUE);

  evalExpr(new CallExpr("TEST", ["FALSE"]), env);
  assert.equal(evalExpr(new CallExpr("IFTRUE", [1]), env), NO_VALUE);
  assert.equal(evalExpr(new CallExpr("IFFALSE", [2]), env), 2);
});

test("IF evaluates the rest of the line only when the condition is true", () => {
  const env = new Environment();
  assert.equal(evalExpr(new CallExpr("IF", ["TRUE", 1, 2]), env), 2);
  assert.equal(evalExpr(new CallExpr("IF", ["FALSE", 1, 2]), env), NO_VALUE);
});

test("REPEAT runs its body N times and threads a shared environment", () => {
  const env = new Environment();
  env.make("N", 0);
  const body = new CallExpr("MAKE", [
    "N",
    new CallExpr("TEST.ADD", [new VarRef("N"), 1]),
  ]);
  evalExpr(new CallExpr("REPEAT", [4, body]), env);
  assert.equal(env.thing("N"), 4);
});

test("WHILE/UNTIL loop based on a live condition", () => {
  const env = new Environment();
  env.make("N", 0);
  const cond = new CallExpr("TEST.GT", [5, new VarRef("N")]);
  const incr = new CallExpr("MAKE", [
    "N",
    new CallExpr("TEST.ADD", [new VarRef("N"), 1]),
  ]);
  evalExpr(new CallExpr("WHILE", [cond, incr]), env);
  assert.equal(env.thing("N"), 5);

  env.make("M", 0);
  const stopCond = new CallExpr("TEST.GT", [new VarRef("M"), 2]);
  const incrM = new CallExpr("MAKE", [
    "M",
    new CallExpr("TEST.ADD", [new VarRef("M"), 1]),
  ]);
  evalExpr(new CallExpr("UNTIL", [stopCond, incrM]), env);
  assert.equal(env.thing("M"), 3);
});

test("FOREVER loops until an OUTPUT/STOP unwinds it from within a procedure", () => {
  const env = new Environment();
  env.make("N", 0);
  const proc = new Procedure(
    "COUNT.TO.THREE",
    [],
    [
      {
        tag: null,
        forms: [
          new CallExpr("FOREVER", [
            new CallExpr("MAKE", [
              "N",
              new CallExpr("TEST.ADD", [new VarRef("N"), 1]),
            ]),
            new CallExpr("IF", [
              new CallExpr("TEST.GT", [new VarRef("N"), 2]),
              new CallExpr("OUTPUT", [new VarRef("N")]),
            ]),
          ]),
        ],
      },
    ]
  );
  assert.equal(callProcedure(proc, [], env), 3);
});

test("LOCAL declares one or more fresh procedure-local variables", () => {
  const env = new Environment();
  env.make("X", "OUTER");
  const proc = new Procedure(
    "USES.LOCAL",
    [],
    [
      {
        tag: null,
        forms: [
          new CallExpr("LOCAL", [["X"]]),
          new CallExpr("MAKE", ["X", "INNER"]),
          new CallExpr("OUTPUT", [new VarRef("X")]),
        ],
      },
    ]
  );
  assert.equal(callProcedure(proc, [], env), "INNER");
  assert.equal(env.thing("X"), "OUTER");
});

test("declareProcedure/defineProcedure register procedures callable via evalExpr", () => {
  declareProcedure("SQUARE.IT", ["N"]);
  defineProcedure(
    new Procedure(
      "SQUARE.IT",
      ["N"],
      [
        {
          tag: null,
          forms: [
            new CallExpr("OUTPUT", [
              new CallExpr("TEST.ADD", [new VarRef("N"), new VarRef("N")]),
            ]),
          ],
        },
      ]
    )
  );
  const env = new Environment();
  assert.equal(evalExpr(new CallExpr("SQUARE.IT", [21]), env), 42);
  assert.ok(PROCEDURES.has("SQUARE.IT"));
});

test("runList is injectable via setRunList and used by REPEAT/IF for bracketed bodies", () => {
  // Simulate parser.js's parseLine: turn a flat array of words/numbers into
  // CallExpr forms using the same test primitives, without depending on the
  // real parser module (written by a parallel agent).
  setRunList((tokens) => {
    const forms = [];
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i] === "TEST.ADD") {
        forms.push(new CallExpr("MAKE", ["N", new CallExpr("TEST.ADD", [new VarRef("N"), tokens[i + 1]])]));
        i += 2;
      } else {
        i += 1;
      }
    }
    return forms;
  });

  const env = new Environment();
  env.make("N", 0);
  const bracketed = new LogoListLit(["TEST.ADD", 5]);
  evalExpr(new CallExpr("REPEAT", [3, bracketed]), env);
  assert.equal(env.thing("N"), 15);
});

test("evalExpr: calling an undefined name throws a LogoError", () => {
  const env = new Environment();
  assert.throws(() => evalExpr(new CallExpr("NO.SUCH.THING", []), env));
});
