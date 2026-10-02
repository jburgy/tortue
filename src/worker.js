/**
 * @file Runs a whole Logo script in a Web Worker, isolated from the page's
 * main thread. This is how `tortue` keeps the UI responsive even for
 * `FOREVER` loops or long `REPEAT`s: the interpreter (`program.js` and
 * everything it pulls in) is plain, natural recursive-descent JS — exactly
 * matching the "straightforward translation" goal — rather than a
 * generator/async rewrite riddled with yield points. A genuine infinite
 * loop is instead handled by just terminating this worker from the main
 * thread (see `app.js`'s Stop button).
 *
 * Protocol (worker -> main thread):
 *   {type: 'line', x1, y1, x2, y2}  - draw one turtle line segment
 *   {type: 'clear'}                 - clear the drawing
 *   {type: 'print', text}           - append text to the output pane
 *   {type: 'error', message}        - a LogoError was thrown; show it
 *   {type: 'done'}                  - the script finished (success or error)
 *
 * Protocol (main thread -> worker):
 *   {type: 'run', source}           - tokenize/parse/run this script
 */

import { runProgram } from "./program.js";
import { setOutputSink } from "./printer.js";
import { setDefaultRenderer } from "./turtle.js";
import { LogoError } from "./types.js";
import "./primitives.js";

setDefaultRenderer({
  /**
   * Forward one drawn segment to the main thread for SVG rendering.
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {boolean} [erasing] See `turtle.js`'s `Turtle#penErase` doc
   *   comment; must be forwarded through to the main thread's renderer or
   *   `PENERASE` silently becomes a no-op (every line draws in the normal
   *   foreground color regardless of pen mode).
   */
  line(x1, y1, x2, y2, erasing = false) {
    postMessage({ type: "line", x1, y1, x2, y2, erasing });
  },
  /** Forward a clear-the-drawing request to the main thread. */
  clear() {
    postMessage({ type: "clear" });
  },
});

setOutputSink((text) => {
  postMessage({ type: "print", text });
});

self.addEventListener("message", (event) => {
  const { type, source } = event.data ?? {};
  if (type !== "run") return;

  try {
    runProgram(source);
  } catch (error) {
    const message = error instanceof LogoError ? error.message : String(error?.message ?? error);
    postMessage({ type: "error", message });
  } finally {
    postMessage({ type: "done" });
  }
});
