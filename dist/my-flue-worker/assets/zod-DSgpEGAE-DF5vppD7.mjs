import "./dist-B12Q3baj.mjs";
import { t as errorMessageWrapper } from "./index-DZEfthgZ-DQMQd2i5.mjs";
import getToOpenAPISchemaFn$1 from "./default-u_dwuiYb-DS3spciu.mjs";
//#region node_modules/@flue/runtime/node_modules/@standard-community/standard-openapi/dist/zod-DSgpEGAE.js
function getToOpenAPISchemaFn() {
	return async (schema, context) => {
		if ("_zod" in schema) return getToOpenAPISchemaFn$1()(schema, {
			components: context.components,
			options: {
				io: "input",
				...context.options
			}
		});
		try {
			const { createSchema } = await import("./standard-openapi-BmVPy8va.mjs");
			const { schema: _schema, components } = createSchema(schema, {
				schemaType: "input",
				...context.options
			});
			if (components) context.components.schemas = {
				...context.components.schemas,
				...components
			};
			return _schema;
		} catch {
			throw new Error(errorMessageWrapper(`Missing dependencies "zod-openapi v4".`));
		}
	};
}
//#endregion
export { getToOpenAPISchemaFn as default };
