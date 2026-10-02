# tortue — architecture & module contracts

`tortue` is a browser-based port of **MIT LISP LOGO (LLOGO)**, written
originally in MACLISP by Ira Goldstein and Henry Lieberman at the MIT AI Lab
(early 1970s), as preserved in [PDP-10/its](https://github.com/PDP-10/its)
`src/llogo/`. It is translated to straightforward vanilla ES6 (no build
step, no dependencies) and targets SVG for turtle graphics instead of the
original 340-type vector display.

See `README.md` for provenance/licensing. This document fixes the module
boundaries and the data-structure contracts so independently-translated
modules interoperate without an integration pass.

## Source mapping

| MACLISP file | ES6 module | Notes |
|---|---|---|
| `reader.201` (tokenizer + PASS2) | `src/lexer.js` | Drop raw-TTY rubout/echo editing (handled by the browser `<textarea>`); keep quoting/bracket/comment rules. |
| `parser.129` | `src/parser.js` | Prefix/infix hybrid parser with precedence climbing. |
| `primit.304` (data/arithmetic/predicates/words/lists) | `src/primitives.js` | Pure value-producing primitives. |
| `primit.304` (control: IF/REPEAT/WHILE/UNTIL/FOREVER/GO/OUTPUT/STOP/TEST) + procedure `TO...END` | `src/interpreter.js` | Core evaluator; written centrally for consistency. |
| `print.165` | `src/printer.js` | `PRINT`/`SHOW`/`TYPE` formatting. |
| `error.225` (user-facing subset only) | `src/errors.js` | `LogoError` + message catalog; skip interactive break/trace loops. |
| `turtle.468` | `src/turtle.js` | Turtle state machine + SVG renderer (`DISALINE` → `<line>`). |
| n/a (new) | `src/highlight.js` | Textarea+`<pre>` overlay syntax highlighting, reusing `lexer.js`. |
| n/a (new) | `index.html`, `src/app.js` | UI wiring. |

Out of scope for v1: `tvrtle.542` (raster TV Turtle), `germ.147`
(GERMLAND game), `music.13` (Music Box), `unedit.212` (teletype procedure
editor — superseded by reading a `TO ... END` block from the textarea),
`declar.67`/`setup.306`/`loader.154` (MACLISP/ITS bootstrapping).

## Pipeline

```
source text --lexer.js--> RawToken[] --parser.js--> CallExpr[] (one parsed line)
```

`lexer.js` owns everything `reader.201`'s `LINE` + `PASS2`/`UNSQUISH` do
*except* raw-TTY rubout/echo editing: splitting on whitespace and Logo's
special punctuation, recognizing numbers, and wrapping `'x`, `"x`/`"(...)`,
and `[...]` into the `Quoted`/`DoubleQuoted`/`Bracketed` marker classes from
`types.js` (nesting brackets as needed). It drops `;`/`! ... !` comments
entirely. See `types.js` for the exact `RawToken` contract — this is the
one boundary most likely to cause integration bugs, so it is specified
there rather than left to convention.

`parser.js` owns everything `parser.129` does: walking the `RawToken[]`
left-to-right (the `FIRST`/`TOPARSE` pattern), turning quoted/double-quoted
tokens into literal values, `Bracketed` into `LogoListLit`, bare words into
either a `VarRef` (leading `:`) or a `CallExpr` by looking up the word's
arity via `PRIMITIVES`/the interpreter's procedure table (ported from
`PARSE-PROP`/`HOW-TO-PARSE-INPUTS`), and resolving infix operators
(`+ - * / = < >` etc.) by precedence climbing (ported from `PARSE-INFIX`/
`PRECEDENCE`/`ASSOCIATE`).

**Simplification vs. the original incremental REPL**: LLOGO parses and
evaluates one line at a time as it's typed, so a call to a not-yet-defined
procedure is a hard error unless deferred via the `PARSEMACRO` throw/retry
hack. Since a browser demo has the *whole script* available upfront
(textarea contents, not a character-at-a-time teletype), `interpreter.js`
instead does two passes: (1) scan for every `TO name :p1 :p2 ... / END`
block and register `name`'s arity (just the parameter count, body not
parsed yet), so mutual/forward recursion between procedures works for
free; (2) parse every procedure body and every top-level line. This
sidesteps `PARSEMACRO` entirely while preserving the same arity-driven
parsing of calls.

## Data model (`src/types.js`)

Runtime **values** use plain JS types wherever possible:

- Logo **word** → JS `string` (case preserved, compared case-insensitively
  by primitives per original semantics).
- Logo **number** → JS `number`.
- Logo **list** → JS `Array<Value>` (recursively).
- The empty word is `""`; the empty list is `[]`. There is no separate
  "NIL" — `false`/`NO_VALUE` are the only non-list/word/number values that
  appear, and only internally (never inside a Logo list).

`NO_VALUE` is a unique sentinel (`Symbol`) meaning "this procedure produced
nothing to print", mirroring MACLISP's `NO-VALUE`. It must never leak into
printed output.

### AST (parser output)

```js
/** A variable reference, e.g. `:X`. */
class VarRef { constructor(name) { this.name = name; } }

/** A prefix or infix function/procedure call, e.g. `FORWARD 100` or `1 + 2`. */
class CallExpr { constructor(name, args) { this.name = name; this.args = args; } }

/** A literal list written with `[ ... ]`; elements are unevaluated words/numbers/nested lists. */
class LogoListLit { constructor(items) { this.items = items; } }
```

A parsed line is `CallExpr[]` (LLOGO's `PARSELINE` returns "a list of
S-expressions"). A parsed procedure body is `Line[]` where
`Line = { tag: number|null, forms: CallExpr[] }` (tag is the optional
leading line number, used only by `GO`).

### Execution

- `class Environment` — variable bindings (`MAKE`/`THING`/`LOCAL`).
  LLOGO's `MAKE` is dynamically scoped and global by default; `LOCAL`
  shadows for the duration of the current procedure call. Implemented as a
  single global `Map` plus a stack of per-call "locals" sets that are
  unbound on return (matching the original `UNBIND`-on-exit behavior).
- `class Procedure` — `{ name, params, body: Line[] }`, built by
  `defineProcedure()` when the interpreter reads `TO name ... END`.
- Non-local exits are JS exceptions, mirroring MACLISP `CATCH`/`THROW`,
  `RETURN`, and `GO`:
  - `class OutputSignal { value }` — thrown by `OUTPUT`/`STOP` (which is
    `OUTPUT NO_VALUE`), caught at the call boundary of the running
    procedure (equivalent to Lisp `RETURN` unwinding to the enclosing
    `PROG`).
  - `class GoSignal { tag }` — thrown by `GO`, caught by the *nearest
    enclosing procedure's own body loop* (its `Line[]` program counter),
    which resumes execution at the matching tag. **Known limitation**:
    unlike MACLISP's `PROG`/`GO`, this only reaches tags in the same
    procedure's top-level body, not across a `REPEAT`/`WHILE`/`FOREVER`
    body's dynamic extent — acceptable since `GO`/line-numbers are already
    a legacy feature in LLOGO itself, kept only for compatibility with
    original demo programs.
  - `class LogoError extends Error` — user-facing errors (`error.225`'s
    `LOGO-ERROR`/`ERRBREAK`), caught at the REPL boundary and printed.

### Primitives registry

`src/primitives.js` and `src/interpreter.js` both populate one shared
`Map<string, PrimitiveSpec>` (`PRIMITIVES`, exported from `types.js` as an
empty `Map` for both to fill at module-load time):

```js
/**
 * @typedef {Object} PrimitiveSpec
 * @property {'expr'|'fexpr'} kind  'expr' gets evaluated args; 'fexpr' gets raw args + Environment.
 * @property {number|'L'} arity     Fixed arg count, or 'L' for "rest of line".
 * @property {Function} fn          (...args) => Value  or  (argExprs, env) => Value  for fexpr.
 */
```

This matches `primit.304`'s own `EXPR`/`FEXPR`/`LEXPR` distinction and is
exactly what `parser.js` needs to read via `HOW-TO-PARSE-INPUTS` (ported as
`parser.js`'s `arityOf(name)` helper, which queries this same map).

## Turtle / SVG (`src/turtle.js`)

Mirrors `turtle.468`'s state: `{ x, y, heading, penDown, visible }` in
Logo's coordinate system (0,0 at center, 0° = up, clockwise positive,
matching `SINE`/`COSINE` usage in `FORWARD`). `setxy(x, y)` is the single
choke point (as in the original) and appends an SVG `<line>` element to a
`<g id="picture">` when the pen is down; it never touches the DOM directly
from primitives.js — callers get a small renderer object:

```js
/** @typedef {Object} TurtleRenderer
 *  @property {(x1:number,y1:number,x2:number,y2:number)=>void} line
 *  @property {()=>void} clear
 */
```

This keeps `turtle.js` unit-testable with a fake renderer in Node, and
swappable if SVG is later replaced.

## Testing

Plain `node:test` + `node:assert/strict`, no framework. Each module ships
a sibling `tests/<name>.test.js`. Run with `node --test`.
