import type { TruncationInfo } from "./helpers";
import type { WebProvider } from "./providers";

export interface WebResultItem {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  score?: number;
  content?: string;
  summary?: string;
  highlights?: string[];
  links?: string[];
  imageLinks?: string[];
  providerMeta?: Record<string, unknown>;
}

export interface WebInlinePreview {
  domain: string;
  title: string;
  snippet?: string;
  url: string;
}

export interface WebSearchResultDetails {
  provider: WebProvider;
  resultCount: number;
  truncated: boolean;
  truncation?: TruncationInfo;
  fullOutputPath?: string;
  error?: string;
  previews?: WebInlinePreview[];
  providerMeta?: Record<string, unknown>;
}

export interface WebExtractResultDetails {
  provider: WebProvider;
  urlCount: number;
  fetchedCount: number;
  failedCount?: number;
  truncated: boolean;
  truncation?: TruncationInfo;
  fullOutputPath?: string;
  error?: string;
  previews?: WebInlinePreview[];
  providerMeta?: Record<string, unknown>;
}

export interface WebResearchStartDetails {
  provider: WebProvider;
  researchId: string;
  status: string;
  model?: string;
  error?: string;
}

export interface WebResearchCheckDetails {
  provider: WebProvider;
  researchId: string;
  status: string;
  complete: boolean;
  truncated?: boolean;
  truncation?: TruncationInfo;
  fullOutputPath?: string;
  error?: string;
  sources?: Array<{ title?: string; url: string; favicon?: string }>;
  providerMeta?: Record<string, unknown>;
}
