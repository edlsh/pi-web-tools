import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import {
  exaCodeSearch,
  exaExtract,
  exaResearchCheck,
  exaResearchStart,
  exaSearch,
} from "./exa";

type MockFetch = typeof fetch;

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.EXA_API_KEY;
const cleanupPaths = new Set<string>();

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalApiKey === undefined) delete process.env.EXA_API_KEY;
  else process.env.EXA_API_KEY = originalApiKey;

  for (const path of cleanupPaths) {
    rmSync(path, { force: true });
  }
  cleanupPaths.clear();
});

describe("web-tools Exa adapter", () => {
  it("normalizes search results while preserving Exa-specific metadata", async () => {
    process.env.EXA_API_KEY = " exa-key ";

    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse({
        results: [
          {
            title: "Acme Docs",
            url: "https://example.com/docs",
            publishedDate: "2026-03-01",
            author: "Alice",
            score: 0.9876,
            text: "First line\nSecond line",
            highlights: ["Important highlight"],
            summary: "Summary text",
            links: ["https://example.com/a", "https://example.com/b"],
            imageLinks: ["https://example.com/image.png"],
            subpages: [
              {
                title: "Pricing",
                url: "https://example.com/pricing",
                text: "Tier one\nTier two",
              },
            ],
          },
        ],
        autopromptString: "optimized acme docs",
        resolvedSearchType: "neural",
      });
    }) as MockFetch;

    const result = await exaSearch({
      query: "acme docs",
      contents: true,
      highlights: true,
      summary: true,
      subpages: 1,
      extras: { links: true, imageLinks: true },
    });

    expect(requestUrl).toBe("https://api.exa.ai/search");
    expect(requestInit?.headers).toEqual({
      "Content-Type": "application/json",
      "x-api-key": "exa-key",
    });
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      query: "acme docs",
      numResults: 10,
      type: "auto",
      useAutoprompt: true,
      contents: {
        text: true,
        highlights: { numSentences: 3 },
        summary: { query: "acme docs" },
        links: true,
        imageLinks: true,
        subpages: 1,
      },
    });

    expect(result.text).toContain('Optimized query: "optimized acme docs"');
    expect(result.text).toContain("[1] Acme Docs");
    expect(result.text).toContain("Published: 2026-03-01");
    expect(result.text).toContain("Author: Alice");
    expect(result.text).toContain("Score: 0.988");
    expect(result.text).toContain("Content:");
    expect(result.text).toContain("Highlights:");
    expect(result.text).toContain("Summary: Summary text");
    expect(result.text).toContain("Links: https://example.com/a, https://example.com/b");
    expect(result.text).toContain("Images: https://example.com/image.png");
    expect(result.text).toContain("Subpages (1):");
    expect(result.details).toEqual({
      provider: "exa",
      resultCount: 1,
      truncated: false,
      previews: [
        {
          domain: "example.com",
          title: "Acme Docs",
          snippet: "Summary text",
          url: "https://example.com/docs",
        },
      ],
      providerMeta: {
        autoprompt: "optimized acme docs",
        resolvedSearchType: "neural",
      },
    });

  });

  it("uses Exa-specific GitHub defaults for code search", async () => {
    process.env.EXA_API_KEY = "exa-key";

    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestInit = init;
      return jsonResponse({ results: [] });
    }) as MockFetch;

    const result = await exaCodeSearch({ query: "Promise.withResolvers" });

    expect(JSON.parse(String(requestInit?.body))).toEqual({
      query: "Promise.withResolvers",
      numResults: 10,
      type: "auto",
      useAutoprompt: true,
      livecrawl: "fallback",
      category: "github",
      contents: {
        text: true,
        highlights: { numSentences: 5, query: "Promise.withResolvers" },
      },
    });
    expect(result.text).toBe("No results found.");
    expect(result.details).toEqual({
      provider: "exa",
      resultCount: 0,
      truncated: false,
      previews: [],
      providerMeta: {
        category: "github",
        type: "auto",
      },
    });

  });

  it("throws a clear error when EXA_API_KEY is missing", async () => {
    delete process.env.EXA_API_KEY;

    await expect(exaResearchStart({ query: "test" })).rejects.toThrow(
      "EXA_API_KEY environment variable not set",
    );
  });
  it("rejects extract calls that exceed Exa's maximum URL batch size", async () => {
    process.env.EXA_API_KEY = "exa-key";

    await expect(
      exaExtract({
        urls: Array.from({ length: 101 }, (_, i) => `https://example.com/${i}`),
      }),
    ).rejects.toThrow("Exa extract accepts at most 100 URLs per call.");
  });

  it("surfaces failed research-start statuses as errors", async () => {
    process.env.EXA_API_KEY = "exa-key";

    globalThis.fetch = (async () =>
      jsonResponse({
        id: "failed_start",
        status: "failed",
        instructions: "Investigate",
        model: "exa-research-pro",
        error: "quota exceeded",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:01:00Z",
      })) as MockFetch;

    const result = await exaResearchStart({ query: "test" });

    expect(result.isError).toBe(true);
    expect(result.details).toEqual({
      provider: "exa",
      researchId: "failed_start",
      status: "failed",
      model: "exa-research-pro",
      error: "quota exceeded",
    });
    expect(result.text).toContain("Research failed to start.");
    expect(result.text).toContain("quota exceeded");
  });


  it("reports research progress truthfully while pending", async () => {
    process.env.EXA_API_KEY = "exa-key";

    globalThis.fetch = (async () =>
      jsonResponse({
        id: "research_123",
        status: "running",
        instructions: "Investigate",
        model: "exa-research-pro",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:01:00Z",
      })) as MockFetch;

    const result = await exaResearchCheck({ researchId: "research_123" });

    expect(result.text).toContain("Research is still running.");
    expect(result.details).toEqual({
      provider: "exa",
      researchId: "research_123",
      status: "running",
      complete: false,
    });
    expect(result.isError).toBeUndefined();
  });

  it("marks failed and canceled research as errors", async () => {
    process.env.EXA_API_KEY = "exa-key";

    globalThis.fetch = (async (input) => {
      if (String(input).endsWith("/failed_job")) {
        return jsonResponse({
          id: "failed_job",
          status: "failed",
          instructions: "Investigate",
          model: "exa-research-pro",
          error: "rate limited",
          createdAt: "2026-03-01T00:00:00Z",
          updatedAt: "2026-03-01T00:01:00Z",
        });
      }

      return jsonResponse({
        id: "canceled_job",
        status: "canceled",
        instructions: "Investigate",
        model: "exa-research-pro",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:01:00Z",
      });
    }) as MockFetch;

    const failed = await exaResearchCheck({ researchId: "failed_job" });
    expect(failed.text).toContain("Research failed.");
    expect(failed.text).toContain("rate limited");
    expect(failed.details).toEqual({
      provider: "exa",
      researchId: "failed_job",
      status: "failed",
      complete: true,
      error: "rate limited",
    });
    expect(failed.isError).toBe(true);

    const canceled = await exaResearchCheck({ researchId: "canceled_job" });
    expect(canceled.text).toContain("Research was canceled.");
    expect(canceled.details).toEqual({
      provider: "exa",
      researchId: "canceled_job",
      status: "canceled",
      complete: true,
      error: "Research was canceled.",
    });
    expect(canceled.isError).toBe(true);
  });

  it("includes output and parsed research data and persists truncated full output on request", async () => {
    process.env.EXA_API_KEY = "exa-key";

    const longOutput = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    globalThis.fetch = (async () =>
      jsonResponse({
        id: "completed_job",
        status: "completed",
        instructions: "Investigate",
        model: "exa-research-pro",
        output: longOutput,
        parsed: { answer: 42 },
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:01:00Z",
      })) as MockFetch;

    const result = await exaResearchCheck({
      researchId: "completed_job",
      persistFullOutput: true,
    });

    expect(result.text).toContain("Research Complete!");
    expect(result.text).toContain("Parsed Output:");
    expect(result.text).toContain('"answer": 42');
    expect(result.text).toContain("Full output saved to:");
    expect(result.details.provider).toBe("exa");
    expect(result.details.researchId).toBe("completed_job");
    expect(result.details.status).toBe("completed");
    expect(result.details.complete).toBe(true);
    expect(result.details.truncated).toBe(true);
    expect(result.details.fullOutputPath).toBeString();
    expect(existsSync(result.details.fullOutputPath!)).toBe(true);
    cleanupPaths.add(result.details.fullOutputPath!);
  });
});
