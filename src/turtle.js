import { NO_VALUE, LogoError, defAbbreviations, defPrimitive } from "./types.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const EPSILON = 1e-10;
const ARC_POLYGON_SIDES = 30;

/**
 * A drawing backend for the turtle state machine.
 *
 * The `Turtle` class stays entirely in Logo coordinates (origin at screen
 * center, +Y upward). A renderer decides how to project those coordinates to
 * a concrete output device such as SVG.
 *
 * @typedef {Object} TurtleRenderer
 * @property {(x1:number, y1:number, x2:number, y2:number, erasing?:boolean) => void} line
 *   When `erasing` is true, this call represents `PENERASE` retracing a
 *   segment a matching `PENPAINT` pass already drew (see `Turtle#penErase`);
 *   `(x1,y1,x2,y2)` are still the segment's coordinates, but a renderer is
 *   free to ignore them and instead remove/hide whatever it drew for the
 *   corresponding earlier `line()` call, which avoids any anti-aliasing
 *   residue from overdrawing (see `createSvgRenderer`'s implementation).
 * @property {() => void} clear
 */

/** @type {TurtleRenderer} */
const NULL_RENDERER = Object.freeze({
  line() {},
  clear() {},
});

/**
 * Normalize tiny floating-point noise away so cardinal motions stay exact.
 * @param {number} value
 * @returns {number}
 */
function cleanNumber(value) {
  const rounded = Math.round(value * 1e12) / 1e12;
  return Math.abs(rounded) < EPSILON ? 0 : rounded;
}

/**
 * Normalize a heading into Logo's public 0..360-degree range.
 * @param {number} angle
 * @returns {number}
 */
function normalizeHeading(angle) {
  const wrapped = angle % 360;
  return cleanNumber(wrapped < 0 ? wrapped + 360 : wrapped);
}

/**
 * Convert degrees to the sine of that angle.
 * @param {number} angle
 * @returns {number}
 */
function sinDeg(angle) {
  return cleanNumber(Math.sin((angle * Math.PI) / 180));
}

/**
 * Convert degrees to the cosine of that angle.
 * @param {number} angle
 * @returns {number}
 */
function cosDeg(angle) {
  return cleanNumber(Math.cos((angle * Math.PI) / 180));
}

/**
 * Convert Cartesian deltas to a Logo heading in degrees.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function atanDeg(x, y) {
  return normalizeHeading(cleanNumber((Math.atan2(x, y) * 180) / Math.PI));
}

/**
 * Require a numeric Logo input.
 * @param {number} value
 * @param {string} name
 * @returns {number}
 */
function requireNumber(value, name) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new LogoError(`${name} expects a number`);
  }
  return value;
}

/**
 * Require a Logo list suitable for `SETTURTLE`.
 * @param {unknown} value
 * @returns {number[]}
 */
function requireTurtleState(value) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new LogoError("SETTURTLE expects a list [x, y] or [x, y, heading]");
  }

  const x = requireNumber(value[0], "SETTURTLE");
  const y = requireNumber(value[1], "SETTURTLE");

  if (value.length >= 3 && value[2] !== undefined) {
    return [x, y, requireNumber(value[2], "SETTURTLE")];
  }

  return [x, y];
}

/**
 * Stateful Logo turtle operating in native Logo coordinates.
 *
 * - origin at the center of the drawing
 * - +Y points upward
 * - heading 0 points north/up
 * - positive turns are clockwise
 *
 * The turtle never touches the DOM directly; it delegates drawing to the
 * injected `TurtleRenderer`.
 */
export class Turtle {
  /**
   * @param {TurtleRenderer} [renderer]
   */
  constructor(renderer = NULL_RENDERER) {
    this.renderer = renderer;
    this.reset();
  }

  /**
   * Replace the drawing backend.
   * @param {TurtleRenderer} renderer
   * @returns {Turtle}
   */
  setRenderer(renderer) {
    this.renderer = renderer ?? NULL_RENDERER;
    return this;
  }

  /**
   * Reset state to the Logo home position without clearing the renderer.
   * @returns {Turtle}
   */
  reset() {
    this.x = 0;
    this.y = 0;
    this.headingDegrees = 0;
    this.isPenDown = true;
    this.isVisible = true;
    this.wrapEnabled = false;
    this.isErasing = false;
    return this;
  }

  /**
   * Snapshot the current turtle state.
   * @returns {{x:number, y:number, heading:number, penDown:boolean, visible:boolean, wrap:boolean}}
   */
  getState() {
    return {
      x: this.x,
      y: this.y,
      heading: this.heading(),
      penDown: this.isPenDown,
      visible: this.isVisible,
      wrap: this.wrapEnabled,
    };
  }

  /**
   * Move forward along the current heading.
   * @param {number} distance
   * @returns {Turtle}
   */
  forward(distance) {
    const step = requireNumber(distance, "FORWARD");
    const nextX = cleanNumber(this.x + step * sinDeg(this.headingDegrees));
    const nextY = cleanNumber(this.y + step * cosDeg(this.headingDegrees));
    return this.setXY(nextX, nextY);
  }

  /**
   * Move backward along the current heading.
   * @param {number} distance
   * @returns {Turtle}
   */
  back(distance) {
    return this.forward(-requireNumber(distance, "BACK"));
  }

  /**
   * Turn clockwise.
   * @param {number} angle
   * @returns {Turtle}
   */
  right(angle) {
    return this.setHeading(this.headingDegrees + requireNumber(angle, "RIGHT"));
  }

  /**
   * Turn counter-clockwise.
   * @param {number} angle
   * @returns {Turtle}
   */
  left(angle) {
    return this.setHeading(this.headingDegrees - requireNumber(angle, "LEFT"));
  }

  /**
   * Set the X coordinate, drawing if the pen is down.
   * @param {number} x
   * @returns {Turtle}
   */
  setX(x) {
    return this.setXY(x, this.y);
  }

  /**
   * Set the Y coordinate, drawing if the pen is down.
   * @param {number} y
   * @returns {Turtle}
   */
  setY(y) {
    return this.setXY(this.x, y);
  }

  /**
   * Set the turtle position, drawing a segment from the old point when the
   * pen is down.
   *
   * `WRAP`/`NOWRAP` are currently tracked as state only. The original LLOGO
   * version depended on display bounds (`:SCREENSIZE`); this ES6 port leaves
   * screen-edge behavior to future viewport-aware wiring.
   *
   * @param {number} x
   * @param {number} y
   * @returns {Turtle}
   */
  setXY(x, y) {
    const nextX = cleanNumber(requireNumber(x, "SETXY"));
    const nextY = cleanNumber(requireNumber(y, "SETXY"));
    const { x: prevX, y: prevY } = this;

    if (this.isPenDown) {
      this.renderer.line(prevX, prevY, nextX, nextY, this.isErasing);
    }

    this.x = nextX;
    this.y = nextY;
    return this;
  }

  /**
   * Set the turtle heading in degrees.
   * @param {number} angle
   * @returns {Turtle}
   */
  setHeading(angle) {
    this.headingDegrees = normalizeHeading(requireNumber(angle, "SETHEADING"));
    return this;
  }

  /**
   * Set the turtle from a Logo state list `[x, y]` or `[x, y, heading]`.
   * @param {number[]} state
   * @returns {Turtle}
   */
  setTurtle(state) {
    const [x, y, heading] = requireTurtleState(state);
    this.setXY(x, y);
    if (heading !== undefined) {
      this.setHeading(heading);
    }
    return this;
  }

  /**
   * Move to home `(0, 0)` and reset heading to north.
   * @returns {Turtle}
   */
  home() {
    this.setXY(0, 0);
    this.setHeading(0);
    return this;
  }

  /**
   * Put the pen down.
   * @returns {Turtle}
   */
  penDown() {
    this.isPenDown = true;
    return this;
  }

  /**
   * Lift the pen.
   * @returns {Turtle}
   */
  penUp() {
    this.isPenDown = false;
    return this;
  }

  /**
   * `PENPAINT`: resume normal foreground-color drawing after a `PENERASE`
   * pass — see `penErase`'s doc comment for the full "erase without
   * `CLEARSCREEN`" story this is one half of.
   * @returns {Turtle}
   */
  penPaint() {
    this.isErasing = false;
    return this;
  }

  /**
   * `PENERASE`: the classic Logo way to "erase" something drawn earlier
   * without a `CLEARSCREEN` — switch to `PENERASE`, retrace the exact same
   * path, then switch back to `PENPAINT`. The renderer (see
   * `createSvgRenderer`) is the one that decides *how* that erasing
   * happens: this flag alone doesn't draw in the background color (that
   * composites wrong against anti-aliased stroke edges and leaves faint
   * ghost traces — the SVG renderer instead removes the matching
   * previously-drawn element).
   * @returns {Turtle}
   */
  penErase() {
    this.isErasing = true;
    return this;
  }

  /**
   * Get the historical LLOGO pen-state encoding.
   * @returns {number} `-1` when down, `1` when up.
   */
  penState() {
    return this.isPenDown ? -1 : 1;
  }

  /**
   * Set the historical LLOGO pen-state encoding.
   * @param {number} state
   * @returns {Turtle}
   */
  setPenState(state) {
    this.isPenDown = requireNumber(state, "PENSTATE") < 0;
    return this;
  }

  /**
   * Predicate form of the pen state, returned as Logo words.
   * @returns {string}
   */
  penp() {
    return this.isPenDown ? "TRUE" : "FALSE";
  }

  /**
   * Hide the turtle marker state.
   * @returns {Turtle}
   */
  hideTurtle() {
    this.isVisible = false;
    return this;
  }

  /**
   * Show the turtle marker state.
   * @returns {Turtle}
   */
  showTurtle() {
    this.isVisible = true;
    return this;
  }

  /**
   * Enable wrap mode as a remembered flag.
   * @returns {Turtle}
   */
  wrap() {
    this.wrapEnabled = true;
    return this;
  }

  /**
   * Disable wrap mode as a remembered flag.
   * @returns {Turtle}
   */
  noWrap() {
    this.wrapEnabled = false;
    return this;
  }

  /**
   * Current X coordinate.
   * @returns {number}
   */
  xcor() {
    return this.x;
  }

  /**
   * Current Y coordinate.
   * @returns {number}
   */
  ycor() {
    return this.y;
  }

  /**
   * Current Logo heading in the public 0..360-degree range.
   * @returns {number}
   */
  heading() {
    return normalizeHeading(this.headingDegrees);
  }

  /**
   * Current position plus heading, suitable for `SETTURTLE`.
   * @returns {number[]}
   */
  here() {
    return [this.xcor(), this.ycor(), this.heading()];
  }

  /**
   * Clear the drawing and reset to the v1 baseline state.
   * @returns {Turtle}
   */
  clearScreen() {
    this.renderer.clear();
    this.reset();
    return this;
  }

  /**
   * Approximate LLOGO's `ARC` by a 30-sided polygon, matching the original
   * file's `:POLYGON` default.
   *
   * As in the MACLISP source, this draws an arc around the turtle's current
   * location as the circle center, then returns the turtle to that center and
   * advances the heading by the requested angle.
   *
   * @param {number} radius
   * @param {number} degrees
   * @returns {Turtle}
   */
  arc(radius, degrees) {
    const arcRadius = requireNumber(radius, "ARC");
    const arcDegrees = requireNumber(degrees, "ARC");
    const center = this.here();
    const side = 2 * arcRadius * Math.sin(Math.PI / ARC_POLYGON_SIDES);
    const turn = 360 / ARC_POLYGON_SIDES;
    const signedTurn = Math.sign(arcDegrees || 1) * turn;
    let sidesRemaining = Math.abs(arcDegrees) / turn;

    this.penUp();
    this.forward(arcRadius);
    this.right(90 * Math.sign(arcDegrees || 1));
    this.penDown();

    while (sidesRemaining > 0) {
      const fraction = Math.min(1, sidesRemaining);
      this.right((signedTurn / 2) * fraction);
      this.forward(side * fraction);
      this.right((signedTurn / 2) * fraction);
      sidesRemaining -= 1;
    }

    this.penUp();
    this.setXY(center[0], center[1]);
    this.setHeading(center[2] + arcDegrees);
    this.penDown();
    return this;
  }
}

let defaultTurtle = new Turtle();

/**
 * Get the module-level turtle used by the registered Logo primitives.
 * @returns {Turtle}
 */
export function getDefaultTurtle() {
  return defaultTurtle;
}

/**
 * Replace the module-level turtle used by the registered Logo primitives.
 * @param {Turtle} turtle
 * @returns {Turtle}
 */
export function setDefaultTurtle(turtle) {
  if (!(turtle instanceof Turtle)) {
    throw new TypeError("setDefaultTurtle expects a Turtle instance");
  }
  defaultTurtle = turtle;
  return defaultTurtle;
}

/**
 * Attach a renderer to the module-level turtle used by the registered Logo
 * primitives.
 * @param {TurtleRenderer} renderer
 * @returns {Turtle}
 */
export function setDefaultRenderer(renderer) {
  return defaultTurtle.setRenderer(renderer);
}

/**
 * Create an SVG-backed turtle renderer.
 *
 * The `Turtle` class emits Logo-space coordinates with origin at the center
 * and +Y upward. SVG uses top-left origin and +Y downward, so this renderer
 * translates by half the viewport and flips the sign of Y on every point.
 *
 * @param {SVGSVGElement} svgElement
 * @returns {TurtleRenderer}
 */
export function createSvgRenderer(svgElement) {
  /**
   * Ensure lines live inside a stable picture layer.
   * @returns {SVGGElement}
   */
  function ensurePictureLayer() {
    let picture = svgElement.querySelector('g[data-tortue-picture="true"]');
    if (!picture) {
      picture = document.createElementNS(SVG_NS, "g");
      picture.setAttribute("id", "picture");
      picture.setAttribute("data-tortue-picture", "true");
      svgElement.appendChild(picture);
    }
    return picture;
  }

  /**
   * Resolve the current SVG viewport.
   * @returns {{minX:number, minY:number, width:number, height:number}}
   */
  function resolveViewport() {
    const viewBox = svgElement.viewBox?.baseVal;
    if (viewBox && (viewBox.width !== 0 || viewBox.height !== 0)) {
      return {
        minX: viewBox.x,
        minY: viewBox.y,
        width: viewBox.width,
        height: viewBox.height,
      };
    }

    const width =
      Number.parseFloat(svgElement.getAttribute("width") ?? "") ||
      svgElement.clientWidth ||
      svgElement.getBoundingClientRect().width ||
      0;
    const height =
      Number.parseFloat(svgElement.getAttribute("height") ?? "") ||
      svgElement.clientHeight ||
      svgElement.getBoundingClientRect().height ||
      0;

    return { minX: 0, minY: 0, width, height };
  }

  /**
   * Convert Logo coordinates to SVG coordinates.
   * @param {number} x
   * @param {number} y
   * @returns {{x:number, y:number}}
   */
  function toSvgPoint(x, y) {
    const viewport = resolveViewport();
    return {
      x: viewport.minX + viewport.width / 2 + x,
      y: viewport.minY + viewport.height / 2 - y,
    };
  }

  /**
   * LIFO stack of `<line>` elements drawn with the pen in paint mode, most
   * recent last. `PENERASE` removes the most-recently-drawn still-present
   * element instead of overdrawing it in the background color, which would
   * composite incorrectly against anti-aliased stroke edges and leave
   * faint ghost traces. This matches this app's usage: every `PENERASE`
   * retraces, in the same order, exactly the segments the immediately
   * preceding `PENPAINT` pass just drew (the clock hand, not the long-ago
   * ticks). Must be LIFO (`pop`), not FIFO (`shift`): erasing oldest-first
   * would eat the ticks long before reaching the hand.
   * @type {SVGLineElement[]}
   */
  const paintedLines = [];

  return {
    /**
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @param {boolean} [erasing] See `Turtle#penErase`'s doc comment.
     */
    line(x1, y1, x2, y2, erasing = false) {
      if (erasing) {
        paintedLines.pop()?.remove();
        return;
      }
      const start = toSvgPoint(x1, y1);
      const end = toSvgPoint(x2, y2);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(start.x));
      line.setAttribute("y1", String(start.y));
      line.setAttribute("x2", String(end.x));
      line.setAttribute("y2", String(end.y));
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("fill", "none");
      ensurePictureLayer().appendChild(line);
      paintedLines.push(line);
    },
    clear() {
      ensurePictureLayer().replaceChildren();
      paintedLines.length = 0;
    },
  };
}

/**
 * Register a state-changing turtle primitive.
 * @param {string} name
 * @param {number|'L'} arity
 * @param {(...args:any[]) => void} fn
 */
function defStatePrimitive(name, arity, fn) {
  defPrimitive(name, {
    kind: "expr",
    arity,
    fn: (...args) => {
      fn(...args);
      return NO_VALUE;
    },
  });
}

/** Register the module's Logo-visible turtle primitives. */
function registerTurtlePrimitives() {
  defStatePrimitive("FORWARD", 1, (distance) => defaultTurtle.forward(distance));
  defAbbreviations("FORWARD", ["FD"]);

  defStatePrimitive("BACK", 1, (distance) => defaultTurtle.back(distance));
  defAbbreviations("BACK", ["BK"]);

  defStatePrimitive("RIGHT", 1, (angle) => defaultTurtle.right(angle));
  defAbbreviations("RIGHT", ["RT"]);

  defStatePrimitive("LEFT", 1, (angle) => defaultTurtle.left(angle));
  defAbbreviations("LEFT", ["LT"]);

  defStatePrimitive("SETX", 1, (x) => defaultTurtle.setX(x));
  defStatePrimitive("SETY", 1, (y) => defaultTurtle.setY(y));
  defStatePrimitive("SETXY", 2, (x, y) => defaultTurtle.setXY(x, y));

  defStatePrimitive("SETHEADING", 1, (angle) => defaultTurtle.setHeading(angle));
  defAbbreviations("SETHEADING", ["SETHEAD", "SH"]);

  defStatePrimitive("SETTURTLE", 1, (state) => defaultTurtle.setTurtle(state));
  defAbbreviations("SETTURTLE", ["SETT"]);

  defStatePrimitive("HOME", 0, () => defaultTurtle.home());
  defAbbreviations("HOME", ["H"]);

  defStatePrimitive("WRAP", 0, () => defaultTurtle.wrap());
  defStatePrimitive("NOWRAP", 0, () => defaultTurtle.noWrap());

  defStatePrimitive("PENDOWN", 0, () => defaultTurtle.penDown());
  defAbbreviations("PENDOWN", ["PD"]);

  defStatePrimitive("PENUP", 0, () => defaultTurtle.penUp());
  defAbbreviations("PENUP", ["PU"]);

  defStatePrimitive("PENPAINT", 0, () => defaultTurtle.penPaint());
  defAbbreviations("PENPAINT", ["PPT"]);

  defStatePrimitive("PENERASE", 0, () => defaultTurtle.penErase());
  defAbbreviations("PENERASE", ["PE"]);

  defPrimitive("PENSTATE", {
    kind: "expr",
    arity: "L",
    fn: (...args) => {
      if (args.length === 0) {
        return defaultTurtle.penState();
      }
      if (args.length === 1) {
        defaultTurtle.setPenState(args[0]);
        return NO_VALUE;
      }
      throw new LogoError("PENSTATE expects 0 or 1 inputs");
    },
  });

  defPrimitive("PENP", {
    kind: "expr",
    arity: 0,
    fn: () => defaultTurtle.penp(),
  });

  defPrimitive("XCOR", {
    kind: "expr",
    arity: 0,
    fn: () => defaultTurtle.xcor(),
  });

  defPrimitive("YCOR", {
    kind: "expr",
    arity: 0,
    fn: () => defaultTurtle.ycor(),
  });

  defPrimitive("HERE", {
    kind: "expr",
    arity: 0,
    fn: () => defaultTurtle.here(),
  });

  defPrimitive("HEADING", {
    kind: "expr",
    arity: 0,
    fn: () => defaultTurtle.heading(),
  });

  defStatePrimitive("HIDETURTLE", 0, () => defaultTurtle.hideTurtle());
  defAbbreviations("HIDETURTLE", ["HT"]);

  defStatePrimitive("SHOWTURTLE", 0, () => defaultTurtle.showTurtle());
  defAbbreviations("SHOWTURTLE", ["ST"]);

  defStatePrimitive("CLEARSCREEN", 0, () => defaultTurtle.clearScreen());
  defAbbreviations("CLEARSCREEN", ["CS", "WIPE", "WIPECLEAN", "WC"]);

  defStatePrimitive("ARC", 2, (radius, degrees) => defaultTurtle.arc(radius, degrees));
}

registerTurtlePrimitives();
