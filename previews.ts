import type { WebInlinePreview, WebResultItem } from "./types";

const TITLE_MAX = 48;
const SNIPPET_MAX = 96;
const NORMALIZE_MAX = Math.max(TITLE_MAX, SNIPPET_MAX);

export function buildInlinePreview(item: WebResultItem): WebInlinePreview {
  const domain = getPreviewDomain(item.url);
  const normalizedTitle = normalizeInline(item.title);
  const title = !normalizedTitle || /^result-\d+$/i.test(normalizedTitle)
    ? previewTitleFromUrl(item.url)
    : normalizedTitle;
  const snippet = pickSnippet(item);

  return {
    domain,
    title,
    snippet,
    url: item.url,
  };
}

export function buildInlinePreviews(items: WebResultItem[]): WebInlinePreview[] {
  return items.map(buildInlinePreview);
}

export function previewTitleFromUrl(url: string): string {
  const domain = getPreviewDomain(url);

  try {
    const parsed = new URL(url);
    const rawTitle = parsed.pathname && parsed.pathname !== "/" ? `${domain}${parsed.pathname}` : domain;
    return truncateInline(rawTitle, TITLE_MAX) ?? domain ?? "Unknown";
  } catch {
    return truncateInline(domain, TITLE_MAX) ?? domain ?? "Unknown";
  }
}

export function truncateInline(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function pickSnippet(item: WebResultItem): string | undefined {
  return truncateInline(
    normalizeInline(item.summary) ?? normalizeInline(item.content) ?? normalizeInline(item.highlights?.[0]),
    SNIPPET_MAX,
  );
}

function getPreviewDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

function normalizeInline(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? truncateInline(normalized, NORMALIZE_MAX) : undefined;
}
