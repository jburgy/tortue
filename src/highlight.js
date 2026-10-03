/**
 * @file Lightweight syntax highlighting for the code editor, using the
 * classic "transparent textarea stacked over a styled <pre>" technique: no
 * contenteditable, no external library (CodeMirror/Monaco), just a second
 * element mirroring the textarea's text with `<span>`s around each token,
 * kept in sync on every keystroke and scroll event.
 *
 * This intentionally does NOT reuse `lexer.js` directly: that tokenizer
 * throws `LogoError` on unmatched brackets/quotes (exactly the state a
 * user's input is in for much of the time they're typing) and has no
 * notion of source character offsets, which highlighting needs to wrap the
 * right substring in a `<span>`. Instead this is a small, separate,
 * position-preserving regex scan — a standard, pragmatic technique for
 * this exact UI pattern — that still reflects the *real* vocabulary: a
 * bare word is colored as a keyword only if it is actually a registered
 * primitive or user-defined procedure (checked live against
 * `types.js`'s `PRIMITIVES`/`PROCEDURE_ARITY`), not a hard-coded list.
 */

import { PRIMITIVES, PROCEDURE_ARITY } from "./types.js";

const TOKEN_PATTERN =
  /(?<comment>;[^\n]*)|(?<bangcomment>![^!\n]*!?)|(?<dquote>"[^\s()[\]]*)|(?<squote>'[^\s()[\]]*)|(?<bracket>[[\]()])|(?<number>-?\d+(?:\.\d+)?)|(?<variable>:[A-Za-z_][\w.]*)|(?<word>[A-Za-z_][\w.!?]*)|(?<newline>\n)|(?<ws>[^\S\n]+)|(?<other>.)/gs;

const KEYWORD_WORDS = new Set(["TO", "END"]);

/**
 * @typedef {Object} HighlightToken
 * @property {string} text Exact source substring (unescaped).
 * @property {string|null} className CSS class to apply, or `null` for plain text.
 */

/**
 * Split source text into highlight tokens covering every character
 * (including whitespace/newlines), so re-joining `text` reproduces the
 * original string exactly.
 * @param {string} source
 * @returns {HighlightToken[]}
 */
export function tokenizeForHighlight(source) {
  /** @type {HighlightToken[]} */
  const tokens = [];
  TOKEN_PATTERN.lastIndex = 0;
  let match;
  while ((match = TOKEN_PATTERN.exec(source)) !== null) {
    const groups = match.groups ?? {};
    const text = match[0];
    let className = null;
    if (groups.comment !== undefined || groups.bangcomment !== undefined) {
      className = "tortue-comment";
    } else if (groups.dquote !== undefined || groups.squote !== undefined) {
      className = "tortue-string";
    } else if (groups.bracket !== undefined) {
      className = "tortue-bracket";
    } else if (groups.number !== undefined) {
      className = "tortue-number";
    } else if (groups.variable !== undefined) {
      className = "tortue-variable";
    } else if (groups.word !== undefined) {
      const upper = text.toUpperCase();
      if (
        KEYWORD_WORDS.has(upper) ||
        PRIMITIVES.has(upper) ||
        PROCEDURE_ARITY.has(upper)
      ) {
        className = "tortue-keyword";
      } else {
        className = "tortue-word";
      }
    } else if (groups.other !== undefined) {
      className = "tortue-operator";
    }
    // newline/ws: className stays null (plain text).
    tokens.push({ text, className });
  }
  return tokens;
}

/**
 * Escape the handful of characters that are meaningful in HTML text content.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render source text to an HTML string with each token wrapped in a
 * `<span class="...">` (plain-text tokens are left unwrapped).
 * @param {string} source
 * @returns {string}
 */
export function highlightToHtml(source) {
  return tokenizeForHighlight(source)
    .map(({ text, className }) => {
      const escaped = escapeHtml(text);
      return className ? `<span class="${className}">${escaped}</span>` : escaped;
    })
    .join("");
}

/**
 * Wire up live syntax highlighting for a `<textarea>` by keeping a
 * same-sized, same-styled `<pre>`/`<code>` layer directly behind it in
 * sync. The textarea itself stays fully interactive and transparent
 * (styling for that lives in CSS, not here); this function only handles
 * re-rendering the highlighted HTML and mirroring scroll position.
 * @param {HTMLTextAreaElement} textarea
 * @param {HTMLElement} highlightLayer Element whose `innerHTML` mirrors the
 *   textarea's content with syntax-colored spans (typically a `<code>`
 *   inside a `<pre>` positioned absolutely behind the textarea).
 * @returns {() => void} Call to re-render immediately (e.g. after a
 *   programmatic value change not triggered by an `input` event).
 */
export function attachHighlighting(textarea, highlightLayer) {
  // The CSS that makes this overlay work (`.editor-pane pre`: absolutely
  // positioned, `overflow: auto`) targets the `<pre>` wrapper, not the
  // `<code>` passed in as `highlightLayer` — `<code>` is just an inline
  // element with no scrollbox of its own. Scrolling has to be mirrored onto
  // that `<pre>` ancestor, or the textarea scrolls while the colored
  // overlay stays put.
  const scrollContainer = highlightLayer.closest("pre") ?? highlightLayer;
  function render() {
    // A trailing newline keeps the overlay's last line the same height as
    // the textarea's when the user's last line is empty.
    highlightLayer.innerHTML = highlightToHtml(textarea.value) + "\n";
  }
  function syncScroll() {
    scrollContainer.scrollTop = textarea.scrollTop;
    scrollContainer.scrollLeft = textarea.scrollLeft;
  }
  textarea.addEventListener("input", render);
  textarea.addEventListener("scroll", syncScroll);
  render();
  return render;
}
