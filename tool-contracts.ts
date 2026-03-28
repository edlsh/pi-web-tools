import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import type { WebProvider } from "./providers";

export const providerSchema = Type.Optional(
	StringEnum(["exa", "jina", "tavily"] as const, {
		description:
			"Provider to use. Optional to auto-select the first configured compatible provider by priority (exa > jina > tavily).",
	}),
);

export const researchProviderSchema = Type.Optional(
	StringEnum(["exa", "tavily"] as const, {
		description:
			"Research provider to use. Optional to auto-select the first configured compatible provider by priority (exa > tavily).",
	}),
);

export const researchCheckProviderSchema = Type.Optional(
	StringEnum(["exa", "tavily"] as const, {
		description:
			"Provider that owns the research ID. Required when more than one configured provider supports research.",
	}),
);

export const exaOnlyProviderSchema = Type.Optional(
	StringEnum(["exa"] as const, {
		description: "Only Exa supports this tool.",
	}),
);

export const exaLivecrawlSchema = StringEnum(["always", "fallback", "never"] as const, {
	description: "Exa livecrawl mode.",
});

const exaSearchTypeSchema = StringEnum(["auto", "keyword", "neural"] as const, {
	description: "Exa search type.",
});

const exaSearchCategorySchema = StringEnum(
	[
		"company",
		"research paper",
		"news",
		"pdf",
		"github",
		"tweet",
		"movie",
		"song",
		"personal site",
		"linkedin profile",
	] as const,
	{ description: "Exa result category filter." },
);

const exaExtrasSchema = Type.Object(
	{
		links: Type.Optional(Type.Boolean({ description: "Ask Exa to extract page links." })),
		imageLinks: Type.Optional(Type.Boolean({ description: "Ask Exa to extract image URLs." })),
	},
	{ additionalProperties: false },
);

export const exaSearchSchema = Type.Object(
	{
		type: Type.Optional(exaSearchTypeSchema),
		category: Type.Optional(exaSearchCategorySchema),
		includeDomains: Type.Optional(Type.Array(Type.String())),
		excludeDomains: Type.Optional(Type.Array(Type.String())),
		startPublishedDate: Type.Optional(Type.String({ description: "ISO date, e.g. 2026-03-01" })),
		endPublishedDate: Type.Optional(Type.String({ description: "ISO date, e.g. 2026-03-31" })),
		useAutoprompt: Type.Optional(Type.Boolean()),
		contents: Type.Optional(Type.Boolean({ description: "Include page contents in results." })),
		highlights: Type.Optional(Type.Boolean({ description: "Include Exa highlights." })),
		summary: Type.Optional(Type.Boolean({ description: "Include Exa summaries." })),
		livecrawl: Type.Optional(exaLivecrawlSchema),
		livecrawlTimeout: Type.Optional(Type.Number({ description: "Livecrawl timeout in milliseconds." })),
		subpages: Type.Optional(Type.Number({ description: "Number of Exa subpages to crawl per result." })),
		subpageTarget: Type.Optional(Type.Array(Type.String())),
		extras: Type.Optional(exaExtrasSchema),
	},
	{ additionalProperties: false },
);

export const jinaSearchSchema = Type.Object(
	{
		count: Type.Optional(Type.Number({ description: "Jina Search result count." })),
	},
	{ additionalProperties: false },
);

export const tavilySearchSchema = Type.Object(
	{
		topic: Type.Optional(StringEnum(["general", "news", "finance"] as const, { description: "Tavily topic." })),
		timeRange: Type.Optional(
			StringEnum(["day", "week", "month", "year", "d", "w", "m", "y"] as const, {
				description: "Tavily time range.",
			}),
		),
		startDate: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
		endDate: Type.Optional(Type.String({ description: "YYYY-MM-DD" })),
		includeDomains: Type.Optional(Type.Array(Type.String())),
		excludeDomains: Type.Optional(Type.Array(Type.String())),
		country: Type.Optional(Type.String()),
		searchDepth: Type.Optional(
			StringEnum(["advanced", "basic", "fast", "ultra-fast"] as const, {
				description: "Tavily search depth.",
			}),
		),
		chunksPerSource: Type.Optional(Type.Number()),
		includeAnswer: Type.Optional(
			Type.Union([
				Type.Boolean(),
				StringEnum(["basic", "advanced"] as const, { description: "Tavily answer mode." }),
			]),
		),
		includeRawContent: Type.Optional(
			Type.Union([
				Type.Boolean(),
				StringEnum(["markdown", "text"] as const, { description: "Tavily raw content format." }),
			]),
		),
		includeImages: Type.Optional(Type.Boolean()),
		includeImageDescriptions: Type.Optional(Type.Boolean()),
		includeFavicon: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

export const exaExtractSchema = Type.Object(
	{
		highlights: Type.Optional(Type.Boolean()),
		highlightQuery: Type.Optional(Type.String()),
		summary: Type.Optional(Type.Boolean()),
		summaryQuery: Type.Optional(Type.String()),
		livecrawl: Type.Optional(exaLivecrawlSchema),
		livecrawlTimeout: Type.Optional(Type.Number()),
		subpages: Type.Optional(Type.Number()),
		subpageTarget: Type.Optional(Type.Array(Type.String())),
		extras: Type.Optional(exaExtrasSchema),
	},
	{ additionalProperties: false },
);

export const tavilyExtractSchema = Type.Object(
	{
		query: Type.Optional(Type.String()),
		chunksPerSource: Type.Optional(Type.Number()),
		extractDepth: Type.Optional(StringEnum(["basic", "advanced"] as const, { description: "Tavily extract depth." })),
		includeImages: Type.Optional(Type.Boolean()),
		includeFavicon: Type.Optional(Type.Boolean()),
		format: Type.Optional(StringEnum(["markdown", "text"] as const, { description: "Tavily content format." })),
		timeout: Type.Optional(Type.Number({ description: "Tavily provider-side timeout in seconds." })),
		includeUsage: Type.Optional(Type.Boolean()),
	},
	{ additionalProperties: false },
);

export const exaResearchSchema = Type.Object(
	{
		model: Type.Optional(Type.String({ description: "Exa research model." })),
	},
	{ additionalProperties: false },
);

export const tavilyResearchSchema = Type.Object(
	{
		model: Type.Optional(StringEnum(["mini", "pro", "auto"] as const, { description: "Tavily research model." })),
		citationFormat: Type.Optional(
			StringEnum(["numbered", "mla", "apa", "chicago"] as const, { description: "Tavily citation format." }),
		),
		outputSchema: Type.Optional(
			Type.Object({}, { additionalProperties: true, description: "JSON Schema object for Tavily structured research output." }),
		),
	},
	{ additionalProperties: false },
);

export type SearchParams = {
	provider?: WebProvider;
	query: string;
	maxResults?: number;
	persistFullOutput?: boolean;
	exa?: Record<string, unknown>;
	jina?: Record<string, unknown>;
	tavily?: Record<string, unknown>;
};

export type ExtractParams = {
	provider?: WebProvider;
	urls: string[];
	persistFullOutput?: boolean;
	exa?: Record<string, unknown>;
	tavily?: Record<string, unknown>;
};

export type ResearchStartParams = {
	provider?: WebProvider;
	query: string;
	exa?: Record<string, unknown>;
	tavily?: Record<string, unknown>;
};

export type ResearchCheckParams = {
	provider?: WebProvider;
	researchId: string;
	persistFullOutput?: boolean;
};
