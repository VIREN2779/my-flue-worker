import { t as MissingDependencyError } from "./index-CLddUTqr-C6yxLcdh.mjs";
//#region node_modules/@standard-community/standard-json/dist/valibot--1zFm7rT.js
async function getToJsonSchemaFn() {
	try {
		const { toJsonSchema } = await import("../index.mjs").then((n) => n.t);
		return toJsonSchema;
	} catch {
		throw new MissingDependencyError("@valibot/to-json-schema");
	}
}
//#endregion
export { getToJsonSchemaFn as default };
