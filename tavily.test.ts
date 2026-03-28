import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  tavilyCheckResearch,
  tavilyExtract,
  tavilySearch,
  tavilyStartResearch,
} from "./tavily";

type FetchMock = typeof fetch;

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.TAVILY_API_KEY;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

describe("tavily provider adapter", () => {
  beforeEach(() => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = originalApiKey;
  });

  it("throws a clear error when the API key is missing", async () => {
    delete process.env.TAVILY_API_KEY;

    await expect(tavilySearch({ query: "latest ai news" })).rejects.toThrow("TAVILY_API_KEY environment variable not set");
  });

  it("normalizes search responses with Tavily-specific options and useful image output", async () => {
    globalThis.fetch = (async (input, init) => {
      expect(input).toBe("https://api.tavily.com/search");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Headers).get("Authorization")).toBe("Bearer tvly-test-key");
      expect((init?.headers as Headers).get("Accept")).toBe("application/json");

      expect(JSON.parse(String(init?.body))).toEqual({
        query: "latest ai news",
        search_depth: "advanced",
        include_answer: "advanced",
        include_raw_content: "markdown",
        include_images: true,
        include_favicon: true,
        max_results: 2,
      });

      return jsonResponse({
        answer: "AI models are getting smaller and more capable.",
        query: "latest ai news",
        response_time: 0.42,
        images: [
          "https://cdn.example.com/hero-1.png",
          "https://cdn.example.com/hero-2.png",
          "https://cdn.example.com/hero-3.png",
          "https://cdn.example.com/hero-4.png",
        ],
        results: [
          {
            title: "First story",
            url: "https://example.com/first",
            content: "Summary of first story",
            raw_content: "# First story\nFull markdown",
            score: 0.98,
            favicon: "https://example.com/favicon.ico",
            images: ["https://example.com/image-a.png", "https://example.com/image-b.png"],
            published_date: "2026-03-20",
          },
          {
            title: "Second story",
            url: "https://example.com/second",
            content: "Summary of second story",
            score: 0.75,
          },
        ],
      });
    }) as FetchMock;

    const result = await tavilySearch({
      query: "latest ai news",
      searchDepth: "advanced",
      includeAnswer: "advanced",
      includeRawContent: "markdown",
      includeImages: true,
      includeFavicon: true,
      maxResults: 2,
    });

    expect(result.details).toMatchObject({
      provider: "tavily",
      resultCount: 2,
      truncated: false,
      previews: [
        {
          domain: "example.com",
          title: "First story",
          snippet: "Summary of first story",
          url: "https://example.com/first",
        },
        {
          domain: "example.com",
          title: "Second story",
          snippet: "Summary of second story",
          url: "https://example.com/second",
        },
      ],
      providerMeta: {
        answer: "AI models are getting smaller and more capable.",
        responseTime: 0.42,
        query: "latest ai news",
        imageCount: 4,
      },
    });
    expect(result.text).toContain("Answer: AI models are getting smaller and more capable.");
    expect(result.text).toContain("Images: https://cdn.example.com/hero-1.png, https://cdn.example.com/hero-2.png, https://cdn.example.com/hero-3.png (+1 more)");
    expect(result.text).toContain("[1] First story");
    expect(result.text).toContain("Favicon: https://example.com/favicon.ico");
    expect(result.text).toContain("Source Images: https://example.com/image-a.png, https://example.com/image-b.png");
    expect(result.text).toContain("Raw Content:");
    expect(result.text).toContain("# First story");
  });

  it("normalizes extract responses without hiding failed URLs", async () => {
    globalThis.fetch = (async (_input, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        urls: ["https://example.com/a", "https://example.com/b"],
        extract_depth: "advanced",
        include_images: true,
        include_favicon: true,
      });

      return jsonResponse({
        results: [
          {
            url: "https://example.com/a",
            raw_content: "Article A body",
            images: ["https://example.com/a.png"],
            favicon: "https://example.com/a.ico",
          },
        ],
        failed_results: [
          {
            url: "https://example.com/b",
            error: "Timed out while fetching",
          },
        ],
        response_time: 1.25,
        request_id: "req_extract_123",
      });
    }) as FetchMock;

    const result = await tavilyExtract({
      urls: ["https://example.com/a", "https://example.com/b"],
      extractDepth: "advanced",
      includeImages: true,
      includeFavicon: true,
    });

    expect(result.details).toMatchObject({
      provider: "tavily",
      urlCount: 2,
      fetchedCount: 1,
      failedCount: 1,
      truncated: false,
      previews: [
        {
          domain: "example.com",
          title: "example.com/a",
          snippet: "Article A body",
          url: "https://example.com/a",
        },
      ],
      providerMeta: {
        requestId: "req_extract_123",
        responseTime: 1.25,
        failedResults: [{ url: "https://example.com/b", error: "Timed out while fetching" }],
      },
    });
    expect(result.text).toContain("Failed URLs:");
    expect(result.text).toContain("https://example.com/b — Timed out while fetching");
    expect(result.text).toContain("Article A body");
  });
  it("throws when Tavily extract fails for every requested URL", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        results: [],
        failed_results: [
          { url: "https://example.com/a", error: "Timed out" },
          { url: "https://example.com/b", error: "Blocked" },
        ],
      })) as FetchMock;

    await expect(
      tavilyExtract({ urls: ["https://example.com/a", "https://example.com/b"] }),
    ).rejects.toThrow("Tavily extract failed for all requested URLs.");
  });


  it("normalizes the research lifecycle truthfully across pending completed and failed states", async () => {
    const responses = [
      jsonResponse(
        {
          request_id: "research_123",
          status: "pending",
          response_time: 0.2,
        },
        { status: 202 },
      ),
      jsonResponse({
        request_id: "research_123",
        created_at: "2026-03-26T10:00:00Z",
        status: "completed",
        content: {
          summary: "AI spending is increasing",
          risks: ["energy demand", "regulation"],
        },
        sources: [
          {
            title: "Report",
            url: "https://example.com/report",
            favicon: "https://example.com/report.ico",
          },
        ],
        response_time: 4.5,
      }),
      jsonResponse({
        request_id: "research_123",
        status: "failed",
        response_time: 3.1,
      }),
    ];

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith("/research") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({
          input: "state of AI capex",
          model: "pro",
          citation_format: "apa",
          output_schema: {
            properties: {
              summary: { type: "string", description: "Executive summary" },
            },
            required: ["summary"],
          },
        });

        return jsonResponse(
          {
            request_id: "research_123",
            created_at: "2026-03-26T09:59:00Z",
            status: "pending",
            input: "state of AI capex",
            model: "pro",
            response_time: 0.8,
          },
          { status: 201 },
        );
      }

      expect(url).toBe("https://api.tavily.com/research/research_123");
      expect(init?.method).toBe("GET");
      const next = responses.shift();
      if (!next) throw new Error("No mock response left");
      return next;
    }) as FetchMock;

    const started = await tavilyStartResearch({
      input: "state of AI capex",
      model: "pro",
      citationFormat: "apa",
      outputSchema: {
        properties: {
          summary: { type: "string", description: "Executive summary" },
        },
        required: ["summary"],
      },
    });

    expect(started.details).toEqual({
      provider: "tavily",
      researchId: "research_123",
      status: "pending",
      model: "pro",
    });
    expect(started.text).toContain("Research queued with Tavily.");

    const pending = await tavilyCheckResearch({ researchId: "research_123" });
    expect(pending.details).toMatchObject({
      provider: "tavily",
      researchId: "research_123",
      status: "pending",
      complete: false,
      providerMeta: { responseTime: 0.2 },
    });
    expect(pending.isError).toBeUndefined();
    expect(pending.text).toContain("Research is still pending.");

    const completed = await tavilyCheckResearch({ researchId: "research_123" });
    expect(completed.details).toMatchObject({
      provider: "tavily",
      researchId: "research_123",
      status: "completed",
      complete: true,
      sources: [
        {
          title: "Report",
          url: "https://example.com/report",
          favicon: "https://example.com/report.ico",
        },
      ],
      providerMeta: {
        createdAt: "2026-03-26T10:00:00Z",
        responseTime: 4.5,
      },
    });
    expect(completed.text).toContain(`{
  "summary": "AI spending is increasing",`);
    expect(completed.text).toContain("Sources:\n- Report — https://example.com/report");

    const failed = await tavilyCheckResearch({ researchId: "research_123" });
    expect(failed.details).toMatchObject({
      provider: "tavily",
      researchId: "research_123",
      status: "failed",
      complete: true,
      error: "Tavily research failed.",
      providerMeta: { responseTime: 3.1 },
    });
    expect(failed.isError).toBe(true);
    expect(failed.text).toContain("Tavily research failed.");
  });
  it("surfaces failed research-start statuses as errors", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        {
          request_id: "research_failed",
          created_at: "2026-03-26T09:59:00Z",
          status: "failed",
          model: "pro",
          error: "quota exceeded",
          response_time: 0.8,
        },
        { status: 201 },
      )) as FetchMock;

    const result = await tavilyStartResearch({ input: "state of AI capex", model: "pro" });

    expect(result.isError).toBe(true);
    expect(result.details).toEqual({
      provider: "tavily",
      researchId: "research_failed",
      status: "failed",
      model: "pro",
      error: "quota exceeded",
    });
    expect(result.text).toContain("Tavily research failed.");
    expect(result.text).toContain("quota exceeded");
  });

});
