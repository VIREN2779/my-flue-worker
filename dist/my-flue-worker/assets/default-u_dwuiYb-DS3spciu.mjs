import { n as toJsonSchema } from "./index-CLddUTqr-C6yxLcdh.mjs";
import "./dist-B12Q3baj.mjs";
import { t as convertToOpenAPISchema } from "./convert-mYDlHkFG.mjs";
//#region node_modules/@flue/runtime/node_modules/@standard-community/standard-openapi/dist/default-u_dwuiYb.js
function getToOpenAPISchemaFn() {
	return async (schema, context) => convertToOpenAPISchema(await toJsonSchema(schema, context.options), context);
}
//#endregion
export { getToOpenAPISchemaFn as default };
