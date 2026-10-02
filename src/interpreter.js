/**
 * @file The tortue interpreter core: variable environment, procedure
 * definition and invocation, and the control-flow primitives. This is the
 * ES6 analog of MIT LISP LOGO's `primit.304` control-flow subset
 * (`IF`/`IFTRUE`/`IFFALSE`/`TEST`/`REPEAT`/`WHILE`/`UNTIL`/`FOREVER`/`GO`/
 * `OUTPUT`/`STOP`/`MAKE`/`THING`/`LOCAL`) plus the `TO ... END` procedure
 * reader that `unedit.212` handled interactively in the original (see
 * docs/ARCHITECTURE.md for why that part is written fresh rather than
 * translated line-by-line).
 *
 * This module is written centrally (not by a delegated translation agent)
 * because it defines the execution model — `Environment`/`Procedure`
 * invocation and the `OutputSignal`/`GoSignal` control-flow exceptions —
 * that every other module's primitives are tested against.
 */

import {
  PRIMITIVES,
  PROCEDURE_ARITY,
  defPrimitive,
  isTrue,
  NO_VALUE,
  VarRef,
  LogoListLit,
  CallExpr,
  Procedure,
  OutputSignal,
  GoSignal,
  LogoError,
  Quoted,
  DoubleQuoted,
  Bracketed,
  Parenthesized,
} from "./types.js";
import {
  unboundVariable,
  undefinedFunction,
  wrongNumberOfArgs,
} from "./errors.js";

/**
 * Dynamically-scoped (MACLISP "SPECIAL"-variable style) variable bindings,
 * the ES6 analog of LLOGO's global `OBARRAY` value cells plus `LOCAL`.
 * `MAKE` always sets the innermost active binding for a name (the global
 * one, unless some enclosing still-running procedure declared it
 * `LOCAL`); `LOCAL` pushes a fresh, initially-unbound slot that is popped
 * automatically when that procedure call returns (see `Interpreter#call`).
 */
export class Environment {
  constructor() {
    /** @type {Map<string, Array<LogoValueOrUndefined>>} */
    this.stacks = new Map();
    /**
     * Stack of frames, one per currently-running procedure call; each
     * frame lists the uppercased names `local`'d during that call (whether
     * via a parameter binding or an explicit `LOCAL` primitive call), so
     * `popFrame` can unbind exactly those names when the call returns —
     * this is what makes `LOCAL` inside a procedure body (not just its
     * parameters) automatically restore the outer value on return.
     * @type {string[][]}
     */
    this.frames = [];
  }

  /**
   * Start a new procedure-call frame. Pair with `popFrame` in a `finally`.
   */
  pushFrame() {
    this.frames.push([]);
  }

  /**
   * End the current procedure-call frame, unbinding every name `local`'d
   * during it (in reverse order, as a proper stack unwind).
   */
  popFrame() {
    const names = this.frames.pop() ?? [];
    for (let i = names.length - 1; i >= 0; i--) {
      const stack = this.stacks.get(names[i]);
      if (stack) stack.pop();
    }
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  isBound(name) {
    const stack = this.stacks.get(name.toUpperCase());
    return !!stack && stack.length > 0 && stack[stack.length - 1] !== undefined;
  }

  /**
   * `THING "name` / `:name`.
   * @param {string} name
   * @returns {import('./types.js').LogoValue}
   */
  thing(name) {
    const stack = this.stacks.get(name.toUpperCase());
    if (!stack || stack.length === 0 || stack[stack.length - 1] === undefined) {
      throw unboundVariable(name);
    }
    return stack[stack.length - 1];
  }

  /**
   * `MAKE "name value`. Sets the innermost active binding (a `LOCAL` from
   * the nearest enclosing still-running procedure that declared one, else
   * the global).
   * @param {string} name
   * @param {import('./types.js').LogoValue} value
   */
  make(name, value) {
    const key = name.toUpperCase();
    let stack = this.stacks.get(key);
    if (!stack) {
      stack = [value];
      this.stacks.set(key, stack);
    } else if (stack.length === 0) {
      stack.push(value);
    } else {
      stack[stack.length - 1] = value;
    }
  }

  /**
   * `LOCAL "name`. Pushes a fresh, unbound slot for `name`, shadowing any
   * global/outer value for the duration of the current procedure call, and
   * records it in the current frame (see `pushFrame`/`popFrame`) so it is
   * unbound automatically when that call returns.
   * @param {string} name
   */
  local(name) {
    const key = name.toUpperCase();
    let stack = this.stacks.get(key);
    if (!stack) {
      stack = [];
      this.stacks.set(key, stack);
    }
    stack.push(undefined);
    if (this.frames.length > 0) {
      this.frames[this.frames.length - 1].push(key);
    }
  }
}

/** @typedef {import('./types.js').LogoValue|undefined} LogoValueOrUndefined */

/**
 * Turn one raw, unresolved token (as `lexer.js` produced it — possibly a
 * `Quoted`/`DoubleQuoted`/`Bracketed`/`Parenthesized` wrapper from
 * `types.js`) into a plain displayable/usable `LogoValue`, recursively.
 * This is the "treat bracket content as inert data" half of the dual
 * data/code nature of `[...]` described on `LogoListLit`; the "treat it as
 * code" half is `runList` below. A bare word is simply itself here — no
 * procedure lookup happens, matching real Logo's `PRINT [FORWARD 100]`
 * printing the words `FORWARD 100`, not calling `FORWARD`.
 * @param {import('./types.js').RawToken|LogoListLit} token
 * @returns {import('./types.js').LogoValue}
 */
function rawTokenToValue(token) {
  if (token instanceof LogoListLit) return token.items.map(rawTokenToValue);
  if (token instanceof Bracketed) return token.items.map(rawTokenToValue);
  if (token instanceof Parenthesized) return token.items.map(rawTokenToValue);
  if (token instanceof Quoted || token instanceof DoubleQuoted) {
    return rawTokenToValue(token.value);
  }
  // Plain number/string already in final form.
  return token;
}

/**
 * Turns a parsed literal (a `LogoListLit` of raw tokens) into a plain JS
 * array/word/number, i.e. a real `LogoValue`, for use as inert data (e.g.
 * the argument to `PRINT` or `FIRST`). Plain strings/numbers pass through
 * unchanged.
 * @param {import('./types.js').LogoValue|LogoListLit} item
 * @returns {import('./types.js').LogoValue}
 */
export function materialize(item) {
  if (item instanceof LogoListLit) return item.items.map(rawTokenToValue);
  return item;
}

/**
 * Evaluate one parsed expression (a literal, a `VarRef`, or a `CallExpr`)
 * in the given environment.
 * @param {import('./types.js').LogoValue|VarRef|CallExpr|LogoListLit} expr
 * @param {Environment} env
 * @returns {import('./types.js').LogoValue|typeof NO_VALUE}
 */
export function evalExpr(expr, env) {
  if (expr instanceof VarRef) return env.thing(expr.name);
  if (expr instanceof LogoListLit) return materialize(expr);
  if (expr instanceof CallExpr) return evalCall(expr, env);
  // Plain number/string/array literal already in final form.
  return expr;
}

/**
 * Look up and invoke a primitive or user-defined procedure by name.
 * @param {CallExpr} expr
 * @param {Environment} env
 * @returns {import('./types.js').LogoValue|typeof NO_VALUE}
 */
function evalCall(expr, env) {
  const name = expr.name.toUpperCase();
  const prim = PRIMITIVES.get(name);
  if (prim) {
    if (prim.kind === "fexpr") {
      return prim.fn(expr.args, env, evalExpr);
    }
    const args = expr.args.map((a) => evalExpr(a, env));
    return prim.fn(...args);
  }
  const proc = PROCEDURES.get(name);
  if (proc) {
    const args = expr.args.map((a) => evalExpr(a, env));
    return callProcedure(proc, args, env);
  }
  throw undefinedFunction(expr.name);
}

/**
 * The procedure table, the ES6 analog of LLOGO's `OBARRAY` function cells
 * for user-defined (`TO ... END`) procedures.
 * @type {Map<string, Procedure>}
 */
export const PROCEDURES = new Map();

/**
 * Invoke a user-defined procedure: binds each parameter as a fresh `LOCAL`,
 * runs the body (honoring numbered-line `GO` targets and `OUTPUT`/`STOP`),
 * and always unbinds the parameters on the way out — this `finally` is the
 * ES6 analog of MACLISP's automatic unbinding of a `PROG`'s variables when
 * it is exited, by any means (normal fall-through, `RETURN`, or a thrown
 * error).
 * @param {Procedure} proc
 * @param {import('./types.js').LogoValue[]} args
 * @param {Environment} env
 * @returns {import('./types.js').LogoValue|typeof NO_VALUE}
 */
export function callProcedure(proc, args, env) {
  if (args.length !== proc.params.length) {
    throw wrongNumberOfArgs(proc.name);
  }
  env.pushFrame();
  for (let i = 0; i < proc.params.length; i++) {
    env.local(proc.params[i]);
    env.make(proc.params[i], args[i]);
  }
  try {
    return runBody(proc.body, env);
  } finally {
    env.popFrame();
  }
}

/**
 * Run a procedure's body (an ordered list of `Line`s, each with an
 * optional old-style line-number `tag`), honoring `GO tag` (resume at that
 * tag — a `GoSignal` thrown by the `GO` primitive) and `OUTPUT`/`STOP`
 * (stop immediately and return a value — an `OutputSignal`). Falling off
 * the end without an `OUTPUT`/`STOP` returns `NO_VALUE`, matching LLOGO's
 * STOP-less procedure fall-through.
 * @param {import('./types.js').Line[]} body
 * @param {Environment} env
 * @returns {import('./types.js').LogoValue|typeof NO_VALUE}
 */
export function runBody(body, env) {
  let pc = 0;
  while (pc < body.length) {
    try {
      for (const form of body[pc].forms) {
        evalExpr(form, env);
      }
    } catch (e) {
      if (e instanceof OutputSignal) return e.value;
      if (e instanceof GoSignal) {
        const idx = body.findIndex((line) => line.tag === e.tag);
        if (idx === -1) {
          throw new LogoError(
            `CAN'T FIND LINE ${e.tag} TO GO TO IN THIS PROCEDURE`
          );
        }
        pc = idx;
        continue;
      }
      throw e;
    }
    pc++;
  }
  return NO_VALUE;
}

/**
 * Run a `LogoListLit`'s raw tokens as Logo source, the ES6 analog of
 * LLOGO's `RUN`/`EVALS`. This is how `REPEAT`/`IF`/`WHILE`/`UNTIL`/
 * `FOREVER` interpret a bracketed argument as a sequence of instructions:
 * the list's unresolved `RawToken`s (exactly as `src/lexer.js` produced
 * them — see `LogoListLit`'s doc comment for why they must stay
 * unresolved) are fed to the parser, which resolves `:name` references and
 * groups calls with their arguments as if this were freshly-typed source,
 * and the resulting forms are evaluated in order, returning the value of
 * the last one (or `NO_VALUE` for an empty list).
 *
 * Kept as an injectable function (`setRunList`) rather than a direct
 * `import` of `parser.js`, so this module has no hard load-order
 * dependency on the parser during development/testing.
 * @type {(items: import('./types.js').RawToken[], env: Environment) => import('./types.js').LogoValue|typeof NO_VALUE}
 */
export let runList = () => {
  throw new Error(
    "runList not wired up yet — call setRunList(parseLine) at startup"
  );
};

/**
 * Wire in the real implementation of `runList`, backed by `parser.js`'s
 * `parseLine`. Called once at application startup (see `src/app.js`).
 * @param {(tokens: import('./types.js').RawToken[]) => CallExpr[]} parseLine
 */
export function setRunList(parseLine) {
  runList = (items, env) => {
    const forms = parseLine(items);
    let result = NO_VALUE;
    for (const form of forms) result = evalExpr(form, env);
    return result;
  };
}

// ---------------------------------------------------------------------
// Control-flow primitives (primit.304's CONTROL section).
// ---------------------------------------------------------------------

defPrimitive("GO", {
  kind: "fexpr",
  arity: 1,
  fn: (args, env) => {
    const tag = evalExpr(args[0], env);
    throw new GoSignal(Number(tag));
  },
});

defPrimitive("OUTPUT", {
  kind: "fexpr",
  arity: 1,
  fn: (args, env) => {
    throw new OutputSignal(evalExpr(args[0], env));
  },
});
defPrimitive("STOP", {
  kind: "fexpr",
  arity: 0,
  fn: () => {
    throw new OutputSignal(NO_VALUE);
  },
});

defPrimitive("TEST", {
  kind: "fexpr",
  arity: 1,
  fn: (args, env) => {
    env.testFlag = evalExpr(args[0], env);
    return NO_VALUE;
  },
});
defPrimitive("IFTRUE", {
  kind: "fexpr",
  arity: "L",
  fn: (args, env) => {
    if (env.testFlag === undefined || !isTrue(env.testFlag)) return NO_VALUE;
    let result = NO_VALUE;
    for (const a of args) result = runBodyArg(a, env);
    return result;
  },
});
defPrimitive("IFFALSE", {
  kind: "fexpr",
  arity: "L",
  fn: (args, env) => {
    if (env.testFlag !== undefined && isTrue(env.testFlag)) return NO_VALUE;
    let result = NO_VALUE;
    for (const a of args) result = runBodyArg(a, env);
    return result;
  },
});

/**
 * `IF <condition> <rest of line>`: evaluates the condition, and if true,
 * evaluates the remaining forms in order, mirroring LLOGO's `IF` (which
 * the original compiled at parse time into a `COND`; here it is simply a
 * `'L'`-arity `fexpr`, see docs/ARCHITECTURE.md).
 */
defPrimitive("IF", {
  kind: "fexpr",
  arity: "L",
  fn: (args, env) => {
    if (args.length === 0) return NO_VALUE;
    const cond = evalExpr(args[0], env);
    if (!isTrue(cond)) return NO_VALUE;
    let result = NO_VALUE;
    for (let i = 1; i < args.length; i++) result = runBodyArg(args[i], env);
    return result;
  },
});

/**
 * Evaluate a materialized bracket argument (array of words/numbers/
 * sublists) as a body: re-parse and run it via `runList`. If the argument
 * wasn't a list (a bare instruction was given instead, e.g. a single
 * `CallExpr`), evaluate it directly instead — supports both
 * `REPEAT 4 [FORWARD 100]` and a single already-parsed call.
 * @param {*} bodyExpr
 * @param {Environment} env
 */
function runBodyArg(bodyExpr, env) {
  if (bodyExpr instanceof LogoListLit) {
    // Pass the RAW tokens (not `materialize`d plain values) so the parser
    // re-derives `:name` variable references and call-argument grouping
    // exactly as it would from fresh source text — see `LogoListLit`'s and
    // `runList`'s doc comments for why this must stay unresolved until now.
    return runList(bodyExpr.items, env);
  }
  return evalExpr(bodyExpr, env);
}

defPrimitive("REPEAT", {
  kind: "fexpr",
  arity: "L",
  fn: (args, env) => {
    const n = evalExpr(args[0], env);
    let result = NO_VALUE;
    for (let i = 1; i <= Number(n); i++) {
      for (let j = 1; j < args.length; j++) result = runBodyArg(args[j], env);
    }
    return result;
  },
});
defPrimitive("WHILE", {
  kind: "fexpr",
  arity: "L",
  fn: (args, env) => {
    let result = NO_VALUE;
    while (isTrue(evalExpr(args[0], env))) {
      for (let j = 1; j < args.length; j++) result = runBodyArg(args[j], env);
    }
    return result;
  },
});
defPrimitive("UNTIL", {
  kind: "fexpr",
  arity: "L",
  fn: (args, env) => {
    let result = NO_VALUE;
    while (!isTrue(evalExpr(args[0], env))) {
      for (let j = 1; j < args.length; j++) result = runBodyArg(args[j], env);
    }
    return result;
  },
});
defPrimitive("FOREVER", {
  kind: "fexpr",
  arity: "L",
  fn: (args, env) => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const a of args) runBodyArg(a, env);
    }
  },
});

defPrimitive("MAKE", {
  kind: "fexpr",
  arity: 2,
  fn: (args, env) => {
    const name = evalExpr(args[0], env);
    const value = evalExpr(args[1], env);
    env.make(String(name), value);
    return NO_VALUE;
  },
});
// THING needs the Environment (to look up the named variable), so despite
// being a plain value-returning call in Logo source (`THING "x`, which is
// what `:x` desugars to), it is registered as a fexpr that evaluates its
// own single argument itself.
defPrimitive("THING", {
  kind: "fexpr",
  arity: 1,
  fn: (args, env) => env.thing(String(evalExpr(args[0], env))),
});
defPrimitive("LOCAL", {
  kind: "fexpr",
  arity: "L",
  fn: (args, env) => {
    for (const a of args) {
      const name = evalExpr(a, env);
      if (Array.isArray(name)) {
        for (const n of name) env.local(String(n));
      } else {
        env.local(String(name));
      }
    }
    return NO_VALUE;
  },
});

/**
 * Register parameter-count-only arity for a procedure (pass 1 of the
 * two-pass scheme described in docs/ARCHITECTURE.md), without parsing its
 * body yet. Called while scanning a script for `TO name :p1 :p2 ... / END`
 * blocks.
 * @param {string} name
 * @param {string[]} params
 */
export function declareProcedure(name, params) {
  PROCEDURE_ARITY.set(name.toUpperCase(), params.length);
}

/**
 * Register a fully-parsed procedure (pass 2). Overwrites any previous
 * definition of the same name (Logo allows redefinition).
 * @param {Procedure} proc
 */
export function defineProcedure(proc) {
  PROCEDURES.set(proc.name.toUpperCase(), proc);
}
