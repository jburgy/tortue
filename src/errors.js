import { LogoError, NO_VALUE } from "./types.js";
import { formatValue } from "./printer.js";

/** @typedef {import("./types.js").LogoValue} LogoValue */

/**
 * Create the classic Logo error for reading a variable with no current
 * value.
 *
 * @param {string} name
 * @returns {LogoError}
 */
export function unboundVariable(name) {
  return new LogoError(`${String(name).toUpperCase()} HAS NO VALUE`);
}

/**
 * Create the classic Logo error for calling an unknown procedure.
 *
 * @param {string} name
 * @returns {LogoError}
 */
export function undefinedFunction(name) {
  return new LogoError(`${String(name).toUpperCase()} IS AN UNDEFINED FUNCTION`);
}

/**
 * Create the classic Logo error for passing an input of the wrong type.
 *
 * When the bad value is `NO_VALUE`, the message follows LLOGO's special
 * wording for an input expression that failed to output anything.
 *
 * @param {string} fnName
 * @param {LogoValue|typeof NO_VALUE} value
 * @returns {LogoError}
 */
export function wrongTypeArgument(fnName, value) {
  const functionName = String(fnName).toUpperCase();
  if (value === NO_VALUE) {
    return new LogoError(
      `AN ARGUMENT TO ${functionName} WAS SOMETHING THAT DIDN'T OUTPUT`
    );
  }
  return new LogoError(
    `THE INPUT ${formatValue(value)} TO ${functionName} IS OF THE WRONG TYPE`
  );
}

/**
 * Create the classic Logo error for a call with the wrong number of inputs.
 *
 * If the caller knows the expected arity, pass either a fixed number or a
 * `{ min, max }` range to get an LLOGO-style "EXPECTED ... INPUTS" message.
 * Otherwise a generic "WRONG NUMBER OF INPUTS" message is returned.
 *
 * @param {string} fnName
 * @param {number|{min:number, max:number}} [expected]
 * @returns {LogoError}
 */
export function wrongNumberOfArgs(fnName, expected) {
  const functionName = String(fnName).toUpperCase();

  if (typeof expected === "number") {
    return new LogoError(
      `${functionName} EXPECTED ${expected} INPUT${expected === 1 ? "" : "S"}`
    );
  }

  if (expected && typeof expected.min === "number" && typeof expected.max === "number") {
    return new LogoError(
      `${functionName} EXPECTED BETWEEN ${expected.min} AND ${expected.max} INPUTS`
    );
  }

  return new LogoError(`WRONG NUMBER OF INPUTS TO ${functionName}`);
}
