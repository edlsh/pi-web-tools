import { formatToolOutput, readJsonResponse, withRequestTimeout } from "./helpers";
import { buildInlinePreviews } from "./previews";
import { getProviderApiKey } from "./providers";
import type { WebExtractResultDetails, WebResultItem, WebSearchResultDetails } from "./types";

const JINA_SEARCH_URL = "https://s.jina.ai/";
const JINA_EXTRACT_URL = "https://r.jina.ai/";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface JinaSearchOptions {
  query: string;
  count?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  persistFullOutput?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface JinaExtractOptions {
  urls: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
  maxOutputLines?: number;
  maxOutputBytes?: number;
  persistFullOutput?: boolean;
  env?: NodeJS.ProcessEnv;
}

interface JinaSearchResponse {
  data?: unknown;
  results?: unknown;
}

interface JinaExtractResponse {
  data?: unknown;
}

export async function jinaSearch(
  options: JinaSearchOptions,
): Promise<{ text: string; details: WebSearchResultDetails }> {
  const response = await postJinaJson<JinaSearchResponse>({
    url: JINA_SEARCH_URL,
    body: {
      q: options.query,
      ...(options.count === undefined ? {} : { num: options.count }),
    },
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    env: options.env,
  });

  const rawResults = getSearchResults(response);
  const results = normalizeItems(rawResults);
  const formatted = formatToolOutput(formatItems(results), {
    maxLines: options.maxOutputLines,
    maxBytes: options.maxOutputBytes,
    persistFullOutput: options.persistFullOutput,
  });

  return {
    text: formatted.output,
    details: {
      provider: "jina",
      resultCount: results.length,
      truncated: formatted.truncated,
      truncation: formatted.truncation,
      fullOutputPath: formatted.fullOutputPath,
      previews: buildInlinePreviews(results),
      providerMeta: {
        results: results.map((result) => ({
          title: result.title,
          url: result.url,
          ...(result.content ? { content: result.content } : {}),
        })),
      },
    },
  };
}

export async function jinaExtract(
  options: JinaExtractOptions,
): Promise<{ text: string; details: WebExtractResultDetails }> {
  const settled = await Promise.all(
    options.urls.map(async (url) => {
      try {
        const response = await postJinaJson<JinaExtractResponse>({
          url: JINA_EXTRACT_URL,
          body: { url },
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          env: options.env,
        });

        return {
          ok: true as const,
          item: normalizeItem(response.data ?? response, url),
        };
      } catch (error) {
        return {
          ok: false as const,
          url,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  const successes = settled.filter((entry) => entry.ok).map((entry) => entry.item);
  const failures = settled.filter((entry) => !entry.ok);

  if (failures.length > 0 && successes.length === 0) {
    throw new Error([
      "Jina extract failed for all requested URLs.",
      ...failures.map((failure) => `- ${failure.url}: ${failure.error}`),
    ].join("\n"));
  }

  const sections: string[] = [];
  if (successes.length > 0) {
    sections.push(formatItems(successes));
  }
  if (failures.length > 0) {
    sections.push(["Failed URLs:", ...failures.map((failure) => `- ${failure.url}: ${failure.error}`)].join("\n"));
  }

  const formatted = formatToolOutput(sections.join("\n\n") || "No content extracted.", {
    maxLines: options.maxOutputLines,
    maxBytes: options.maxOutputBytes,
    persistFullOutput: options.persistFullOutput,
  });

  return {
    text: formatted.output,
    details: {
      provider: "jina",
      urlCount: options.urls.length,
      fetchedCount: successes.length,
      failedCount: failures.length || undefined,
      truncated: formatted.truncated,
      truncation: formatted.truncation,
      fullOutputPath: formatted.fullOutputPath,
      previews: buildInlinePreviews(successes),
      providerMeta: {
        ...(successes.length > 0
          ? {
              successes: successes.map((item) => ({
                title: item.title,
                url: item.url,
              })),
            }
          : {}),
        ...(failures.length > 0 ? { failures: failures.map(({ url, error }) => ({ url, error })) } : {}),
      },
    },
  };
}

async function postJinaJson<T>(options: {
  url: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<T> {
  const apiKey = getRequiredApiKey(options.env);
  const timeout = withRequestTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options.body),
      signal: timeout.signal,
    });

    return await readJsonResponse<T>(response, "Jina");
  } finally {
    timeout.cleanup();
  }
}

function getRequiredApiKey(env: NodeJS.ProcessEnv | undefined): string {
  const apiKey = getProviderApiKey("jina", env);
  if (!apiKey) {
    throw new Error("JINA_API_KEY environment variable not set");
  }
  return apiKey;
}

function getSearchResults(response: JinaSearchResponse): unknown[] {
  const candidates = [
    response.data,
    response.results,
    asRecord(response.data).results,
    asRecord(response.data).items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  throw new Error("Jina returned unexpected search response shape.");
}

function normalizeItems(value: unknown): WebResultItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => normalizeItem(item, `result-${index + 1}`));
}

function normalizeItem(value: unknown, fallbackUrl: string): WebResultItem {
  const record = asRecord(value);

  return {
    title: asString(record.title) ?? fallbackUrl,
    url: asString(record.url) ?? fallbackUrl,
    content: asString(record.content) ?? asString(record.text),
    summary: asString(record.summary) ?? asString(record.description),
    links: normalizeStringArray(record.links),
    imageLinks: normalizeStringArray(record.images) ?? normalizeStringArray(record.imageLinks),
    providerMeta: undefined,
  };
}

function formatItems(items: WebResultItem[]): string {
  if (items.length === 0) {
    return "No results found.";
  }

  return items
    .map((item, index) => {
      const lines = [`[${index + 1}] ${item.title}`, `URL: ${item.url}`];

      if (item.summary) {
        lines.push(`Description: ${item.summary}`);
      }
      if (item.content) {
        lines.push("Content:");
        lines.push(...indentLines(item.content));
      }
      if (item.links?.length) {
        lines.push("Links:");
        lines.push(...item.links.map((link) => `  - ${link}`));
      }
      if (item.imageLinks?.length) {
        lines.push("Images:");
        lines.push(...item.imageLinks.map((image) => `  - ${image}`));
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

function indentLines(value: string): string[] {
  return value.split("\n").map((line) => `  ${line}`);
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.map(asString).filter((item): item is string => item !== undefined);
  return items.length > 0 ? items : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
