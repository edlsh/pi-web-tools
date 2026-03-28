import {
	exaCodeSearch,
	exaExtract,
	exaFindSimilar,
	exaResearchCheck,
	exaResearchStart,
	exaSearch,
} from "./exa";
import { jinaExtract, jinaSearch } from "./jina";
import { validateProviderOptions, type WebProvider } from "./providers";
import { tavilyCheckResearch, tavilyExtract, tavilySearch, tavilyStartResearch } from "./tavily";
import type { ExtractParams, ResearchCheckParams, ResearchStartParams, SearchParams } from "./tool-contracts";

export type FindSimilarParams = Parameters<typeof exaFindSimilar>[0] & { provider?: WebProvider };
export type CodeSearchParams = Parameters<typeof exaCodeSearch>[0] & { provider?: WebProvider };

export function errorResult(message: string, extraDetails?: Record<string, unknown>) {
	return {
		content: [{ type: "text" as const, text: `Error: ${message}` }],
		details: { error: message, ...extraDetails },
		isError: true as const,
	};
}

export function successResult(details: Record<string, unknown>, text: string, isError = false) {
	return {
		content: [{ type: "text" as const, text }],
		details,
		...(isError ? { isError: true as const } : {}),
	};
}

export async function executeSearch(provider: WebProvider, params: SearchParams, signal?: AbortSignal) {
	validateProviderOptions(provider, { exa: params.exa, jina: params.jina, tavily: params.tavily });

	if (provider === "exa") {
		return exaSearch({
			query: params.query,
			numResults: params.maxResults,
			persistFullOutput: params.persistFullOutput,
			...(params.exa ?? {}),
			signal,
		});
	}

	if (provider === "jina") {
		return jinaSearch({
			query: params.query,
			count: (params.jina?.count as number | undefined) ?? params.maxResults,
			persistFullOutput: params.persistFullOutput,
			signal,
		});
	}

	return tavilySearch({
		query: params.query,
		maxResults: params.maxResults,
		persistFullOutput: params.persistFullOutput,
		...(params.tavily ?? {}),
		signal,
	});
}

export async function executeExtract(provider: WebProvider, params: ExtractParams, signal?: AbortSignal) {
	validateProviderOptions(provider, { exa: params.exa, tavily: params.tavily });

	if (provider === "exa") {
		return exaExtract({
			urls: params.urls,
			persistFullOutput: params.persistFullOutput,
			...(params.exa ?? {}),
			signal,
		});
	}

	if (provider === "jina") {
		return jinaExtract({
			urls: params.urls,
			persistFullOutput: params.persistFullOutput,
			signal,
		});
	}

	return tavilyExtract({
		urls: params.urls,
		persistFullOutput: params.persistFullOutput,
		...(params.tavily ?? {}),
		signal,
	});
}

export async function executeResearchStart(provider: WebProvider, params: ResearchStartParams, signal?: AbortSignal) {
	validateProviderOptions(provider, { exa: params.exa, tavily: params.tavily });

	if (provider === "exa") {
		return exaResearchStart({ query: params.query, ...(params.exa ?? {}), signal });
	}

	return tavilyStartResearch({ input: params.query, ...(params.tavily ?? {}), signal });
}

export async function executeResearchCheck(provider: WebProvider, params: ResearchCheckParams, signal?: AbortSignal) {
	if (provider === "exa") {
		return exaResearchCheck({ researchId: params.researchId, persistFullOutput: params.persistFullOutput, signal });
	}

	return tavilyCheckResearch({ researchId: params.researchId, persistFullOutput: params.persistFullOutput, signal });
}

export async function executeFindSimilar(params: FindSimilarParams, signal?: AbortSignal) {
	const { provider: _provider, ...exaParams } = params;
	return exaFindSimilar({ ...exaParams, signal });
}

export async function executeCodeSearch(params: CodeSearchParams, signal?: AbortSignal) {
	const { provider: _provider, ...exaParams } = params;
	return exaCodeSearch({ ...exaParams, signal });
}
