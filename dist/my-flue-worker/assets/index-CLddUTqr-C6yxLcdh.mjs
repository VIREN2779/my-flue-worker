//#region node_modules/quansync/dist/index.mjs
var GET_IS_ASYNC = Symbol.for("quansync.getIsAsync");
var QuansyncError = class extends Error {
	constructor(message = "Unexpected promise in sync context") {
		super(message);
		this.name = "QuansyncError";
	}
};
function isThenable(value) {
	return value && typeof value === "object" && typeof value.then === "function";
}
function isQuansyncGenerator(value) {
	return value && typeof value === "object" && typeof value[Symbol.iterator] === "function" && "__quansync" in value;
}
function fromObject(options) {
	const generator = function* (...args) {
		if (yield GET_IS_ASYNC) return yield options.async.apply(this, args);
		return options.sync.apply(this, args);
	};
	function fn(...args) {
		const iter = generator.apply(this, args);
		iter.then = (...thenArgs) => options.async.apply(this, args).then(...thenArgs);
		iter.__quansync = true;
		return iter;
	}
	fn.sync = options.sync;
	fn.async = options.async;
	return fn;
}
function fromPromise(promise) {
	return fromObject({
		async: () => Promise.resolve(promise),
		sync: () => {
			if (isThenable(promise)) throw new QuansyncError();
			return promise;
		}
	});
}
function unwrapYield(value, isAsync) {
	if (value === GET_IS_ASYNC) return isAsync;
	if (isQuansyncGenerator(value)) return isAsync ? iterateAsync(value) : iterateSync(value);
	if (!isAsync && isThenable(value)) throw new QuansyncError();
	return value;
}
var DEFAULT_ON_YIELD = (value) => value;
function iterateSync(generator, onYield = DEFAULT_ON_YIELD) {
	let current = generator.next();
	while (!current.done) try {
		current = generator.next(unwrapYield(onYield(current.value, false)));
	} catch (err) {
		current = generator.throw(err);
	}
	return unwrapYield(current.value);
}
async function iterateAsync(generator, onYield = DEFAULT_ON_YIELD) {
	let current = generator.next();
	while (!current.done) try {
		current = generator.next(await unwrapYield(onYield(current.value, true), true));
	} catch (err) {
		current = generator.throw(err);
	}
	return current.value;
}
function fromGeneratorFn(generatorFn, options) {
	return fromObject({
		name: generatorFn.name,
		async(...args) {
			return iterateAsync(generatorFn.apply(this, args), options?.onYield);
		},
		sync(...args) {
			return iterateSync(generatorFn.apply(this, args), options?.onYield);
		}
	});
}
function quansync(input, options) {
	if (isThenable(input)) return fromPromise(input);
	if (typeof input === "function") return fromGeneratorFn(input, options);
	else return fromObject(input);
}
quansync({
	async: () => Promise.resolve(true),
	sync: () => false
});
//#endregion
//#region node_modules/@standard-community/standard-json/dist/index-CLddUTqr.js
var validationMapper = /* @__PURE__ */ new Map();
var UnsupportedVendorError = class extends Error {
	constructor(vendor) {
		super(`standard-json: Unsupported schema vendor "${vendor}".`);
	}
};
var MissingDependencyError = class extends Error {
	constructor(packageName) {
		super(`standard-json: Missing dependencies "${packageName}".`);
	}
};
var getToJsonSchemaFn = async (vendor) => {
	const cached = validationMapper.get(vendor);
	if (cached) return cached;
	let vendorFnPromise;
	switch (vendor) {
		case "arktype":
			vendorFnPromise = (await import("./arktype-aI7TBD0R-CfW2fttN.mjs")).default();
			break;
		case "effect":
			vendorFnPromise = (await import("./effect-QlVUlMFu-DvRcOmMd.mjs")).default();
			break;
		case "sury":
			vendorFnPromise = (await import("./sury-CWZTCd75-DTG9kFmG.mjs")).default();
			break;
		case "typebox":
			vendorFnPromise = (await import("./typebox-Dei93FPO-KlN95G6H.mjs")).default();
			break;
		case "valibot":
			vendorFnPromise = (await import("./valibot--1zFm7rT-BAtKYSSS.mjs")).default();
			break;
		case "zod":
			vendorFnPromise = (await import("./zod-Bwrt9trS-DjtYzo8-.mjs")).default();
			break;
		default: throw new UnsupportedVendorError(vendor);
	}
	const vendorFn = await vendorFnPromise;
	validationMapper.set(vendor, vendorFn);
	return vendorFn;
};
var toJsonSchema = quansync({
	sync: (schema, options) => {
		const vendor = schema["~standard"].vendor;
		const fn = validationMapper.get(vendor);
		if (!fn) throw new UnsupportedVendorError(vendor);
		return fn(schema, options);
	},
	async: async (schema, options) => {
		return (await getToJsonSchemaFn(schema["~standard"].vendor))(schema, options);
	}
});
//#endregion
export { toJsonSchema as n, MissingDependencyError as t };
