//#region node_modules/@standard-community/standard-json/dist/typebox-Dei93FPO.js
function getToJsonSchemaFn() {
	return (schema) => JSON.parse(JSON.stringify(schema.Type()));
}
//#endregion
export { getToJsonSchemaFn as default };
