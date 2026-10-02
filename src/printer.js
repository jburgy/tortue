import {
  NO_VALUE,
  PRIMITIVES,
  defAbbreviations,
  defPrimitive,
} from "./types.js";

/** @typedef {import("./types.js").LogoValue} LogoValue */

let bufferedOutput = "";

const bufferingSink = {
  /**
   * Append text to the module's default in-memory output buffer.
   * @param {string} text
   * @returns {void}
   */
  write(text) {
    bufferedOutput += text;
  },
};

let currentOutputSink = bufferingSink;

/**
 * Render one Logo value using Logo's bracketed list notation.
 *
 * This is the ES6 counterpart of LLOGO's `DPRIN1`: words print bare,
 * numbers print as decimal text, and lists print inside square brackets
 * with a single space between adjacent elements.
 *
 * @param {LogoValue} value
 * @returns {string}
 */
export function formatValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(" ")}]`;
  }
  return typeof value === "number" ? String(value) : value;
}

/**
 * Replace the active output sink used by `PRINT`, `TYPE`, and related
 * primitives.
 *
 * Pass `null` to restore the default in-memory buffering sink. The sink may
 * be a function receiving one text chunk or an object with a `write(text)`
 * method.
 *
 * @param {((text: string) => void)|{write: (text: string) => void}|null} sink
 * @returns {void}
 */
export function setOutputSink(sink) {
  if (sink === null) {
    currentOutputSink = bufferingSink;
    return;
  }

  if (typeof sink === "function") {
    currentOutputSink = { write: sink };
    return;
  }

  if (sink && typeof sink.write === "function") {
    currentOutputSink = sink;
    return;
  }

  throw new TypeError("Output sink must be null, a function, or a { write() } object");
}

/**
 * Write raw text to the current output sink.
 *
 * UI code can use this to route caught `LogoError` messages through the same
 * output channel as the printing primitives.
 *
 * @param {string} text
 * @returns {void}
 */
export function writeOutput(text) {
  currentOutputSink.write(String(text));
}

/**
 * Read the contents accumulated by the default in-memory output sink.
 *
 * @returns {string}
 */
export function getOutputBuffer() {
  return bufferedOutput;
}

/**
 * Clear the default in-memory output sink.
 *
 * @returns {void}
 */
export function clearOutputBuffer() {
  bufferedOutput = "";
}

/**
 * Render one Logo value for `TYPE`, which omits the outer brackets of a
 * top-level list while still rendering nested list elements with brackets.
 *
 * @param {LogoValue} value
 * @returns {string}
 */
function formatTypedValue(value) {
  if (!Array.isArray(value)) {
    return formatValue(value);
  }
  return value.map(formatValue).join(" ");
}

/**
 * Register a primitive and any aliases without re-registering them when the
 * module is imported more than once in tests.
 *
 * @param {string} name
 * @param {{ kind: 'expr'|'fexpr', arity: number|'L', fn: (...args: any[]) => LogoValue|typeof NO_VALUE }} spec
 * @param {string[]} [aliases=[]]
 * @returns {void}
 */
function registerPrimitive(name, spec, aliases = []) {
  const key = name.toUpperCase();
  if (!PRIMITIVES.has(key)) {
    defPrimitive(key, spec);
  }

  const canonical = PRIMITIVES.get(key);
  const freshAliases = aliases.filter((alias) => {
    const existing = PRIMITIVES.get(alias.toUpperCase());
    if (!existing) {
      return true;
    }
    if (existing !== canonical) {
      throw new Error(`Primitive alias ${alias.toUpperCase()} already points elsewhere`);
    }
    return false;
  });

  if (freshAliases.length > 0) {
    defAbbreviations(key, freshAliases);
  }
}

registerPrimitive(
  "PRINT",
  {
    // LLOGO's own PRINT/TYPE/FPRINT are declared "(PARSE 1. L)" — variadic,
    // consuming the rest of the line. That is a known classic-Logo footgun
    // once procedure bodies pack multiple statements into one bracketed
    // list (as this browser port's REPEAT/WHILE/etc. do): `PRINT :X MAKE
    // "Y 1` would otherwise parse as ONE call to PRINT with two inputs
    // (swallowing the MAKE statement) instead of two separate statements.
    // UCBLogo fixed exactly this by making bareword PRINT single-input by
    // default (with `(PRINT a b c)` as the explicit variadic escape hatch);
    // this port follows that safer, modern convention deliberately.
    kind: "expr",
    arity: 1,
    fn: (value) => {
      writeOutput(formatTypedValue(value));
      writeOutput("\n");
      return NO_VALUE;
    },
  },
  ["LOGO-PRINT", "P", "PR"]
);

registerPrimitive("TYPE", {
  kind: "expr",
  arity: 1,
  fn: (value) => {
    writeOutput(formatTypedValue(value));
    return NO_VALUE;
  },
});

registerPrimitive(
  "FPRINT",
  {
    kind: "expr",
    arity: 1,
    fn: (value) => {
      writeOutput(formatValue(value));
      writeOutput("\n");
      return NO_VALUE;
    },
  },
  ["FP"]
);

registerPrimitive("BLANK", {
  kind: "expr",
  arity: 0,
  fn: () => {
    writeOutput(" ");
    return NO_VALUE;
  },
});

registerPrimitive(
  "CARRIAGERETURN",
  {
    kind: "expr",
    arity: 0,
    fn: () => {
      writeOutput("\n");
      return NO_VALUE;
    },
  },
  ["CR"]
);

registerPrimitive("LINEFEED", {
  kind: "expr",
  arity: 0,
  fn: () => {
    writeOutput("\n");
    return NO_VALUE;
  },
});
