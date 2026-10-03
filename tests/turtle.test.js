import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { PRIMITIVES } from "../src/types.js";
import { Turtle, createSvgRenderer, setDefaultTurtle } from "../src/turtle.js";
import { runProgram } from "../src/program.js";
import "../src/primitives.js";

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
      line(x1, y1, x2, y2, erasing = false) {
        lines.push({ x1, y1, x2, y2, erasing });
      },
      clear() {
        clears += 1;
      },
    },
  };
}

/**
 * A minimal in-memory stand-in for the DOM APIs `createSvgRenderer` uses
 * (`document.createElementNS`, `querySelector`, `appendChild`,
 * `replaceChildren`, and an element's own `setAttribute`/`remove`) — just
 * enough surface to exercise the *real* renderer (not a hand-rolled mimic
 * of it) without pulling in a DOM dependency the project otherwise has no
 * use for. Installs itself as `globalThis.document`, since that's what
 * `createSvgRenderer`'s internals call directly, matching how it runs in a
 * real browser.
 * @returns {{svg: object, paintedNodeCount: () => number}}
 */
function createFakeSvgDocument() {
  function makeElement(tag) {
    const node = {
      tag,
      attrs: {},
      children: [],
      parent: null,
      setAttribute(name, value) {
        node.attrs[name] = String(value);
      },
      getAttribute(name) {
        return node.attrs[name];
      },
      appendChild(child) {
        child.parent = node;
        node.children.push(child);
        return child;
      },
      replaceChildren() {
        node.children = [];
      },
      remove() {
        if (node.parent) {
          const i = node.parent.children.indexOf(node);
          if (i !== -1) node.parent.children.splice(i, 1);
          node.parent = null;
        }
      },
      querySelector(selector) {
        // Only ever called with 'g[data-tortue-picture="true"]'.
        const matches = (el) => el.tag === "g" && el.attrs["data-tortue-picture"] === "true";
        const search = (el) => {
          for (const child of el.children) {
            if (matches(child)) return child;
            const found = search(child);
            if (found) return found;
          }
          return undefined;
        };
        return search(node);
      },
    };
    return node;
  }

  globalThis.document = {
    createElementNS: (_ns, tag) => makeElement(tag),
  };

  const svg = makeElement("svg");
  svg.viewBox = { baseVal: { x: 0, y: 0, width: 600, height: 600 } };

  return {
    svg,
    paintedNodeCount: () => svg.querySelector('g[data-tortue-picture="true"]')?.children.length ?? 0,
  };
}

test("FORWARD draws north from heading 0", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.forward(25);

  assert.deepEqual(fake.lines, [{ x1: 0, y1: 0, x2: 0, y2: 25, erasing: false }]);
  assert.deepEqual(turtle.here(), [0, 25, 0]);
});

test("RIGHT 90 then FORWARD draws east", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.right(90).forward(10);

  assert.deepEqual(fake.lines, [{ x1: 0, y1: 0, x2: 10, y2: 0, erasing: false }]);
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
    { x1: 0, y1: 0, x2: 10, y2: 0, erasing: false },
    { x1: 10, y1: 0, x2: 0, y2: 0, erasing: false },
  ]);
});

test("SETXY jumps and draws when the pen is down", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.setXY(3, 4);

  assert.deepEqual(fake.lines, [{ x1: 0, y1: 0, x2: 3, y2: 4, erasing: false }]);
  assert.deepEqual(turtle.here(), [3, 4, 0]);
});

test("PENERASE draws with the erasing flag set; PENPAINT restores normal drawing", () => {
  const fake = createFakeRenderer();
  const turtle = new Turtle(fake.renderer);

  turtle.penErase().forward(10);
  turtle.penPaint().forward(10);

  assert.deepEqual(fake.lines, [
    { x1: 0, y1: 0, x2: 0, y2: 10, erasing: true },
    { x1: 0, y1: 10, x2: 0, y2: 20, erasing: false },
  ]);
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

/**
 * Extract the Logo source embedded in index.html's `<textarea>`, verbatim
 * — reading it from the actual demo file rather than maintaining a second,
 * hand-copied source string that a future edit to the demo could silently
 * drift out of sync with.
 * @returns {string}
 */
function readClockDemoSource() {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/);
  if (!match) {
    throw new Error("Could not find <textarea> contents in index.html");
  }
  return match[1];
}

/**
 * index.html's actual clock program, with its one real-time concession
 * stripped out so the test runs instantly instead of ticking once per
 * second: `FOREVER` becomes a bounded `REPEAT`, and the `SLEEP` call (a
 * synchronous busy-wait, see `src/primitives.js`) is dropped entirely.
 * Everything else, including the 12-tick face and the FORWARD/BACK/LEFT/
 * RIGHT kite hand with its reverse-order erase, is read from index.html
 * as-is.
 * @param {number} ticks how many erase/paint cycles to run
 * @returns {string}
 */
function clockProgram(ticks) {
  return readClockDemoSource()
    .replace("FOREVER [", `REPEAT ${ticks} [`)
    .replace(/\n\s*SLEEP [\d.]+\n/, "\n");
}

test("after one tick, the clock has drawn exactly the 12 ticks plus one hand", () => {
  const { svg, paintedNodeCount } = createFakeSvgDocument();
  setDefaultTurtle(new Turtle(createSvgRenderer(svg)));

  runProgram(clockProgram(1));

  assert.equal(paintedNodeCount(), 12 * 4 + 4);
});

test("many erase/paint cycles leave the same node count as one -- no leak, no over-erase", () => {
  const { svg, paintedNodeCount } = createFakeSvgDocument();
  setDefaultTurtle(new Turtle(createSvgRenderer(svg)));

  // If PENERASE ever popped more nodes than the matching PENPAINT pushed,
  // this would eventually eat into the 12 ticks (count < 52). If it popped
  // fewer, old hands would pile up (count > 52, unboundedly, as `ticks`
  // grows). Neither happens: 500 cycles leave exactly the same count as a
  // single one.
  runProgram(clockProgram(500));

  assert.equal(paintedNodeCount(), 12 * 4 + 4);
});
