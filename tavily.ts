import { formatToolOutput, readJsonResponse, withRequestTimeout } from "./helpers";
import { buildInlinePreviews, previewTitleFromUrl } from "./previews";
import { getProviderApiKey } from "./providers";
import type {
  WebExtractResultDetails,
  WebResearchCheckDetails,
  WebResearchStartDetails,
  WebResultItem,
  WebSearchResultDetails,
} from "./types";

const TAVILY_API_BASE = "https://api.tavily.com";
const DEFAULT_TIMEOUT_MS = 30_000;

type TavilySearchDepth = "advanced" | "basic" | "fast" | "ultra-fast";
type TavilyAnswerMode = boolean | "basic" | "advanced";
type TavilyRawContentMode = boolean | "markdown" | "text";
type TavilyExtractDepth = "basic" | "advanced";
type TavilyContentFormat = "markdown" | "text";
type TavilyResearchModel = "mini" | "pro" | "auto";
type TavilyCitationFormat = "numbered" | "mla" | "apa" | "chicago";
type TavilyResearchStatus = "pending" | "in_progress" | "completed" | "failed" | "canceled";

export interface TavilySearchOptions {
  query: string;
  maxResults?: number;
  topic?: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year" | "d" | "w" | "m" | "y";
  startDate?: string;
  endDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  country?: string;
  searchDepth?: TavilySearchDepth;
  chunksPerSource?: number;
  includeAnswer?: TavilyAnswerMode;
  includeRawContent?: TavilyRawContentMode;
  includeImages?: boolean;
  includeImageDescriptions?: boolean;
  includeFavicon?: boolean;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  persistFullOutput?: boolean;
}

export interface TavilyExtractOptions {
  urls: string | string[];
  query?: string;
  chunksPerSource?: number;
  extractDepth?: TavilyExtractDepth;
  includeImages?: boolean;
  includeFavicon?: boolean;
  format?: TavilyContentFormat;
  timeout?: number;
  includeUsage?: boolean;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  persistFullOutput?: boolean;
}

export interface TavilyResearchStartOptions {
  input: string;
  model?: TavilyResearchModel;
  citationFormat?: TavilyCitationFormat;
  outputSchema?: Record<string, unknown>;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface TavilyResearchCheckOptions {
  researchId: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  persistFullOutput?: boolean;
}

interface TavilySearchImage {
  url?: string;
  description?: string;
}

interface TavilySearchResultResponseItem {
  title?: string;
  url: string;
  content?: string;
  raw_content?: string;
  published_date?: string;
  score?: number;
  favicon?: string;
  images?: Array<string | TavilySearchImage>;
}

interface TavilySearchResponse {
  query?: string;
  answer?: string;
  response_time?: number;
  images?: Array<string | TavilySearchImage>;
  results: TavilySearchResultResponseItem[];
}

interface TavilyExtractResponseItem {
  url: string;
  raw_content?: string;
  images?: string[];
  favicon?: string;
}

interface TavilyExtractFailure {
  url: string;
  error: string;
}

interface TavilyExtractResponse {
  results: TavilyExtractResponseItem[];
  failed_results?: TavilyExtractFailure[];
  response_time?: number;
  request_id?: string;
  usage?: Record<string, unknown>;
}

interface TavilyResearchStartResponse {
  request_id: string;
  created_at?: string;
  status: TavilyResearchStatus;
  input?: string;
  model?: TavilyResearchModel;
  response_time?: number;
  error?: string;
}

interface TavilyResearchPendingResponse {
  request_id: string;
  status: "pending" | "in_progress";
  response_time?: number;
}

interface TavilyResearchSource {
  title?: string;
  url: string;
  favicon?: string;
}

interface TavilyResearchCompletedResponse {
  request_id: string;
  created_at?: string;
  status: "completed";
  content: string | Record<string, unknown>;
  sources: TavilyResearchSource[];
  response_time?: number;
}

interface TavilyResearchFailedResponse {
  request_id: string;
  status: "failed" | "canceled";
  response_time?: number;
  error?: string;
}

export async function tavilySearch(
  options: TavilySearchOptions,
): Promise<{ text: string; details: WebSearchResultDetails }> {
  const response = await tavilyPost<TavilySearchResponse>(
    "/search",
    {
      query: options.query,
      max_results: options.maxResults,
      topic: options.topic,
      time_range: options.timeRange,
      start_date: options.startDate,
      end_date: options.endDate,
      include_domains: options.includeDomains,
      exclude_domains: options.excludeDomains,
      country: options.country,
      search_depth: options.searchDepth,
      chunks_per_source: options.chunksPerSource,
      include_answer: options.includeAnswer,
      include_raw_content: options.includeRawContent,
      include_images: options.includeImages,
      include_image_descriptions: options.includeImageDescriptions,
      include_favicon: options.includeFavicon,
    },
    options.signal,
    options.timeoutMs,
    options.env,
  );

  if (!Array.isArray(response.results)) {
    throw new Error("Tavily returned unexpected search response shape.");
  }

  const resultItems = response.results.map(toSearchResultItem);
  const rendered = renderSearchText(resultItems, response.answer, response.images);
  const formatted = formatToolOutput(rendered, {
    maxLines: options.maxOutputLines,
    maxBytes: options.maxOutputBytes,
    persistFullOutput: options.persistFullOutput,
  });

  return {
    text: formatted.output,
    details: {
      provider: "tavily",
      resultCount: resultItems.length,
      truncated: formatted.truncated,
      truncation: formatted.truncation,
      fullOutputPath: formatted.fullOutputPath,
      previews: buildInlinePreviews(resultItems),
      providerMeta: {
        query: response.query ?? options.query,
        answer: response.answer,
        responseTime: response.response_time,
        imageCount: normalizeImageList(response.images).length,
      },
    },
  };
}

export async function tavilyExtract(
  options: TavilyExtractOptions,
): Promise<{ text: string; details: WebExtractResultDetails }> {
  const urls = Array.isArray(options.urls) ? options.urls : [options.urls];
  const response = await tavilyPost<TavilyExtractResponse>(
    "/extract",
    {
      urls,
      query: options.query,
      chunks_per_source: options.chunksPerSource,
      extract_depth: options.extractDepth,
      include_images: options.includeImages,
      include_favicon: options.includeFavicon,
      format: options.format,
      timeout: options.timeout,
      include_usage: options.includeUsage,
    },
    options.signal,
    options.timeoutMs,
    options.env,
  );

  if (!Array.isArray(response.results)) {
    throw new Error("Tavily returned unexpected extract response shape.");
  }

  if (response.results.length === 0 && (response.failed_results?.length ?? 0) > 0) {
    throw new Error([
      "Tavily extract failed for all requested URLs.",
      ...response.failed_results!.map((entry) => `- ${entry.url}: ${entry.error}`),
    ].join("\n"));
  }

  const previewItems = response.results.map(toExtractResultItem);
  const rendered = renderExtractText(response.results, response.failed_results ?? []);
  const formatted = formatToolOutput(rendered, {
    maxLines: options.maxOutputLines,
    maxBytes: options.maxOutputBytes,
    persistFullOutput: options.persistFullOutput,
  });

  return {
    text: formatted.output,
    details: {
      provider: "tavily",
      urlCount: urls.length,
      fetchedCount: response.results.length,
      failedCount: response.failed_results?.length,
      truncated: formatted.truncated,
      truncation: formatted.truncation,
      fullOutputPath: formatted.fullOutputPath,
      previews: buildInlinePreviews(previewItems),
      providerMeta: {
        requestId: response.request_id,
        responseTime: response.response_time,
        usage: response.usage,
        failedResults: response.failed_results,
      },
    },
  };
}

export async function tavilyStartResearch(
  options: TavilyResearchStartOptions,
): Promise<{ text: string; details: WebResearchStartDetails; isError?: boolean }> {
  const response = await tavilyPost<TavilyResearchStartResponse>(
    "/research",
    {
      input: options.input,
      model: options.model,
      citation_format: options.citationFormat,
      output_schema: options.outputSchema,
    },
    options.signal,
    options.timeoutMs,
    options.env,
  );

  if (response.status === "failed" || response.status === "canceled") {
    const error = response.error ?? (response.status === "canceled" ? "Research was canceled." : "Tavily research failed.");
    return {
      text: [
        "Tavily research failed.",
        `Request ID: ${response.request_id}`,
        `Status: ${response.status}`,
        `Error: ${error}`,
      ].join("\n"),
      details: {
        provider: "tavily",
        researchId: response.request_id,
        status: response.status,
        model: response.model,
        error,
      },
      isError: true,
    };
  }

  return {
    text: [
      "Research queued with Tavily.",
      `Request ID: ${response.request_id}`,
      `Status: ${response.status}`,
      response.model ? `Model: ${response.model}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    details: {
      provider: "tavily",
      researchId: response.request_id,
      status: response.status,
      model: response.model,
    },
  };
}

export async function tavilyCheckResearch(
  options: TavilyResearchCheckOptions,
): Promise<{ text: string; details: WebResearchCheckDetails; isError?: boolean }> {
  const response = await tavilyGetPendingAware(
    `/research/${encodeURIComponent(options.researchId)}`,
    options.signal,
    options.timeoutMs,
    options.env,
  );

  if (response.httpStatus === 202) {
    const pending = response.body as TavilyResearchPendingResponse;
    return {
      text: `Research is still ${pending.status}.\nRequest ID: ${pending.request_id}`,
      details: {
        provider: "tavily",
        researchId: pending.request_id,
        status: pending.status,
        complete: false,
        providerMeta: {
          responseTime: pending.response_time,
        },
      },
    };
  }

  const settled = response.body as TavilyResearchCompletedResponse | TavilyResearchFailedResponse;
  if (settled.status === "completed") {
    const text = renderResearchCompletedText(settled);
    const formatted = formatToolOutput(text, {
      maxLines: options.maxOutputLines,
      maxBytes: options.maxOutputBytes,
      persistFullOutput: options.persistFullOutput,
    });

    return {
      text: formatted.output,
      details: {
        provider: "tavily",
        researchId: settled.request_id,
        status: settled.status,
        complete: true,
        truncated: formatted.truncated,
        truncation: formatted.truncation,
        fullOutputPath: formatted.fullOutputPath,
        sources: settled.sources,
        providerMeta: {
          createdAt: settled.created_at,
          responseTime: settled.response_time,
        },
      },
    };
  }

  const errorMessage = settled.error ?? `Tavily research ${settled.status}.`;
  return {
    text: [errorMessage, `Request ID: ${settled.request_id}`].join("\n"),
    details: {
      provider: "tavily",
      researchId: settled.request_id,
      status: settled.status,
      complete: true,
      error: errorMessage,
      providerMeta: {
        responseTime: settled.response_time,
      },
    },
    isError: true,
  };
}

function getApiKey(env: NodeJS.ProcessEnv | undefined): string {
  const apiKey = getProviderApiKey("tavily", env);
  if (!apiKey) throw new Error("TAVILY_API_KEY environment variable not set");
  return apiKey;
}

async function tavilyPost<T>(
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  env?: NodeJS.ProcessEnv,
): Promise<T> {
  const timeout = withRequestTimeout(signal, timeoutMs);
  try {
    const response = await fetch(`${TAVILY_API_BASE}${path}`, {
      method: "POST",
      headers: createHeaders(env),
      body: JSON.stringify(removeUndefinedFields(body)),
      signal: timeout.signal,
    });
    return await readJsonResponse<T>(response, "Tavily");
  } finally {
    timeout.cleanup();
  }
}

async function tavilyGetPendingAware(
  path: string,
  signal?: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  env?: NodeJS.ProcessEnv,
): Promise<{
  httpStatus: number;
  body: TavilyResearchPendingResponse | TavilyResearchCompletedResponse | TavilyResearchFailedResponse;
}> {
  const timeout = withRequestTimeout(signal, timeoutMs);
  try {
    const response = await fetch(`${TAVILY_API_BASE}${path}`, {
      method: "GET",
      headers: createHeaders(env),
      signal: timeout.signal,
    });
    if (response.status === 202) {
      return {
        httpStatus: 202,
        body: (await response.json()) as TavilyResearchPendingResponse,
      };
    }

    return {
      httpStatus: response.status,
      body: await readJsonResponse<
        TavilyResearchCompletedResponse | TavilyResearchFailedResponse
      >(response, "Tavily"),
    };
  } finally {
    timeout.cleanup();
  }
}

function createHeaders(env?: NodeJS.ProcessEnv): Headers {
  return new Headers({
    Authorization: `Bearer ${getApiKey(env)}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  });
}

function renderSearchText(results: WebResultItem[], answer?: string, images?: Array<string | TavilySearchImage>): string {
  if (results.length === 0) {
    return answer ? `Answer: ${answer}\n\nNo results found.` : "No results found.";
  }

  const sections: string[] = [];
  if (answer) sections.push(`Answer: ${answer}`);

  const topImages = normalizeImageList(images);
  if (topImages.length > 0) {
    sections.push(`Images: ${renderInlineList(topImages, 3)}`);
  }

  sections.push(
    results
      .map((result, index) => {
        const lines = [`[${index + 1}] ${result.title}`, `    URL: ${result.url}`];
        if (result.publishedDate) lines.push(`    Published: ${result.publishedDate}`);
        if (result.score !== undefined) lines.push(`    Score: ${result.score.toFixed(3)}`);
        if (result.summary) lines.push(`    Summary: ${result.summary}`);
        if (result.content) lines.push(...indentBlock(result.content, "    Raw Content:"));
        if (result.providerMeta?.favicon) lines.push(`    Favicon: ${String(result.providerMeta.favicon)}`);
        const sourceImages = Array.isArray(result.providerMeta?.sourceImages)
          ? (result.providerMeta.sourceImages as string[])
          : [];
        if (sourceImages.length > 0) lines.push(`    Source Images: ${renderInlineList(sourceImages, 3)}`);
        return lines.join("\n");
      })
      .join("\n\n"),
  );

  return sections.join("\n\n");
}

function renderExtractText(results: TavilyExtractResponseItem[], failed: TavilyExtractFailure[]): string {
  const sections: string[] = [];

  if (results.length === 0) {
    sections.push("No extracted content returned.");
  } else {
    sections.push(
      results
        .map((result, index) => {
          const lines = [`[${index + 1}] ${result.url}`];
          if (result.favicon) lines.push(`    Favicon: ${result.favicon}`);
          if (result.images?.length) lines.push(`    Images: ${renderInlineList(result.images, 3)}`);
          if (result.raw_content) lines.push(...indentBlock(result.raw_content, "    Content:"));
          return lines.join("\n");
        })
        .join("\n\n"),
    );
  }

  if (failed.length > 0) {
    sections.push([
      "Failed URLs:",
      ...failed.map((entry) => `- ${entry.url} — ${entry.error}`),
    ].join("\n"));
  }

  return sections.join("\n\n");
}

function renderResearchCompletedText(response: TavilyResearchCompletedResponse): string {
  const content =
    typeof response.content === "string" ? response.content : JSON.stringify(response.content, null, 2);
  const sections = [content];

  if (response.sources.length > 0) {
    sections.push(
      [
        "Sources:",
        ...response.sources.map((source) =>
          source.title ? `- ${source.title} — ${source.url}` : `- ${source.url}`,
        ),
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}

function toSearchResultItem(result: TavilySearchResultResponseItem): WebResultItem {
  const sourceImages = normalizeImageList(result.images);
  return {
    title: result.title ?? result.url,
    url: result.url,
    publishedDate: result.published_date,
    score: result.score,
    summary: result.content,
    content: result.raw_content,
    providerMeta: removeUndefinedFields({
      favicon: result.favicon,
      sourceImages,
    }),
  };
}

function toExtractResultItem(result: TavilyExtractResponseItem): WebResultItem {
  return {
    title: previewTitleFromUrl(result.url),
    url: result.url,
    content: result.raw_content,
    imageLinks: result.images,
    providerMeta: result.favicon ? { favicon: result.favicon } : undefined,
  };
}


function normalizeImageList(images: Array<string | TavilySearchImage> | undefined): string[] {
  if (!images?.length) return [];
  return images
    .map((image) => (typeof image === "string" ? image : image.url))
    .filter((image): image is string => typeof image === "string" && image.length > 0);
}

function renderInlineList(values: string[], visibleCount: number): string {
  const shown = values.slice(0, visibleCount).join(", ");
  const remaining = values.length - visibleCount;
  return remaining > 0 ? `${shown} (+${remaining} more)` : shown;
}

function indentBlock(text: string, heading: string): string[] {
  return [heading, ...text.split("\n").map((line) => `      ${line}`)];
}

function removeUndefinedFields<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
