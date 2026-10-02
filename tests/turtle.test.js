import assert from "node:assert/strict";
import { test } from "node:test";

import { PRIMITIVES } from "../src/types.js";
import { Turtle } from "../src/turtle.js";

/**
 * @returns {{lines: Array<{x1:number, y1:number, x2:number, y2:number}>, clearCount: () => number, renderer: {line: Function, clear: Function}}}
 */
function createFakeRenderer() {
  const lines = [];
  let clears = 0;

  return {
    lines,
    clearCount: () => clears,
    renderer: {
      line(x1, y1, x2, y2) {
        lines.push({ x1, y1, x2, y2 });
      },
      clear() {
        clears += 1;
      },
    },
  };
}

test("FORWARD draws north from heading 0", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.forward(25);

  assert.deepEqual(fake.lines, [{ x1: 0, y1: 0, x2: 0, y2: 25 }]);
  assert.deepEqual(turtle.here(), [0, 25, 0]);
});

test("RIGHT 90 then FORWARD draws east", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.right(90).forward(10);

  assert.deepEqual(fake.lines, [{ x1: 0, y1: 0, x2: 10, y2: 0 }]);
  assert.deepEqual(turtle.here(), [10, 0, 90]);
});

test("PENUP moves without drawing", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.penUp().forward(12);

  assert.deepEqual(fake.lines, []);
  assert.deepEqual(turtle.here(), [0, 12, 0]);
  assert.equal(turtle.penState(), 1);
});

test("HOME returns to the origin and resets heading", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.right(90).forward(10).home();

  assert.deepEqual(turtle.here(), [0, 0, 0]);
  assert.deepEqual(fake.lines, [
    { x1: 0, y1: 0, x2: 10, y2: 0 },
    { x1: 10, y1: 0, x2: 0, y2: 0 },
  ]);
});

test("SETXY jumps and draws when the pen is down", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.setXY(3, 4);

  assert.deepEqual(fake.lines, [{ x1: 0, y1: 0, x2: 3, y2: 4 }]);
  assert.deepEqual(turtle.here(), [3, 4, 0]);
});

test("CLEARSCREEN clears the renderer and resets turtle state", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.right(90).forward(10).penUp().clearScreen();

  assert.equal(fake.clearCount(), 1);
  assert.deepEqual(turtle.here(), [0, 0, 0]);
  assert.equal(turtle.penState(), -1);
  assert.equal(turtle.getState().visible, true);
});

test("abbreviations share the same primitive registration", () => {
  const pairs = [
    ["FORWARD", "FD"],
    ["BACK", "BK"],
    ["RIGHT", "RT"],
    ["LEFT", "LT"],
    ["PENUP", "PU"],
    ["PENDOWN", "PD"],
    ["CLEARSCREEN", "CS"],
  ];

  for (const [fullName, alias] of pairs) {
    assert.equal(PRIMITIVES.get(alias), PRIMITIVES.get(fullName));
  }
});
