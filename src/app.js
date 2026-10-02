/**
 * @file Main-thread wiring for the tortue demo page: the code editor (with
 * live syntax highlighting), Run/Stop buttons, the SVG turtle canvas, and
 * the output pane. The actual Logo interpreter runs in a Web Worker (see
 * `worker.js`) so a `FOREVER` loop or a long `REPEAT` can't freeze the
 * page; this module only draws what the worker reports and never imports
 * the interpreter itself.
 */

import { attachHighlighting } from "./highlight.js";
import { createSvgRenderer } from "./turtle.js";

const codeInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("code"));
const highlightLayer = /** @type {HTMLElement} */ (document.getElementById("highlight-layer"));
const runButton = /** @type {HTMLButtonElement} */ (document.getElementById("run"));
const stopButton = /** @type {HTMLButtonElement} */ (document.getElementById("stop"));
const svg = /** @type {SVGSVGElement} */ (document.getElementById("canvas"));
const output = /** @type {HTMLElement} */ (document.getElementById("output"));

attachHighlighting(codeInput, highlightLayer);

const renderer = createSvgRenderer(svg);

/** @type {Worker|null} */
let worker = null;

/** Append one line of text to the output pane and scroll it into view. */
function appendOutput(text) {
  output.textContent += text;
  output.scrollTop = output.scrollHeight;
}

/** Append an error line, visually distinguished, to the output pane. */
function appendError(message) {
  appendOutput(`\n? ${message}\n`);
}

/** Enable the Run button and disable Stop, i.e. "no script is running". */
function setIdleState() {
  runButton.disabled = false;
  stopButton.disabled = true;
}

/** Terminate the current worker, if any. */
function stopWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  setIdleState();
}

/** Start a fresh worker and have it run the current editor contents. */
function runScript() {
  stopWorker();
  renderer.clear();
  output.textContent = "";

  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  runButton.disabled = true;
  stopButton.disabled = false;

  worker.addEventListener("message", (event) => {
    const message = event.data ?? {};
    switch (message.type) {
      case "line":
        renderer.line(message.x1, message.y1, message.x2, message.y2, message.erasing);
        break;
      case "clear":
        renderer.clear();
        break;
      case "print":
        appendOutput(message.text);
        break;
      case "error":
        appendError(message.message);
        break;
      case "done":
        setIdleState();
        break;
      default:
        break;
    }
  });

  worker.addEventListener("error", (event) => {
    appendError(event.message ?? String(event));
    setIdleState();
  });

  worker.postMessage({ type: "run", source: codeInput.value });
}

runButton.addEventListener("click", runScript);
stopButton.addEventListener("click", stopWorker);

setIdleState();
