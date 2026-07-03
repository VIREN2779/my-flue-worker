import { $ as _coercedNumber, Q as _coercedBoolean } from "./core-wO1Mfw9P.mjs";
import { n as ZodNumber, t as ZodBoolean } from "./schemas-fbHWY9aD.mjs";
//#region node_modules/zod/v4/classic/coerce.js
function number(params) {
	return _coercedNumber(ZodNumber, params);
}
function boolean(params) {
	return _coercedBoolean(ZodBoolean, params);
}
//#endregion
export { number as n, boolean as t };
