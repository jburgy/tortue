/**
 * @file End-to-end integration tests: real Logo source text, through the
 * actual lexer → parser → interpreter → primitives → turtle, with no
 * stand-ins. This is the test that validates the independently-translated
 * modules actually cohere, as opposed to each module's own unit tests
 * (which necessarily mock their neighbors).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runProgram } from "../src/program.js";
import { Environment } from "../src/interpreter.js";
import { Turtle, getDefaultTurtle, setDefaultTurtle } from "../src/turtle.js";
import { setOutputSink, getOutputBuffer, clearOutputBuffer } from "../src/printer.js";
import "../src/primitives.js";

/** Install a fresh recording Turtle as the default and return its line log. */
function freshTurtle() {
  /** @type {{x1:number,y1:number,x2:number,y2:number}[]} */
  const lines = [];
  const turtle = new Turtle({
    line: (x1, y1, x2, y2) => lines.push({ x1, y1, x2, y2 }),
    clear: () => {
      lines.length = 0;
    },
  });
  setDefaultTurtle(turtle);
  return { turtle, lines };
}

test("REPEAT + FORWARD/RIGHT draws a closed square", () => {
  const { turtle, lines } = freshTurtle();
  runProgram("REPEAT 4 [FORWARD 100 RIGHT 90]");
  assert.equal(lines.length, 4);
  // Back at the origin, facing the original heading.
  assert.equal(Math.round(turtle.xcor()), 0);
  assert.equal(Math.round(turtle.ycor()), 0);
  assert.equal(turtle.heading(), 0);
});

test("TO ... END defines a callable procedure with a parameter", () => {
  freshTurtle();
  const { env } = runProgram(
    [
      "TO SQUARE :SIZE",
      "REPEAT 4 [FORWARD :SIZE RIGHT 90]",
      "END",
      "SQUARE 50",
    ].join("\n")
  );
  const turtle = getDefaultTurtle();
  assert.equal(Math.round(turtle.xcor()), 0);
  assert.equal(Math.round(turtle.ycor()), 0);
});

test("mutual/forward procedure references resolve thanks to the two-pass scan", () => {
  clearOutputBuffer();
  const output = [];
  setOutputSink((t) => output.push(t));
  runProgram(
    [
      "TO PING :N",
      "IF :N = 0 [STOP]",
      "PRINT :N",
      "PONG DIFFERENCE :N 1",
      "END",
      "TO PONG :N",
      "IF :N = 0 [STOP]",
      "PING :N",
      "END",
      "PING 2",
    ].join("\n")
  );
  setOutputSink(null);
  assert.equal(output.join(""), "2\n1\n");
});

test("arithmetic and comparison infix operators parse with correct precedence", () => {
  clearOutputBuffer();
  const output = [];
  setOutputSink((t) => output.push(t));
  runProgram("PRINT 1 + 2 * 3\nPRINT (1 + 2) * 3\nPRINT 5 > 3\n");
  setOutputSink(null);
  assert.equal(output.join(""), "7\n9\nTRUE\n");
});

test("variables: MAKE/THING (:x) round-trip through a procedure call", () => {
  clearOutputBuffer();
  const output = [];
  setOutputSink((t) => output.push(t));
  runProgram(
    [
      "MAKE \"X 10",
      "TO BUMP",
      "MAKE \"X :X + 1",
      "END",
      "BUMP",
      "BUMP",
      "PRINT :X",
    ].join("\n")
  );
  setOutputSink(null);
  assert.equal(output.join(""), "12\n");
});

test("WHILE loop runs its bracketed body the expected number of times", () => {
  clearOutputBuffer();
  const output = [];
  setOutputSink((t) => output.push(t));
  runProgram(
    [
      'MAKE "N 0',
      'WHILE :N < 3 [PRINT :N MAKE "N :N + 1]',
    ].join("\n")
  );
  setOutputSink(null);
  assert.equal(output.join(""), "0\n1\n2\n");
});
