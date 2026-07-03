import { n as toJsonSchema } from "./index-CLddUTqr-C6yxLcdh.mjs";
import "./dist-B12Q3baj.mjs";
import { t as convertToOpenAPISchema } from "./convert-mYDlHkFG.mjs";
//#region node_modules/@flue/runtime/node_modules/@standard-community/standard-openapi/dist/valibot-D_HTw1Gn.js
function getToOpenAPISchemaFn() {
	return async (schema, context) => {
		const openapiSchema = await toJsonSchema(schema, {
			errorMode: "ignore",
			overrideAction: ({ valibotAction, jsonSchema }) => {
				const _jsonSchema = convertToOpenAPISchema(jsonSchema, context);
				if (valibotAction.kind === "metadata" && valibotAction.type === "metadata" && !("$ref" in _jsonSchema)) {
					const metadata = valibotAction.metadata;
					if (metadata.example !== void 0) _jsonSchema.example = metadata.example;
					if (metadata.examples && metadata.examples.length > 0) _jsonSchema.examples = metadata.examples;
					if (metadata.ref) {
						context.components.schemas = {
							...context.components.schemas,
							[metadata.ref]: _jsonSchema
						};
						return { $ref: `#/components/schemas/${metadata.ref}` };
					}
				}
				return _jsonSchema;
			},
			...context.options
		});
		if ("$schema" in openapiSchema) delete openapiSchema.$schema;
		return openapiSchema;
	};
}
//#endregion
export { getToOpenAPISchemaFn as default };
