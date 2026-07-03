//#region node_modules/@earendil-works/pi-ai/dist/utils/event-stream.js
var EventStream = class {
	queue = [];
	waiting = [];
	done = false;
	finalResultPromise;
	resolveFinalResult;
	isComplete;
	extractResult;
	constructor(isComplete, extractResult) {
		this.isComplete = isComplete;
		this.extractResult = extractResult;
		this.finalResultPromise = new Promise((resolve) => {
			this.resolveFinalResult = resolve;
		});
	}
	push(event) {
		if (this.done) return;
		if (this.isComplete(event)) {
			this.done = true;
			this.resolveFinalResult(this.extractResult(event));
		}
		const waiter = this.waiting.shift();
		if (waiter) waiter({
			value: event,
			done: false
		});
		else this.queue.push(event);
	}
	end(result) {
		this.done = true;
		if (result !== void 0) this.resolveFinalResult(result);
		while (this.waiting.length > 0) this.waiting.shift()({
			value: void 0,
			done: true
		});
	}
	async *[Symbol.asyncIterator]() {
		while (true) if (this.queue.length > 0) yield this.queue.shift();
		else if (this.done) return;
		else {
			const result = await new Promise((resolve) => this.waiting.push(resolve));
			if (result.done) return;
			yield result.value;
		}
	}
	result() {
		return this.finalResultPromise;
	}
};
var AssistantMessageEventStream = class extends EventStream {
	constructor() {
		super((event) => event.type === "done" || event.type === "error", (event) => {
			if (event.type === "done") return event.message;
			else if (event.type === "error") return event.error;
			throw new Error("Unexpected event type for final result");
		});
	}
};
/** Factory function for AssistantMessageEventStream (for use in extensions) */
function createAssistantMessageEventStream() {
	return new AssistantMessageEventStream();
}
//#endregion
//#region node_modules/@earendil-works/pi-ai/dist/api/lazy.js
function createSetupErrorMessage(model, error) {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0
			}
		},
		stopReason: "error",
		errorMessage: error instanceof Error ? error.message : String(error),
		timestamp: Date.now()
	};
}
function forwardStream(target, source) {
	(async () => {
		for await (const event of source) target.push(event);
		target.end();
	})();
}
/**
* Returns a stream synchronously while running async setup (auth resolution,
* lazy module loading) behind it. Setup failures terminate the stream with an
* error event.
*/
function lazyStream(model, setup) {
	const outer = new AssistantMessageEventStream();
	setup().then((inner) => {
		forwardStream(outer, inner);
	}).catch((error) => {
		const message = createSetupErrorMessage(model, error);
		outer.push({
			type: "error",
			reason: "error",
			error: message
		});
		outer.end(message);
	});
	return outer;
}
/**
* Wraps a dynamically imported API implementation module as `ProviderStreams`.
* The module loads on first stream call; the host's import cache deduplicates
* loads. Load failures terminate the returned stream with an error event.
*/
function lazyApi(load) {
	return {
		stream: (model, context, options) => lazyStream(model, async () => (await load()).stream(model, context, options)),
		streamSimple: (model, context, options) => lazyStream(model, async () => (await load()).streamSimple(model, context, options))
	};
}
//#endregion
//#region node_modules/@earendil-works/pi-ai/dist/auth/context.js
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
var importNodeModule = (specifier) => import(__rewriteRelativeImportExtension(specifier));
function getProcessEnv() {
	return globalThis.process?.env;
}
/**
* Default auth context: env vars from `process.env` (undefined in browsers),
* file existence via node:fs (always false in browsers).
*/
function defaultProviderAuthContext() {
	return {
		async env(name) {
			const value = getProcessEnv()?.[name];
			return typeof value === "string" && value.trim().length > 0 ? value : void 0;
		},
		async fileExists(path) {
			try {
				const fs = await importNodeModule("node:fs/promises");
				let resolved = path;
				if (resolved.startsWith("~")) resolved = (await importNodeModule("node:os")).homedir() + resolved.slice(1);
				await fs.access(resolved);
				return true;
			} catch {
				return false;
			}
		}
	};
}
//#endregion
//#region node_modules/@earendil-works/pi-ai/dist/auth/credential-store.js
/**
* Default in-memory credential store. Apps inject persistent stores.
* Keyed by `Provider.id`, one credential per provider; see `CredentialStore`.
* Writes are serialized per provider through a promise chain.
*/
var InMemoryCredentialStore = class {
	credentials = /* @__PURE__ */ new Map();
	chains = /* @__PURE__ */ new Map();
	/** Serialize tasks per provider id. */
	enqueue(providerId, task) {
		const previous = this.chains.get(providerId) ?? Promise.resolve();
		const next = (async () => {
			await previous.catch(() => {});
			return task();
		})();
		this.chains.set(providerId, next.catch(() => {}));
		return next;
	}
	async read(providerId) {
		return this.credentials.get(providerId);
	}
	modify(providerId, fn) {
		return this.enqueue(providerId, async () => {
			const current = this.credentials.get(providerId);
			const next = await fn(current);
			if (next !== void 0) this.credentials.set(providerId, next);
			return next ?? current;
		});
	}
	delete(providerId) {
		return this.enqueue(providerId, async () => {
			this.credentials.delete(providerId);
		});
	}
};
//#endregion
//#region node_modules/@earendil-works/pi-ai/dist/auth/resolve.js
var ModelsError = class extends Error {
	code;
	constructor(code, message, options) {
		super(message, options);
		this.name = "ModelsError";
		this.code = code;
	}
};
/**
* Auth resolution shared by the `Models` and `ImagesModels` collections.
* A stored credential owns the provider: ambient/env is consulted only when
* nothing is stored. No silent env fallback after a failed refresh or for a
* credential type without a matching handler.
*/
async function resolveProviderAuth(provider, model, credentials, authContext, overrides) {
	const requestAuthContext = overrides?.env ? overlayEnvAuthContext(authContext, overrides.env) : authContext;
	if (overrides?.apiKey !== void 0 && provider.auth.apiKey) return resolveApiKey(requestAuthContext, provider.auth.apiKey, model, {
		type: "api_key",
		key: overrides.apiKey,
		env: overrides.env
	});
	const stored = await readCredential(credentials, provider.id);
	if (stored) {
		if (stored.type === "oauth" && provider.auth.oauth) return resolveStoredOAuth(credentials, provider.id, provider.auth.oauth, stored);
		if (stored.type === "api_key" && provider.auth.apiKey) {
			const credential = overrides?.env ? {
				...stored,
				env: {
					...stored.env,
					...overrides.env
				}
			} : stored;
			return resolveApiKey(requestAuthContext, provider.auth.apiKey, model, credential);
		}
		return;
	}
	return provider.auth.apiKey ? resolveApiKey(requestAuthContext, provider.auth.apiKey, model, void 0) : void 0;
}
function overlayEnvAuthContext(base, env) {
	return {
		env: async (name) => env[name] || await base.env(name),
		fileExists: (path) => base.fileExists(path)
	};
}
/**
* OAuth resolution with double-checked locking (same pattern as today's
* AuthStorage): valid tokens cost zero locks; expired tokens lock, re-check
* expiry under the lock, refresh once globally, and persist the rotated
* credential before release.
*/
async function resolveStoredOAuth(credentials, providerId, oauth, stored) {
	let credential = stored;
	if (Date.now() >= credential.expires) {
		let post;
		try {
			post = await credentials.modify(providerId, async (current) => {
				if (current?.type !== "oauth") return void 0;
				if (Date.now() < current.expires) return void 0;
				try {
					return await oauth.refresh(current);
				} catch (error) {
					throw new ModelsError("oauth", `OAuth refresh failed for ${providerId}`, { cause: error });
				}
			});
		} catch (error) {
			if (error instanceof ModelsError) throw error;
			throw new ModelsError("auth", `Credential store modify failed for ${providerId}`, { cause: error });
		}
		if (post?.type !== "oauth") return void 0;
		credential = post;
	}
	try {
		return {
			auth: await oauth.toAuth(credential),
			source: "OAuth"
		};
	} catch (error) {
		throw new ModelsError("oauth", `OAuth auth derivation failed for ${providerId}`, { cause: error });
	}
}
async function resolveApiKey(authContext, apiKey, model, credential) {
	try {
		return await apiKey.resolve({
			model,
			ctx: authContext,
			credential
		});
	} catch (error) {
		throw new ModelsError("auth", `API key auth failed for provider ${model.provider}`, { cause: error });
	}
}
async function readCredential(credentials, providerId) {
	try {
		return await credentials.read(providerId);
	} catch (error) {
		throw new ModelsError("auth", `Credential store read failed for ${providerId}`, { cause: error });
	}
}
//#endregion
//#region node_modules/@earendil-works/pi-ai/dist/models.js
var ModelsImpl = class {
	providers = /* @__PURE__ */ new Map();
	credentials;
	authContext;
	constructor(options) {
		this.credentials = options?.credentials ?? new InMemoryCredentialStore();
		this.authContext = options?.authContext ?? defaultProviderAuthContext();
	}
	setProvider(provider) {
		this.providers.set(provider.id, provider);
	}
	deleteProvider(id) {
		this.providers.delete(id);
	}
	clearProviders() {
		this.providers.clear();
	}
	getProviders() {
		return Array.from(this.providers.values());
	}
	getProvider(id) {
		return this.providers.get(id);
	}
	getModels(provider) {
		if (provider !== void 0) {
			const entry = this.providers.get(provider);
			if (!entry) return [];
			try {
				return entry.getModels();
			} catch {
				return [];
			}
		}
		const models = [];
		for (const entry of this.providers.values()) try {
			models.push(...entry.getModels());
		} catch {}
		return models;
	}
	getModel(provider, id) {
		return this.getModels(provider).find((model) => model.id === id);
	}
	async refresh(provider) {
		if (provider !== void 0) {
			const entry = this.providers.get(provider);
			if (!entry?.refreshModels) return;
			try {
				await entry.refreshModels();
			} catch (error) {
				if (error instanceof ModelsError) throw error;
				throw new ModelsError("model_source", `Model refresh failed for ${provider}`, { cause: error });
			}
			return;
		}
		await Promise.allSettled(Array.from(this.providers.values(), async (entry) => entry.refreshModels?.()));
	}
	async getAuth(model) {
		const provider = this.providers.get(model.provider);
		if (!provider) return void 0;
		return resolveProviderAuth(provider, model, this.credentials, this.authContext);
	}
	requireProvider(model) {
		const provider = this.providers.get(model.provider);
		if (!provider) throw new ModelsError("provider", `Unknown provider: ${model.provider}`);
		return provider;
	}
	async applyAuth(model, options) {
		const resolution = await resolveProviderAuth(this.requireProvider(model), model, this.credentials, this.authContext, {
			apiKey: options?.apiKey,
			env: options?.env
		});
		const auth = resolution?.auth;
		if (!auth) return {
			requestModel: model,
			requestOptions: options
		};
		const requestModel = auth.baseUrl ? {
			...model,
			baseUrl: auth.baseUrl
		} : model;
		const apiKey = options?.apiKey ?? auth.apiKey;
		const headers = auth.headers || options?.headers ? {
			...auth.headers,
			...options?.headers
		} : void 0;
		const env = resolution.env || options?.env ? {
			...resolution.env ?? {},
			...options?.env ?? {}
		} : void 0;
		return {
			requestModel,
			requestOptions: {
				...options,
				apiKey,
				headers,
				env
			}
		};
	}
	stream(model, context, options) {
		return lazyStream(model, async () => {
			const provider = this.requireProvider(model);
			const { requestModel, requestOptions } = await this.applyAuth(model, options);
			return provider.stream(requestModel, context, requestOptions);
		});
	}
	async complete(model, context, options) {
		return this.stream(model, context, options).result();
	}
	streamSimple(model, context, options) {
		return lazyStream(model, async () => {
			const provider = this.requireProvider(model);
			const { requestModel, requestOptions } = await this.applyAuth(model, options);
			return provider.streamSimple(requestModel, context, requestOptions);
		});
	}
	async completeSimple(model, context, options) {
		return this.streamSimple(model, context, options).result();
	}
};
function createModels(options) {
	return new ModelsImpl(options);
}
/**
* Builds a provider from parts. Built-in provider factories and models.json
* custom providers both go through this. A single `api` streams all models;
* an `api` map dispatches on `model.api`, and a model whose api has no entry
* produces a stream error.
*/
function createProvider(input) {
	let models = input.models;
	let inflightRefresh;
	const refreshModels = input.refreshModels;
	const single = typeof input.api.stream === "function" ? input.api : void 0;
	const byApi = single ? void 0 : input.api;
	const apiFor = (model) => single ?? byApi?.[model.api];
	const dispatch = (model, run) => {
		const streams = apiFor(model);
		if (!streams) return lazyStream(model, async () => {
			throw new ModelsError("stream", `Provider ${input.id} has no API implementation for "${model.api}"`);
		});
		return run(streams);
	};
	return {
		id: input.id,
		name: input.name ?? input.id,
		baseUrl: input.baseUrl,
		headers: input.headers,
		auth: input.auth,
		getModels: () => models,
		refreshModels: refreshModels ? () => {
			inflightRefresh ??= (async () => {
				try {
					models = await refreshModels();
				} finally {
					inflightRefresh = void 0;
				}
			})();
			return inflightRefresh;
		} : void 0,
		stream: (model, context, options) => dispatch(model, (streams) => streams.stream(model, context, options)),
		streamSimple: (model, context, options) => dispatch(model, (streams) => streams.streamSimple(model, context, options))
	};
}
function calculateCost(model, usage) {
	const longWrite = usage.cacheWrite1h ?? 0;
	const shortWrite = usage.cacheWrite - longWrite;
	usage.cost.input = model.cost.input / 1e6 * usage.input;
	usage.cost.output = model.cost.output / 1e6 * usage.output;
	usage.cost.cacheRead = model.cost.cacheRead / 1e6 * usage.cacheRead;
	usage.cost.cacheWrite = (model.cost.cacheWrite * shortWrite + model.cost.input * 2 * longWrite) / 1e6;
	usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
	return usage.cost;
}
var EXTENDED_THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh"
];
function getSupportedThinkingLevels(model) {
	if (!model.reasoning) return ["off"];
	return EXTENDED_THINKING_LEVELS.filter((level) => {
		const mapped = model.thinkingLevelMap?.[level];
		if (mapped === null) return false;
		if (level === "xhigh") return mapped !== void 0;
		return true;
	});
}
function clampThinkingLevel(model, level) {
	const availableLevels = getSupportedThinkingLevels(model);
	if (availableLevels.includes(level)) return level;
	const requestedIndex = EXTENDED_THINKING_LEVELS.indexOf(level);
	if (requestedIndex === -1) return availableLevels[0] ?? "off";
	for (let i = requestedIndex; i < EXTENDED_THINKING_LEVELS.length; i++) {
		const candidate = EXTENDED_THINKING_LEVELS[i];
		if (availableLevels.includes(candidate)) return candidate;
	}
	for (let i = requestedIndex - 1; i >= 0; i--) {
		const candidate = EXTENDED_THINKING_LEVELS[i];
		if (availableLevels.includes(candidate)) return candidate;
	}
	return availableLevels[0] ?? "off";
}
//#endregion
//#region node_modules/@earendil-works/pi-ai/dist/utils/estimate.js
var CHARS_PER_TOKEN = 4;
var ESTIMATED_IMAGE_CHARS = 4800;
function calculateContextTokens(usage) {
	return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}
function safeJsonStringify(value) {
	try {
		return JSON.stringify(value) ?? "undefined";
	} catch {
		return "[unserializable]";
	}
}
function estimateTextAndImageContentChars(content) {
	if (typeof content === "string") return content.length;
	let chars = 0;
	for (const block of content) chars += block.type === "text" ? block.text.length : ESTIMATED_IMAGE_CHARS;
	return chars;
}
function estimateTextTokens(text) {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}
function estimateTextAndImageContentTokens(content) {
	return Math.ceil(estimateTextAndImageContentChars(content) / CHARS_PER_TOKEN);
}
function estimateMessageTokens(message) {
	let chars = 0;
	if (message.role === "user") return estimateTextAndImageContentTokens(message.content);
	if (message.role === "toolResult") return estimateTextAndImageContentTokens(message.content);
	for (const block of message.content) if (block.type === "text") chars += block.text.length;
	else if (block.type === "thinking") chars += block.thinking.length;
	else chars += block.name.length + safeJsonStringify(block.arguments).length;
	return Math.ceil(chars / CHARS_PER_TOKEN);
}
function getLastAssistantUsageInfo(messages) {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role !== "assistant") continue;
		const assistant = message;
		if (assistant.stopReason === "aborted" || assistant.stopReason === "error") continue;
		if (calculateContextTokens(assistant.usage) > 0) return {
			usage: assistant.usage,
			index: i
		};
	}
}
function estimateMessages(messages) {
	const usageInfo = getLastAssistantUsageInfo(messages);
	if (usageInfo) {
		const usageTokens = calculateContextTokens(usageInfo.usage);
		let trailingTokens = 0;
		for (let i = usageInfo.index + 1; i < messages.length; i++) trailingTokens += estimateMessageTokens(messages[i]);
		return {
			tokens: usageTokens + trailingTokens,
			usageTokens,
			trailingTokens,
			lastUsageIndex: usageInfo.index
		};
	}
	let tokens = 0;
	for (const message of messages) tokens += estimateMessageTokens(message);
	return {
		tokens,
		usageTokens: 0,
		trailingTokens: tokens,
		lastUsageIndex: null
	};
}
function isMessageArray(value) {
	return Array.isArray(value);
}
function estimateContextTokens(context) {
	if (isMessageArray(context)) return estimateMessages(context);
	const estimate = estimateMessages(context.messages);
	if (estimate.lastUsageIndex !== null) return estimate;
	let prefixTokens = context.systemPrompt ? estimateTextTokens(context.systemPrompt) : 0;
	if (context.tools && context.tools.length > 0) prefixTokens += estimateTextTokens(safeJsonStringify(context.tools));
	return {
		tokens: estimate.tokens + prefixTokens,
		usageTokens: estimate.usageTokens,
		trailingTokens: estimate.trailingTokens + prefixTokens,
		lastUsageIndex: estimate.lastUsageIndex
	};
}
//#endregion
//#region node_modules/@earendil-works/pi-ai/dist/api/simple-options.js
var CONTEXT_SAFETY_TOKENS = 4096;
var MIN_MAX_TOKENS = 1;
function clampMaxTokensToContext(model, context, maxTokens) {
	if (model.contextWindow <= 0) return Math.max(MIN_MAX_TOKENS, maxTokens);
	const available = model.contextWindow - estimateContextTokens(context).tokens - CONTEXT_SAFETY_TOKENS;
	return Math.min(maxTokens, Math.max(MIN_MAX_TOKENS, available));
}
function buildBaseOptions(model, context, options, apiKey) {
	return {
		temperature: options?.temperature,
		maxTokens: clampMaxTokensToContext(model, context, options?.maxTokens ?? model.maxTokens),
		signal: options?.signal,
		apiKey: apiKey || options?.apiKey,
		transport: options?.transport,
		cacheRetention: options?.cacheRetention,
		sessionId: options?.sessionId,
		headers: options?.headers,
		onPayload: options?.onPayload,
		onResponse: options?.onResponse,
		timeoutMs: options?.timeoutMs,
		websocketConnectTimeoutMs: options?.websocketConnectTimeoutMs,
		maxRetries: options?.maxRetries,
		maxRetryDelayMs: options?.maxRetryDelayMs,
		metadata: options?.metadata,
		env: options?.env
	};
}
function clampReasoning(effort) {
	return effort === "xhigh" ? "high" : effort;
}
function adjustMaxTokensForThinking(baseMaxTokens, modelMaxTokens, reasoningLevel, customBudgets) {
	const budgets = {
		minimal: 1024,
		low: 2048,
		medium: 8192,
		high: 16384,
		...customBudgets
	};
	const minOutputTokens = 1024;
	let thinkingBudget = budgets[clampReasoning(reasoningLevel)];
	const maxTokens = baseMaxTokens === void 0 ? modelMaxTokens : Math.min(baseMaxTokens + thinkingBudget, modelMaxTokens);
	if (maxTokens <= thinkingBudget) thinkingBudget = Math.max(0, maxTokens - minOutputTokens);
	return {
		maxTokens,
		thinkingBudget
	};
}
//#endregion
//#region node_modules/@earendil-works/pi-ai/dist/api/transform-messages.js
var NON_VISION_USER_IMAGE_PLACEHOLDER = "(image omitted: model does not support images)";
var NON_VISION_TOOL_IMAGE_PLACEHOLDER = "(tool image omitted: model does not support images)";
function replaceImagesWithPlaceholder(content, placeholder) {
	const result = [];
	let previousWasPlaceholder = false;
	for (const block of content) {
		if (block.type === "image") {
			if (!previousWasPlaceholder) result.push({
				type: "text",
				text: placeholder
			});
			previousWasPlaceholder = true;
			continue;
		}
		result.push(block);
		previousWasPlaceholder = block.text === placeholder;
	}
	return result;
}
function downgradeUnsupportedImages(messages, model) {
	if (model.input.includes("image")) return messages;
	return messages.map((msg) => {
		if (msg.role === "user" && Array.isArray(msg.content)) return {
			...msg,
			content: replaceImagesWithPlaceholder(msg.content, NON_VISION_USER_IMAGE_PLACEHOLDER)
		};
		if (msg.role === "toolResult") return {
			...msg,
			content: replaceImagesWithPlaceholder(msg.content, NON_VISION_TOOL_IMAGE_PLACEHOLDER)
		};
		return msg;
	});
}
/**
* Normalize tool call ID for cross-provider compatibility.
* OpenAI Responses API generates IDs that are 450+ chars with special characters like `|`.
* Anthropic APIs require IDs matching ^[a-zA-Z0-9_-]+$ (max 64 chars).
*/
function transformMessages(messages, model, normalizeToolCallId) {
	const toolCallIdMap = /* @__PURE__ */ new Map();
	const transformed = downgradeUnsupportedImages(messages, model).map((msg) => {
		if (msg.role === "user") return msg;
		if (msg.role === "toolResult") {
			const normalizedId = toolCallIdMap.get(msg.toolCallId);
			if (normalizedId && normalizedId !== msg.toolCallId) return {
				...msg,
				toolCallId: normalizedId
			};
			return msg;
		}
		if (msg.role === "assistant") {
			const assistantMsg = msg;
			const isSameModel = assistantMsg.provider === model.provider && assistantMsg.api === model.api && assistantMsg.model === model.id;
			const transformedContent = assistantMsg.content.flatMap((block) => {
				if (block.type === "thinking") {
					if (block.redacted) return isSameModel ? block : [];
					if (isSameModel && block.thinkingSignature) return block;
					if (!block.thinking || block.thinking.trim() === "") return [];
					if (isSameModel) return block;
					return {
						type: "text",
						text: block.thinking
					};
				}
				if (block.type === "text") {
					if (isSameModel) return block;
					return {
						type: "text",
						text: block.text
					};
				}
				if (block.type === "toolCall") {
					const toolCall = block;
					let normalizedToolCall = toolCall;
					if (!isSameModel && toolCall.thoughtSignature) {
						normalizedToolCall = { ...toolCall };
						delete normalizedToolCall.thoughtSignature;
					}
					if (!isSameModel && normalizeToolCallId) {
						const normalizedId = normalizeToolCallId(toolCall.id, model, assistantMsg);
						if (normalizedId !== toolCall.id) {
							toolCallIdMap.set(toolCall.id, normalizedId);
							normalizedToolCall = {
								...normalizedToolCall,
								id: normalizedId
							};
						}
					}
					return normalizedToolCall;
				}
				return block;
			});
			return {
				...assistantMsg,
				content: transformedContent
			};
		}
		return msg;
	});
	const result = [];
	let pendingToolCalls = [];
	let existingToolResultIds = /* @__PURE__ */ new Set();
	const insertSyntheticToolResults = () => {
		if (pendingToolCalls.length > 0) {
			for (const tc of pendingToolCalls) if (!existingToolResultIds.has(tc.id)) result.push({
				role: "toolResult",
				toolCallId: tc.id,
				toolName: tc.name,
				content: [{
					type: "text",
					text: "No result provided"
				}],
				isError: true,
				timestamp: Date.now()
			});
			pendingToolCalls = [];
			existingToolResultIds = /* @__PURE__ */ new Set();
		}
	};
	for (let i = 0; i < transformed.length; i++) {
		const msg = transformed[i];
		if (msg.role === "assistant") {
			insertSyntheticToolResults();
			const assistantMsg = msg;
			if (assistantMsg.stopReason === "error" || assistantMsg.stopReason === "aborted") continue;
			const toolCalls = assistantMsg.content.filter((b) => b.type === "toolCall");
			if (toolCalls.length > 0) {
				pendingToolCalls = toolCalls;
				existingToolResultIds = /* @__PURE__ */ new Set();
			}
			result.push(msg);
		} else if (msg.role === "toolResult") {
			existingToolResultIds.add(msg.toolCallId);
			result.push(msg);
		} else if (msg.role === "user") {
			insertSyntheticToolResults();
			result.push(msg);
		} else result.push(msg);
	}
	insertSyntheticToolResults();
	return result;
}
//#endregion
export { calculateCost as a, createProvider as c, createAssistantMessageEventStream as d, clampMaxTokensToContext as i, lazyApi as l, adjustMaxTokensForThinking as n, clampThinkingLevel as o, buildBaseOptions as r, createModels as s, transformMessages as t, AssistantMessageEventStream as u };
