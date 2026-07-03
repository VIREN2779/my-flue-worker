//#region node_modules/@flue/runtime/node_modules/@standard-community/standard-openapi/dist/index-DZEfthgZ.js
var errorMessageWrapper = (message) => `standard-openapi: ${message}`;
var openapiVendorMap = /* @__PURE__ */ new Map();
var getToOpenAPISchemaFn = async (vendor) => {
	const cached = openapiVendorMap.get(vendor);
	if (cached) return cached;
	let vendorFn;
	switch (vendor) {
		case "valibot":
			vendorFn = (await import("./valibot-D_HTw1Gn-BCaO59lp.mjs")).default();
			break;
		case "zod":
			vendorFn = (await import("./zod-DSgpEGAE-DF5vppD7.mjs")).default();
			break;
		default: vendorFn = (await import("./default-u_dwuiYb-DS3spciu.mjs")).default();
	}
	openapiVendorMap.set(vendor, vendorFn);
	return vendorFn;
};
var toOpenAPISchema = async (schema, context = {}) => {
	const fn = await getToOpenAPISchemaFn(schema["~standard"].vendor);
	const { components = {}, options } = context;
	return {
		schema: await fn(schema, {
			components,
			options
		}),
		components: Object.keys(components).length > 0 ? components : void 0
	};
};
//#endregion
export { toOpenAPISchema as n, errorMessageWrapper as t };
