import { t as MissingDependencyError } from "./index-CLddUTqr-C6yxLcdh.mjs";
//#region node_modules/@standard-community/standard-json/dist/zod-Bwrt9trS.js
var zodv4Error = new MissingDependencyError("zod v4");
async function getToJsonSchemaFn() {
	return async (schema, options) => {
		let handler;
		if ("_zod" in schema) try {
			handler = (await import("./core-wO1Mfw9P.mjs").then((n) => n.t)).toJSONSchema;
		} catch {
			throw zodv4Error;
		}
		else try {
			handler = (await import("./esm-ZyqPvhu6.mjs").then((n) => n.t)).zodToJsonSchema;
		} catch {
			throw new MissingDependencyError("zod-to-json-schema");
		}
		return handler(schema, options);
	};
}
//#endregion
export { getToJsonSchemaFn as default };
