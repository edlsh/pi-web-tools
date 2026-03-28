import { formatToolOutput, readJsonResponse, withRequestTimeout } from "./helpers";
import { buildInlinePreviews } from "./previews";
import { getProviderApiKey } from "./providers";
import type {
  WebExtractResultDetails,
  WebResearchCheckDetails,
  WebResearchStartDetails,
  WebResultItem,
  WebSearchResultDetails,
} from "./types";

const EXA_API_BASE = "https://api.exa.ai";
const EXA_PROVIDER = "exa" as const;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS = 100;
const MAX_SUBPAGES = 10;
const CODE_SEARCH_MAX_RESULTS = 50;

type ExaRequestMethod = "GET" | "POST";
export type ExaSearchType = "auto" | "keyword" | "neural";
export type ExaSearchCategory =
  | "company"
  | "research paper"
  | "news"
  | "pdf"
  | "github"
  | "tweet"
  | "movie"
  | "song"
  | "personal site"
  | "linkedin profile";
export type ExaLivecrawlMode = "always" | "fallback" | "never";

export interface ExaExtrasOptions {
  links?: boolean;
  imageLinks?: boolean;
}

export interface ExaSearchOptions {
  query: string;
  numResults?: number;
  type?: ExaSearchType;
  category?: ExaSearchCategory;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  useAutoprompt?: boolean;
  contents?: boolean;
  highlights?: boolean;
  summary?: boolean;
  livecrawl?: ExaLivecrawlMode;
  livecrawlTimeout?: number;
  subpages?: number;
  subpageTarget?: string[];
  extras?: ExaExtrasOptions;
  persistFullOutput?: boolean;
  timeoutMs?: number;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ExaExtractOptions {
  urls: string[];
  highlights?: boolean;
  highlightQuery?: string;
  summary?: boolean;
  summaryQuery?: string;
  livecrawl?: ExaLivecrawlMode;
  livecrawlTimeout?: number;
  subpages?: number;
  subpageTarget?: string[];
  extras?: ExaExtrasOptions;
  persistFullOutput?: boolean;
  timeoutMs?: number;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ExaFindSimilarOptions {
  url: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  excludeSourceDomain?: boolean;
  contents?: boolean;
  livecrawl?: ExaLivecrawlMode;
  persistFullOutput?: boolean;
  timeoutMs?: number;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ExaCodeSearchOptions {
  query: string;
  numResults?: number;
  type?: ExaSearchType;
  livecrawl?: ExaLivecrawlMode;
  persistFullOutput?: boolean;
  timeoutMs?: number;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ExaResearchStartOptions {
  query: string;
  model?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ExaResearchCheckOptions {
  researchId: string;
  persistFullOutput?: boolean;
  timeoutMs?: number;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface ExaSearchResult {
  text: string;
  details: WebSearchResultDetails;
}

export interface ExaExtractResult {
  text: string;
  details: WebExtractResultDetails;
}

export interface ExaResearchStartResult {
  text: string;
  details: WebResearchStartDetails;
  isError?: boolean;
}

export interface ExaResearchCheckResult {
  text: string;
  details: WebResearchCheckDetails;
  isError?: boolean;
}

interface ExaResultItem {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  id?: string;
  text?: string;
  highlights?: string[];
  highlightScores?: number[];
  summary?: string;
  links?: string[];
  imageLinks?: string[];
  subpages?: ExaResultItem[];
}

interface ExaSearchResponse {
  results: ExaResultItem[];
  autopromptString?: string;
  resolvedSearchType?: string;
}

interface ExaContentsResponse {
  results: ExaResultItem[];
}

interface ExaResearchSource {
  title?: string;
  url: string;
  favicon?: string;
}

interface ExaResearchResponse {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "canceled";
  instructions: string;
  model: string;
  output?: string;
  parsed?: Record<string, unknown>;
  error?: string;
  events?: Array<{ eventType: string; data?: unknown }>;
  sources?: ExaResearchSource[];
  createdAt: string;
  updatedAt: string;
}

function getExaApiKey(env: NodeJS.ProcessEnv | undefined): string {
  const key = getProviderApiKey("exa", env);
  if (key) return key;
  throw new Error("EXA_API_KEY environment variable not set");
}

async function exaRequest<T>(options: {
  endpoint: string;
  method: ExaRequestMethod;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<T> {
  const timeout = withRequestTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${EXA_API_BASE}${options.endpoint}`, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getExaApiKey(options.env),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: timeout.signal,
    });

    return await readJsonResponse<T>(response, "Exa");
  } finally {
    timeout.cleanup();
  }
}

function clampResults(numResults: number | undefined, max: number): number {
  return Math.min(numResults ?? DEFAULT_MAX_RESULTS, max);
}

function clampSubpages(subpages: number | undefined): number | undefined {
  if (subpages === undefined) return undefined;
  return Math.min(subpages, MAX_SUBPAGES);
}

function formatResults(results: ExaResultItem[], includeContent: boolean): string {
  if (results.length === 0) return "No results found.";

  return results
    .map((result, index) => formatResultEntry(result, index + 1, includeContent))
    .join("\n\n");
}

function formatResultEntry(result: ExaResultItem, index: number, includeContent: boolean): string {
  let entry = `[${index}] ${result.title}\n    URL: ${result.url}`;
  if (result.publishedDate) entry += `\n    Published: ${result.publishedDate}`;
  if (result.author) entry += `\n    Author: ${result.author}`;
  if (result.score !== undefined) entry += `\n    Score: ${result.score.toFixed(3)}`;
  if (includeContent && result.text) entry += `\n    Content:\n${indentBlock(truncateText(result.text, 2000), 6)}`;
  if (result.highlights?.length) entry += `\n    Highlights:${result.highlights.map((highlight) => `\n      - ${highlight}`).join("")}`;
  if (result.summary) entry += `\n    Summary: ${result.summary}`;
  if (result.links?.length) entry += `\n    Links: ${formatList(result.links, 5)}`;
  if (result.imageLinks?.length) entry += `\n    Images: ${formatList(result.imageLinks, 3)}`;
  if (result.subpages?.length) entry += `\n    Subpages (${result.subpages.length}):${formatSubpages(result.subpages)}`;
  return entry;
}

function formatSubpages(subpages: ExaResultItem[]): string {
  return subpages
    .map((subpage, index) => {
      let entry = `\n      ${index + 1}. ${subpage.title} - ${subpage.url}`;
      if (subpage.text) {
        const preview = truncateText(subpage.text, 500).split("\n").slice(0, 3).join("\n");
        entry += `\n         ${preview.split("\n").join("\n         ")}`;
      }
      return entry;
    })
    .join("");
}

function indentBlock(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatList(items: string[], limit: number): string {
  const visible = items.slice(0, limit);
  const remainder = items.length - visible.length;
  return `${visible.join(", ")}${remainder > 0 ? ` (+${remainder} more)` : ""}`;
}

function buildSearchContents(options: Pick<ExaSearchOptions, "query" | "contents" | "highlights" | "summary" | "extras" | "subpages" | "subpageTarget">): Record<string, unknown> | undefined {
  const contents: Record<string, unknown> = {};

  if (options.contents) contents.text = true;
  if (options.highlights) contents.highlights = { numSentences: 3 };
  if (options.summary) contents.summary = { query: options.query };
  if (options.extras?.links) contents.links = true;
  if (options.extras?.imageLinks) contents.imageLinks = true;

  const subpages = clampSubpages(options.subpages);
  if (subpages !== undefined) contents.subpages = subpages;
  if (options.subpageTarget?.length) contents.subpageTarget = options.subpageTarget;

  return Object.keys(contents).length > 0 ? contents : undefined;
}

function buildSearchBody(options: ExaSearchOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query: options.query,
    numResults: clampResults(options.numResults, MAX_RESULTS),
    type: options.type ?? "auto",
    useAutoprompt: options.useAutoprompt ?? true,
  };

  if (options.category) body.category = options.category;
  if (options.includeDomains?.length) body.includeDomains = options.includeDomains;
  if (options.excludeDomains?.length) body.excludeDomains = options.excludeDomains;
  if (options.startPublishedDate) body.startPublishedDate = options.startPublishedDate;
  if (options.endPublishedDate) body.endPublishedDate = options.endPublishedDate;
  if (options.livecrawl) body.livecrawl = options.livecrawl;
  if (options.livecrawlTimeout !== undefined) body.livecrawlTimeout = options.livecrawlTimeout;

  const contents = buildSearchContents(options);
  if (contents) body.contents = contents;

  return body;
}

function buildExtractBody(options: ExaExtractOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    // Exa's /contents endpoint accepts URLs under the `ids` key.
    ids: options.urls.slice(0, MAX_RESULTS),
    text: true,
  };

  if (options.highlights) body.highlights = { numSentences: 5, query: options.highlightQuery };
  if (options.summary) body.summary = { query: options.summaryQuery };
  if (options.livecrawl) body.livecrawl = options.livecrawl;
  if (options.livecrawlTimeout !== undefined) body.livecrawlTimeout = options.livecrawlTimeout;

  const subpages = clampSubpages(options.subpages);
  if (subpages !== undefined) body.subpages = subpages;
  if (options.subpageTarget?.length) body.subpageTarget = options.subpageTarget;
  if (options.extras?.links) body.links = true;
  if (options.extras?.imageLinks) body.imageLinks = true;

  return body;
}

function buildFindSimilarBody(options: ExaFindSimilarOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    url: options.url,
    numResults: clampResults(options.numResults, MAX_RESULTS),
    excludeSourceDomain: options.excludeSourceDomain ?? true,
  };

  if (options.includeDomains?.length) body.includeDomains = options.includeDomains;
  if (options.excludeDomains?.length) body.excludeDomains = options.excludeDomains;
  if (options.livecrawl) body.livecrawl = options.livecrawl;
  if (options.contents) body.contents = { text: true };

  return body;
}

function buildCodeSearchBody(options: ExaCodeSearchOptions): Record<string, unknown> {
  return {
    query: options.query,
    numResults: clampResults(options.numResults, CODE_SEARCH_MAX_RESULTS),
    type: options.type ?? "auto",
    useAutoprompt: true,
    livecrawl: options.livecrawl ?? "fallback",
    category: "github",
    contents: {
      text: true,
      highlights: { numSentences: 5, query: options.query },
    },
  };
}

function normalizeSearchDetails(
  resultCount: number,
  formatted: ReturnType<typeof formatToolOutput>,
  previews: WebResultItem[],
  providerMeta?: Record<string, unknown>,
): WebSearchResultDetails {
  return {
    provider: EXA_PROVIDER,
    resultCount,
    truncated: formatted.truncated,
    truncation: formatted.truncation,
    fullOutputPath: formatted.fullOutputPath,
    previews: buildInlinePreviews(previews),
    providerMeta,
  };
}

function normalizeExtractDetails(
  options: ExaExtractOptions,
  fetchedCount: number,
  previews: WebResultItem[],
  formatted: ReturnType<typeof formatToolOutput>,
): WebExtractResultDetails {
  return {
    provider: EXA_PROVIDER,
    urlCount: options.urls.length,
    fetchedCount,
    failedCount: Math.max(options.urls.length - fetchedCount, 0) || undefined,
    truncated: formatted.truncated,
    truncation: formatted.truncation,
    fullOutputPath: formatted.fullOutputPath,
    previews: buildInlinePreviews(previews),
  };
}

function formatResearchPending(response: ExaResearchResponse): ExaResearchCheckResult {
  return {
    text: `Research is still ${response.status}.\n\nResearch ID: ${response.id}\nStatus: ${response.status}\n\nCheck again in a moment.`,
    details: {
      provider: EXA_PROVIDER,
      researchId: response.id,
      status: response.status,
      complete: false,
    },
  };
}

function formatResearchFailed(response: ExaResearchResponse): ExaResearchCheckResult {
  const error = response.error || "Unknown error";
  return {
    text: `Research failed.\n\nResearch ID: ${response.id}\nError: ${error}`,
    details: {
      provider: EXA_PROVIDER,
      researchId: response.id,
      status: response.status,
      complete: true,
      error,
    },
    isError: true,
  };
}

function formatResearchCanceled(response: ExaResearchResponse): ExaResearchCheckResult {
  const error = "Research was canceled.";
  return {
    text: `${error}\n\nResearch ID: ${response.id}`,
    details: {
      provider: EXA_PROVIDER,
      researchId: response.id,
      status: response.status,
      complete: true,
      error,
    },
    isError: true,
  };
}

function formatResearchCompleted(
  response: ExaResearchResponse,
  options: Pick<ExaResearchCheckOptions, "persistFullOutput" | "maxOutputLines" | "maxOutputBytes">,
): ExaResearchCheckResult {
  let text = `Research Complete!\n\nResearch ID: ${response.id}\nModel: ${response.model}\n\n`;
  if (response.parsed) text += `Parsed Output:\n${JSON.stringify(response.parsed, null, 2)}\n\n`;
  text += `Output:\n${response.output || "No output available."}`;

  const formatted = formatToolOutput(text, {
    persistFullOutput: options.persistFullOutput,
    maxLines: options.maxOutputLines,
    maxBytes: options.maxOutputBytes,
  });
  return {
    text: formatted.output,
    details: {
      provider: EXA_PROVIDER,
      researchId: response.id,
      status: response.status,
      complete: true,
      truncated: formatted.truncated,
      truncation: formatted.truncation,
      fullOutputPath: formatted.fullOutputPath,
      sources: response.sources,
      providerMeta: {
        model: response.model,
        hasParsed: response.parsed !== undefined,
      },
    },
  };
}

function toWebResultItem(result: ExaResultItem): WebResultItem {
  return {
    title: result.title,
    url: result.url,
    publishedDate: result.publishedDate,
    author: result.author,
    score: result.score,
    content: result.text,
    summary: result.summary,
    highlights: result.highlights,
    links: result.links,
    imageLinks: result.imageLinks,
    providerMeta: result.subpages?.length ? { subpageCount: result.subpages.length } : undefined,
  };
}

export async function exaSearch(options: ExaSearchOptions): Promise<ExaSearchResult> {
  const response = await exaRequest<ExaSearchResponse>({
    endpoint: "/search",
    method: "POST",
    body: buildSearchBody(options),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    env: options.env,
  });

  if (!Array.isArray(response.results)) {
    throw new Error("Exa returned unexpected search response shape.");
  }

  let text = formatResults(response.results, options.contents ?? false);
  if (response.autopromptString) text = `Optimized query: "${response.autopromptString}"\n\n${text}`;

  const formatted = formatToolOutput(text, {
    persistFullOutput: options.persistFullOutput,
    maxLines: options.maxOutputLines,
    maxBytes: options.maxOutputBytes,
  });
  const previews = response.results.map(toWebResultItem);
  return {
    text: formatted.output,
    details: normalizeSearchDetails(response.results.length, formatted, previews, {
      autoprompt: response.autopromptString,
      resolvedSearchType: response.resolvedSearchType,
    }),
  };
}

export async function exaExtract(options: ExaExtractOptions): Promise<ExaExtractResult> {
  if (options.urls.length === 0) {
    return {
      text: "No URLs provided.",
      details: {
        provider: EXA_PROVIDER,
        urlCount: 0,
        fetchedCount: 0,
        failedCount: 0,
        truncated: false,
        previews: [],
      },
    };
  }

  if (options.urls.length > MAX_RESULTS) {
    throw new Error(`Exa extract accepts at most ${MAX_RESULTS} URLs per call.`);
  }

  const response = await exaRequest<ExaContentsResponse>({
    endpoint: "/contents",
    method: "POST",
    body: buildExtractBody(options),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    env: options.env,
  });

  if (!Array.isArray(response.results)) {
    throw new Error("Exa returned unexpected extract response shape.");
  }

  const formatted = formatToolOutput(formatResults(response.results, true), {
    persistFullOutput: options.persistFullOutput,
    maxLines: options.maxOutputLines,
    maxBytes: options.maxOutputBytes,
  });
  const previews = response.results.map(toWebResultItem);

  return {
    text: formatted.output,
    details: normalizeExtractDetails(options, response.results.length, previews, formatted),
  };
}

export async function exaFindSimilar(options: ExaFindSimilarOptions): Promise<ExaSearchResult> {
  const response = await exaRequest<ExaSearchResponse>({
    endpoint: "/findSimilar",
    method: "POST",
    body: buildFindSimilarBody(options),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    env: options.env,
  });

  if (!Array.isArray(response.results)) {
    throw new Error("Exa returned unexpected find-similar response shape.");
  }

  const formatted = formatToolOutput(formatResults(response.results, options.contents ?? false), {
    persistFullOutput: options.persistFullOutput,
    maxLines: options.maxOutputLines,
    maxBytes: options.maxOutputBytes,
  });
  const previews = response.results.map(toWebResultItem);

  return {
    text: formatted.output,
    details: normalizeSearchDetails(response.results.length, formatted, previews, {
      sourceUrl: options.url,
    }),
  };
}

export async function exaCodeSearch(options: ExaCodeSearchOptions): Promise<ExaSearchResult> {
  const body = buildCodeSearchBody(options);
  const response = await exaRequest<ExaSearchResponse>({
    endpoint: "/search",
    method: "POST",
    body,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    env: options.env,
  });

  if (!Array.isArray(response.results)) {
    throw new Error("Exa returned unexpected code-search response shape.");
  }

  let text = formatResults(response.results, true);
  if (response.autopromptString) text = `Optimized query: "${response.autopromptString}"\n\n${text}`;

  const formatted = formatToolOutput(text, {
    persistFullOutput: options.persistFullOutput,
    maxLines: options.maxOutputLines,
    maxBytes: options.maxOutputBytes,
  });
  const previews = response.results.map(toWebResultItem);
  return {
    text: formatted.output,
    details: normalizeSearchDetails(response.results.length, formatted, previews, {
      category: body.category,
      type: body.type,
    }),
  };
}

export async function exaResearchStart(options: ExaResearchStartOptions): Promise<ExaResearchStartResult> {
  const response = await exaRequest<ExaResearchResponse>({
    endpoint: "/research/v1",
    method: "POST",
    body: {
      instructions: options.query,
      model: options.model ?? "exa-research-pro",
    },
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    env: options.env,
  });

  if (response.status === "failed" || response.status === "canceled") {
    const error = response.error ?? (response.status === "canceled" ? "Research was canceled." : "Research failed to start.");
    return {
      text: [`Research failed to start.`, `Research ID: ${response.id}`, `Status: ${response.status}`, `Error: ${error}`].join("\n"),
      details: {
        provider: EXA_PROVIDER,
        researchId: response.id,
        status: response.status,
        model: response.model,
        error,
      },
      isError: true,
    };
  }

  return {
    text: `Research task started!\n\nResearch ID: ${response.id}\nStatus: ${response.status}\nModel: ${response.model}\n\nUse web_research_check with this ID to check progress and get results.`,
    details: {
      provider: EXA_PROVIDER,
      researchId: response.id,
      status: response.status,
      model: response.model,
    },
  };
}

export async function exaResearchCheck(options: ExaResearchCheckOptions): Promise<ExaResearchCheckResult> {
  const response = await exaRequest<ExaResearchResponse>({
    endpoint: `/research/v1/${options.researchId}`,
    method: "GET",
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    env: options.env,
  });

  if (response.status === "pending" || response.status === "running") return formatResearchPending(response);
  if (response.status === "failed") return formatResearchFailed(response);
  if (response.status === "canceled") return formatResearchCanceled(response);
  return formatResearchCompleted(response, options);
}
