import { afterEach, describe, expect, it } from "bun:test";
import { jinaExtract, jinaSearch } from "./jina";

type MockFetch = typeof fetch & ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>);

const originalFetch = globalThis.fetch;
const originalEnv = {
  JINA_API_KEY: process.env.JINA_API_KEY,
};

afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalEnv.JINA_API_KEY === undefined) {
    delete process.env.JINA_API_KEY;
  } else {
    process.env.JINA_API_KEY = originalEnv.JINA_API_KEY;
  }
});

describe("jinaSearch", () => {
  it("throws when JINA_API_KEY is missing", async () => {
    delete process.env.JINA_API_KEY;

    await expect(jinaSearch({ query: "provider neutral tools" })).rejects.toThrow(
      "JINA_API_KEY environment variable not set",
    );
  });

  it("normalizes search results and formats content, links, and images", async () => {
    process.env.JINA_API_KEY = "jina-key";
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];

    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return new Response(
        JSON.stringify({
          data: [
            {
              title: "Provider-neutral search",
              url: "https://example.com/search",
              description: "A search result description",
              content: "Normalized body content",
              links: ["https://example.com/link-1", "https://example.com/link-2"],
              images: ["https://example.com/image.png"],
            },
            {
              title: "Sparse result",
              url: "https://example.com/sparse",
              content: "No arrays here",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as MockFetch;

    const result = await jinaSearch({ query: "provider neutral tools", count: 2 });

    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe("https://s.jina.ai/");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer jina-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      q: "provider neutral tools",
      num: 2,
    });

    expect(result.details).toEqual({
      provider: "jina",
      resultCount: 2,
      truncated: false,
      previews: [
        {
          domain: "example.com",
          title: "Provider-neutral search",
          snippet: "A search result description",
          url: "https://example.com/search",
        },
        {
          domain: "example.com",
          title: "Sparse result",
          snippet: "No arrays here",
          url: "https://example.com/sparse",
        },
      ],
      providerMeta: {
        results: [
          {
            title: "Provider-neutral search",
            url: "https://example.com/search",
            content: "Normalized body content",
          },
          {
            title: "Sparse result",
            url: "https://example.com/sparse",
            content: "No arrays here",
          },
        ],
      },
    });

    expect(result.text).toContain("[1] Provider-neutral search");
    expect(result.text).toContain("URL: https://example.com/search");
    expect(result.text).toContain("Description: A search result description");
    expect(result.text).toContain("Content:\n  Normalized body content");
    expect(result.text).toContain("Links:\n  - https://example.com/link-1\n  - https://example.com/link-2");
    expect(result.text).toContain("Images:\n  - https://example.com/image.png");
    expect(result.text).toContain("[2] Sparse result");
  });
  it("throws when Jina returns an unexpected search response shape", async () => {
    process.env.JINA_API_KEY = "jina-key";

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { error: "rate limited" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as MockFetch;

    await expect(jinaSearch({ query: "provider neutral tools" })).rejects.toThrow(
      "Jina returned unexpected search response shape.",
    );
  });

});

describe("jinaSearch persistence", () => {
  it("passes persistFullOutput through truncation formatting", async () => {
    process.env.JINA_API_KEY = "jina-key";

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              title: "Long result",
              url: "https://example.com/long",
              content: Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n"),
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )) as MockFetch;

    const result = await jinaSearch({
      query: "long result",
      persistFullOutput: true,
    });

    expect(result.details.truncated).toBe(true);
    expect(result.details.fullOutputPath).toBeString();
  });
});

describe("jinaExtract", () => {
  it("fans out multi-url extraction and surfaces per-url failures truthfully", async () => {
    process.env.JINA_API_KEY = "jina-key";
    const bodies: Array<Record<string, unknown>> = [];

    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);

      if (body.url === "https://bad.example.com") {
        return new Response("upstream exploded", { status: 502 });
      }

      return new Response(
        JSON.stringify({
          data: {
            title: "Good page",
            url: body.url,
            content: "Readable page body",
            links: ["https://good.example.com/more"],
            images: ["https://good.example.com/image.png"],
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as MockFetch;

    const result = await jinaExtract({
      urls: ["https://good.example.com", "https://bad.example.com"],
    });

    expect(bodies).toEqual([{ url: "https://good.example.com" }, { url: "https://bad.example.com" }]);
    expect(result.details).toEqual({
      provider: "jina",
      urlCount: 2,
      fetchedCount: 1,
      failedCount: 1,
      truncated: false,
      previews: [
        {
          domain: "good.example.com",
          title: "Good page",
          snippet: "Readable page body",
          url: "https://good.example.com",
        },
      ],
      providerMeta: {
        successes: [
          {
            title: "Good page",
            url: "https://good.example.com",
          },
        ],
        failures: [
          {
            url: "https://bad.example.com",
            error: "Jina API error (502): upstream exploded",
          },
        ],
      },
    });

    expect(result.text).toContain("[1] Good page");
    expect(result.text).toContain("URL: https://good.example.com");
    expect(result.text).toContain("Content:\n  Readable page body");
    expect(result.text).toContain("Links:\n  - https://good.example.com/more");
    expect(result.text).toContain("Images:\n  - https://good.example.com/image.png");
    expect(result.text).toContain("Failed URLs:\n- https://bad.example.com: Jina API error (502): upstream exploded");
  });
  it("throws when every requested URL fails to extract", async () => {
    process.env.JINA_API_KEY = "jina-key";

    globalThis.fetch = (async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(`boom for ${String(body.url)}`, { status: 502 });
    }) as MockFetch;

    await expect(
      jinaExtract({ urls: ["https://a.example.com", "https://b.example.com"] }),
    ).rejects.toThrow("Jina extract failed for all requested URLs.");
  });

});
