import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { DEFAULT_TOOL_OUTPUT_MAX_BYTES as DEFAULT_MAX_BYTES, DEFAULT_TOOL_OUTPUT_MAX_LINES as DEFAULT_MAX_LINES, defaultFormatSize as formatSize } from "./helpers";
import { getConfiguredProviders, resolveProvider } from "./providers";
import {
	exaExtractSchema,
	exaLivecrawlSchema,
	exaOnlyProviderSchema,
	exaResearchSchema,
	exaSearchSchema,
	jinaSearchSchema,
	providerSchema,
	researchCheckProviderSchema,
	researchProviderSchema,
	tavilyExtractSchema,
	tavilyResearchSchema,
	tavilySearchSchema,
	type ExtractParams,
	type ResearchCheckParams,
	type ResearchStartParams,
	type SearchParams,
} from "./tool-contracts";
import {
	errorResult,
	executeCodeSearch,
	executeExtract,
	executeFindSimilar,
	executeResearchCheck,
	executeResearchStart,
	executeSearch,
	successResult,
	type CodeSearchParams,
	type FindSimilarParams,
} from "./tool-execution";
import {
	extractRenderCall,
	findSimilarRenderCall,
	formatCount,
	providerLabel,
	renderResearchCheckResult,
	renderResearchStartResult,
	renderToolResult,
	researchRenderCall,
	searchRenderCall,
} from "./tool-rendering";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		if (getConfiguredProviders().length === 0) {
			ctx.ui.notify("Web tools: set EXA_API_KEY, JINA_API_KEY, or TAVILY_API_KEY", "warning");
		}
	});

	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: `Search the web using Exa, Jina, or Tavily. If omitted, the provider auto-selects by configured priority order (exa > jina > tavily). Output truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		parameters: Type.Object({
			provider: providerSchema,
			query: Type.String({ description: "Search query." }),
			maxResults: Type.Optional(Type.Number({ description: "Maximum results to return." })),
			persistFullOutput: Type.Optional(Type.Boolean({ description: "Persist full truncated output to a temp file." })),
			exa: Type.Optional(exaSearchSchema),
			jina: Type.Optional(jinaSearchSchema),
			tavily: Type.Optional(tavilySearchSchema),
		}),
		async execute(_toolCallId, rawParams, signal, onUpdate) {
			if (signal?.aborted) return errorResult("Cancelled");
			try {
				const params = rawParams as SearchParams;
				const provider = resolveProvider({ capability: "search", provider: params.provider });
				onUpdate?.({ content: [{ type: "text", text: `Searching the web with ${providerLabel(provider)}...` }] });
				const result = await executeSearch(provider, params, signal);
				return successResult(result.details as Record<string, unknown>, result.text);
			} catch (error) {
				return errorResult(errorMessage(error));
			}
		},
		renderCall(args, theme) {
			return searchRenderCall(args as Record<string, unknown>, theme, "web_search");
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme, {
				partialLabel: "Searching...",
				summary: (details) => `${providerLabel(details.provider)}: ${formatCount(Number(details.resultCount ?? 0), "result")}`,
			});
		},
	});

	pi.registerTool({
		name: "web_extract",
		label: "Web Extract",
		description: `Extract readable content from one or more URLs using Exa, Jina, or Tavily. If omitted, the provider auto-selects by configured priority order (exa > jina > tavily). Jina fans out one request per URL because Reader is single-URL. Output truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		parameters: Type.Object({
			provider: providerSchema,
			urls: Type.Array(Type.String(), { description: "URLs to extract." }),
			persistFullOutput: Type.Optional(Type.Boolean({ description: "Persist full truncated output to a temp file." })),
			exa: Type.Optional(exaExtractSchema),
			tavily: Type.Optional(tavilyExtractSchema),
		}),
		async execute(_toolCallId, rawParams, signal, onUpdate) {
			if (signal?.aborted) return errorResult("Cancelled");
			try {
				const params = rawParams as ExtractParams;
				const provider = resolveProvider({ capability: "extract", provider: params.provider });
				onUpdate?.({ content: [{ type: "text", text: `Extracting URLs with ${providerLabel(provider)}...` }] });
				const result = await executeExtract(provider, params, signal);
				return successResult(result.details as Record<string, unknown>, result.text);
			} catch (error) {
				return errorResult(errorMessage(error));
			}
		},
		renderCall(args, theme) {
			return extractRenderCall(args as Record<string, unknown>, theme);
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme, {
				partialLabel: "Extracting...",
				summary: (details) =>
					`${providerLabel(details.provider)}: ${details.fetchedCount ?? 0}/${details.urlCount ?? 0} ${Number(details.urlCount ?? 0) === 1 ? "page" : "pages"} fetched${details.failedCount ? `, ${details.failedCount} failed` : ""}`,
			});
		},
	});

	pi.registerTool({
		name: "web_research_start",
		label: "Web Research Start",
		description: "Start an asynchronous research task with Exa or Tavily. If omitted, the provider auto-selects by configured priority order (exa > tavily).",
		parameters: Type.Object({
			provider: researchProviderSchema,
			query: Type.String({ description: "Research question or investigation prompt." }),
			exa: Type.Optional(exaResearchSchema),
			tavily: Type.Optional(tavilyResearchSchema),
		}),
		async execute(_toolCallId, rawParams, signal, onUpdate) {
			if (signal?.aborted) return errorResult("Cancelled");
			try {
				const params = rawParams as ResearchStartParams;
				const provider = resolveProvider({ capability: "research", provider: params.provider });
				onUpdate?.({ content: [{ type: "text", text: `Starting research with ${providerLabel(provider)}...` }] });
				const result = await executeResearchStart(provider, params, signal);
				return successResult(result.details as Record<string, unknown>, result.text, result.isError);
			} catch (error) {
				return errorResult(errorMessage(error));
			}
		},
		renderCall(args, theme) {
			return researchRenderCall(args as Record<string, unknown>, theme, "web_research_start", "query");
		},
		renderResult(result, options, theme) {
			return renderResearchStartResult(result, options, theme);
		},
	});

	pi.registerTool({
		name: "web_research_check",
		label: "Web Research Check",
		description: `Check the status of an asynchronous Exa or Tavily research task. If multiple research providers are configured, provider must be explicit because research IDs are provider-specific. Output truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		parameters: Type.Object({
			provider: researchCheckProviderSchema,
			researchId: Type.String({ description: "Research request ID." }),
			persistFullOutput: Type.Optional(Type.Boolean({ description: "Persist full truncated output to a temp file." })),
		}),
		async execute(_toolCallId, rawParams, signal, onUpdate) {
			if (signal?.aborted) return errorResult("Cancelled");
			try {
				const params = rawParams as ResearchCheckParams;
				const provider = resolveProvider({
					capability: "research",
					provider: params.provider,
					requireExplicitWhenMultiple: true,
				});
				onUpdate?.({ content: [{ type: "text", text: `Checking research with ${providerLabel(provider)}...` }] });
				const result = await executeResearchCheck(provider, params, signal);
				return successResult(result.details as Record<string, unknown>, result.text, result.isError);
			} catch (error) {
				return errorResult(errorMessage(error));
			}
		},
		renderCall(args, theme) {
			return researchRenderCall(args as Record<string, unknown>, theme, "web_research_check", "researchId");
		},
		renderResult(result, options, theme) {
			return renderResearchCheckResult(result, options, theme);
		},
	});

	pi.registerTool({
		name: "web_find_similar",
		label: "Web Find Similar",
		description: `Find pages similar to a source URL using Exa. Output truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		parameters: Type.Object({
			provider: exaOnlyProviderSchema,
			url: Type.String({ description: "Source URL." }),
			numResults: Type.Optional(Type.Number({ description: "Maximum results." })),
			includeDomains: Type.Optional(Type.Array(Type.String())),
			excludeDomains: Type.Optional(Type.Array(Type.String())),
			excludeSourceDomain: Type.Optional(Type.Boolean()),
			contents: Type.Optional(Type.Boolean()),
			livecrawl: Type.Optional(exaLivecrawlSchema),
			persistFullOutput: Type.Optional(Type.Boolean({ description: "Persist full truncated output to a temp file." })),
		}),
		async execute(_toolCallId, rawParams, signal, onUpdate) {
			if (signal?.aborted) return errorResult("Cancelled");
			try {
				const params = rawParams as FindSimilarParams;
				resolveProvider({ capability: "findSimilar", provider: params.provider });
				onUpdate?.({ content: [{ type: "text", text: "Finding similar pages with Exa..." }] });
				const result = await executeFindSimilar(params, signal);
				return successResult(result.details as Record<string, unknown>, result.text);
			} catch (error) {
				return errorResult(errorMessage(error));
			}
		},
		renderCall(args, theme) {
			return findSimilarRenderCall(args as Record<string, unknown>, theme);
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme, {
				partialLabel: "Finding similar...",
				summary: (details) => `${providerLabel(details.provider)}: ${formatCount(Number(details.resultCount ?? 0), "similar page")}`,
			});
		},
	});

	pi.registerTool({
		name: "web_code_search",
		label: "Web Code Search",
		description: `Search code and docs with Exa's GitHub-focused search. Output truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		parameters: Type.Object({
			provider: exaOnlyProviderSchema,
			query: Type.String({ description: "Code or docs search query." }),
			numResults: Type.Optional(Type.Number({ description: "Maximum results." })),
			livecrawl: Type.Optional(exaLivecrawlSchema),
			persistFullOutput: Type.Optional(Type.Boolean({ description: "Persist full truncated output to a temp file." })),
		}),
		async execute(_toolCallId, rawParams, signal, onUpdate) {
			if (signal?.aborted) return errorResult("Cancelled");
			try {
				const params = rawParams as CodeSearchParams;
				resolveProvider({ capability: "codeSearch", provider: params.provider });
				onUpdate?.({ content: [{ type: "text", text: "Searching code with Exa..." }] });
				const result = await executeCodeSearch(params, signal);
				return successResult(result.details as Record<string, unknown>, result.text);
			} catch (error) {
				return errorResult(errorMessage(error));
			}
		},
		renderCall(args, theme) {
			return searchRenderCall(args as Record<string, unknown>, theme, "web_code_search");
		},
		renderResult(result, options, theme) {
			return renderToolResult(result, options, theme, {
				partialLabel: "Searching code...",
				summary: (details) => `${providerLabel(details.provider)}: ${formatCount(Number(details.resultCount ?? 0), "code result")}`,
			});
		},
	});
}
