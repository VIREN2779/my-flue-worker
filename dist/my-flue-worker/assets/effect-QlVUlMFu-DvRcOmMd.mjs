import { t as MissingDependencyError } from "./index-CLddUTqr-C6yxLcdh.mjs";
//#region node_modules/@standard-community/standard-json/dist/effect-QlVUlMFu.js
async function getToJsonSchemaFn() {
	try {
		const { JSONSchema } = await import("./standard-json-Cqd9H7ZX.mjs");
		return (schema) => JSONSchema.make(schema);
	} catch {
		throw new MissingDependencyError("effect");
	}
}
//#endregion
export { getToJsonSchemaFn as default };
