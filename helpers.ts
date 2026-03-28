import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_TOOL_OUTPUT_MAX_LINES = 200;
export const DEFAULT_TOOL_OUTPUT_MAX_BYTES = 32 * 1024;

export interface TruncationInfo {
  content: string;
  outputLines: number;
  totalLines: number;
  outputBytes: number;
  totalBytes: number;
  truncated: boolean;
}

export interface FormattedOutput {
  output: string;
  truncated: boolean;
  truncation?: TruncationInfo;
  fullOutputPath?: string;
}

export interface FormatToolOutputOptions {
  maxLines?: number;
  maxBytes?: number;
  persistFullOutput?: boolean;
  formatSize?: (bytes: number) => string;
}

export function formatToolOutput(text: string, options: FormatToolOutputOptions = {}): FormattedOutput {
  const truncation = truncateHead(text, {
    maxLines: options.maxLines ?? DEFAULT_TOOL_OUTPUT_MAX_LINES,
    maxBytes: options.maxBytes ?? DEFAULT_TOOL_OUTPUT_MAX_BYTES,
  });

  let output = truncation.content;
  let fullOutputPath: string | undefined;

  if (truncation.truncated) {
    if (options.persistFullOutput) {
      const tempDir = mkdtempSync(join(tmpdir(), "pi-web-tools-"));
      fullOutputPath = join(tempDir, "output.txt");
      writeFileSync(fullOutputPath, text);
    }

    const formatSize = options.formatSize ?? defaultFormatSize;
    output += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
    output += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    if (fullOutputPath) {
      output += ` Full output saved to: ${fullOutputPath}`;
    }
    output += "]";
  }

  return {
    output,
    truncated: truncation.truncated,
    truncation: truncation.truncated ? truncation : undefined,
    fullOutputPath,
  };
}

export interface TimeoutSignalHandle {
  signal: AbortSignal;
  cleanup(): void;
}

export function withRequestTimeout(signal: AbortSignal | undefined, timeoutMs = 30_000): TimeoutSignalHandle {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  return {
    signal: combinedSignal,
    cleanup() {
      // AbortSignal.timeout and AbortSignal.any do not need manual teardown.
    },
  };
}

export async function readJsonResponse<T>(response: Response, providerLabel: string): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${providerLabel} API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export function defaultFormatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateHead(text: string, limits: { maxLines: number; maxBytes: number }): TruncationInfo {
  const lines = text.split("\n");
  const totalLines = lines.length;
  const totalBytes = Buffer.byteLength(text);

  let outputLines = 0;
  let outputBytes = 0;
  const kept: string[] = [];

  for (const line of lines) {
    const rendered = outputLines === 0 ? line : `\n${line}`;
    const renderedBytes = Buffer.byteLength(rendered);
    if (outputLines >= limits.maxLines || outputBytes + renderedBytes > limits.maxBytes) break;
    kept.push(line);
    outputLines += 1;
    outputBytes += renderedBytes;
  }

  const content = kept.join("\n");
  return {
    content,
    truncated: outputLines < totalLines || outputBytes < totalBytes,
    outputLines,
    totalLines,
    outputBytes,
    totalBytes,
  };
}
