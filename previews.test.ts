import { describe, expect, it } from "bun:test";
import { buildInlinePreview } from "./previews";

describe("web-tools preview helpers", () => {
  it("falls back to a domain-based title when the provider only gives a synthetic result id", () => {
    const preview = buildInlinePreview({
      title: "result-2",
      url: "https://www.reddit.com/r/browsers/comments/1levi11/good-unfiltered-search-engine/",
      content: "Blocked page body",
    });

    expect(preview).toEqual({
      domain: "reddit.com",
      title: "reddit.com/r/browsers/comments/1levi11/good-unf…",
      snippet: "Blocked page body",
      url: "https://www.reddit.com/r/browsers/comments/1levi11/good-unfiltered-search-engine/",
    });
  });

  it("prefers summary text and normalizes whitespace for snippets", () => {
    const preview = buildInlinePreview({
      title: "Example",
      url: "https://example.com/path",
      summary: "  Multi\nline\t summary   text  ",
      content: "Longer content body",
    });

    expect(preview).toEqual({
      domain: "example.com",
      title: "Example",
      snippet: "Multi line summary text",
      url: "https://example.com/path",
    });
  });
});
