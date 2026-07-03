import { t as MissingDependencyError } from "./index-CLddUTqr-C6yxLcdh.mjs";
//#region node_modules/@standard-community/standard-json/dist/sury-CWZTCd75.js
async function getToJsonSchemaFn() {
	try {
		const { toJSONSchema } = await import("./standard-json-BHe1GbcV.mjs");
		return toJSONSchema;
	} catch {
		throw new MissingDependencyError("sury");
	}
}
//#endregion
export { getToJsonSchemaFn as default };
