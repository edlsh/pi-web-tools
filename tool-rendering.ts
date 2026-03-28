import { keyHint } from "@mariozechner/pi-coding-agent";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { truncateInline } from "./previews";
import type { WebInlinePreview, WebResearchCheckDetails, WebResearchStartDetails } from "./types";

export type ToolRenderResult = {
	content: { type: string; text: string }[];
	details?: Record<string, unknown>;
};

export function providerLabel(provider: unknown): string {
	if (provider === "exa") return "Exa";
	if (provider === "jina") return "Jina";
	if (provider === "tavily") return "Tavily";
	return "Web";
}

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function expandHint(theme: Theme): string {
	return theme.fg("dim", ` · ${keyHint("expandTools", "expand")}`);
}

function compactPreviewSummary(previews: WebInlinePreview[], theme: Theme): string {
	const visiblePreviews = previews.slice(0, 2);
	const items = visiblePreviews.map((preview) => {
		const title = truncateInline(preview.title, 36) ?? preview.title;
		return `${theme.fg("accent", preview.domain)}${theme.fg("muted", ` — ${title}`)}`;
	});

	const hiddenCount = previews.length - visiblePreviews.length;
	if (hiddenCount > 0) {
		items.push(theme.fg("muted", `+${hiddenCount} more`));
	}

	return items.join(theme.fg("muted", " • "));
}

export function renderToolResult(
	result: ToolRenderResult,
	options: { expanded: boolean; isPartial: boolean },
	theme: Theme,
	config: {
		partialLabel: string;
		summary: (details: Record<string, unknown>) => string;
		expandedLines?: number;
	},
) {
	if (options.isPartial) return new Text(theme.fg("warning", config.partialLabel), 0, 0);

	const details = result.details ?? {};
	if (details.error && !details.status) {
		return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
	}

	let summary = config.summary(details);
	if (details.truncated) summary += theme.fg("warning", " (truncated)");

	if (options.expanded) {
		const content = result.content[0];
		let text = summary;
		if (content?.type === "text") {
			const maxLines = config.expandedLines ?? 30;
			const allLines = content.text.split("\n");
			for (const line of allLines.slice(0, maxLines)) text += `\n${theme.fg("dim", line)}`;
			if (allLines.length > maxLines) text += `\n${theme.fg("muted", "...")}`;
		}
		return new Text(text, 0, 0);
	}

	const previews = Array.isArray(details.previews) ? (details.previews as WebInlinePreview[]) : [];
	if (previews.length === 0) {
		return new Text(summary + expandHint(theme), 0, 0);
	}

	return new Text(`${summary}\n${compactPreviewSummary(previews, theme)}${expandHint(theme)}`, 0, 0);
}

export function searchRenderCall(args: Record<string, unknown>, theme: Theme, toolName: string): Text {
	let text = theme.fg("toolTitle", theme.bold(`${toolName} `));
	text += theme.fg("accent", `"${String(args.query ?? "")}"`);
	if (args.provider) text += theme.fg("muted", ` [${String(args.provider)}]`);
	if (args.maxResults) text += theme.fg("dim", ` (${String(args.maxResults)} results)`);
	return new Text(text, 0, 0);
}

export function extractRenderCall(args: Record<string, unknown>, theme: Theme): Text {
	let text = theme.fg("toolTitle", theme.bold("web_extract "));
	const urls = Array.isArray(args.urls) ? args.urls : [];
	text += urls.length === 1 ? theme.fg("accent", String(urls[0])) : theme.fg("accent", `${urls.length} URLs`);
	if (args.provider) text += theme.fg("muted", ` [${String(args.provider)}]`);
	return new Text(text, 0, 0);
}

export function findSimilarRenderCall(args: Record<string, unknown>, theme: Theme): Text {
	let text = theme.fg("toolTitle", theme.bold("web_find_similar "));
	text += theme.fg("accent", String(args.url ?? ""));
	return new Text(text, 0, 0);
}

export function researchRenderCall(
	args: Record<string, unknown>,
	theme: Theme,
	toolName: string,
	field: "query" | "researchId",
): Text {
	let text = theme.fg("toolTitle", theme.bold(`${toolName} `));
	text += theme.fg("accent", field === "query" ? `"${String(args.query ?? "")}"` : String(args.researchId ?? ""));
	if (args.provider) text += theme.fg("muted", ` [${String(args.provider)}]`);
	return new Text(text, 0, 0);
}

export function renderResearchStartResult(
	result: ToolRenderResult,
	options: { expanded: boolean; isPartial: boolean },
	theme: Theme,
) {
	if (options.isPartial) return new Text(theme.fg("warning", "Starting research..."), 0, 0);

	const details = (result.details ?? {}) as WebResearchStartDetails & { error?: string };
	if (details.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);

	let text = theme.fg("success", `${providerLabel(details.provider)} research started: ${details.researchId}`);
	if (details.status) text += theme.fg("dim", ` [${details.status}]`);

	if (options.expanded) {
		const content = result.content[0];
		if (content?.type === "text") text += `\n${theme.fg("dim", content.text)}`;
	} else {
		text += expandHint(theme);
	}

	return new Text(text, 0, 0);
}

export function renderResearchCheckResult(
	result: ToolRenderResult,
	options: { expanded: boolean; isPartial: boolean },
	theme: Theme,
) {
	if (options.isPartial) return new Text(theme.fg("warning", "Checking research..."), 0, 0);

	const details = (result.details ?? {}) as WebResearchCheckDetails & { error?: string };
	if (details.error && !details.status) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);

	let text: string;
	if (details.status === "pending" || details.status === "running" || details.status === "in_progress") {
		text = theme.fg("warning", `${providerLabel(details.provider)} research ${details.status}: ${details.researchId}`);
	} else if (details.status === "failed") {
		text = theme.fg("error", `${providerLabel(details.provider)} research failed: ${details.error ?? details.researchId}`);
	} else if (details.status === "canceled") {
		text = theme.fg("muted", `${providerLabel(details.provider)} research canceled: ${details.researchId}`);
	} else {
		text = theme.fg("success", `${providerLabel(details.provider)} research complete: ${details.researchId}`);
		if (details.truncated) text += theme.fg("warning", " (truncated)");
	}

	if (options.expanded && details.complete) {
		const content = result.content[0];
		if (content?.type === "text") {
			const allLines = content.text.split("\n");
			for (const line of allLines.slice(0, 50)) text += `\n${theme.fg("dim", line)}`;
			if (allLines.length > 50) text += `\n${theme.fg("muted", "...")}`;
		}
	} else if (details.complete) {
		text += expandHint(theme);
	}

	return new Text(text, 0, 0);
}
