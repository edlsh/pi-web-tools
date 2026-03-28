import { describe, expect, it } from "bun:test";
import { getConfiguredProviders, resolveProvider, validateProviderOptions } from "./providers";

describe("web-tools provider selection", () => {
  it("lists configured providers in stable order", () => {
    const configured = getConfiguredProviders({
      EXA_API_KEY: " exa-key ",
      JINA_API_KEY: "",
      TAVILY_API_KEY: " tavily-key ",
    });

    expect(configured).toEqual(["exa", "tavily"]);
  });

  it("auto-selects the sole configured provider for a shared capability", () => {
    const provider = resolveProvider({
      capability: "search",
      env: { TAVILY_API_KEY: "tvly-key" },
    });

    expect(provider).toBe("tavily");
  });

  it("auto-selects the sole configured provider that supports a provider-specific capability", () => {
    const provider = resolveProvider({
      capability: "codeSearch",
      env: {
        EXA_API_KEY: "exa-key",
        TAVILY_API_KEY: "tvly-key",
      },
    });

    expect(provider).toBe("exa");
  });

  it("auto-selects the first configured provider by priority when multiple support a capability", () => {
    const provider = resolveProvider({
      capability: "search",
      env: {
        EXA_API_KEY: "exa-key",
        TAVILY_API_KEY: "tvly-key",
      },
    });

    expect(provider).toBe("exa");
  });

  it("rejects a configured provider that does not support the requested capability", () => {
    expect(() =>
      resolveProvider({
        capability: "research",
        provider: "jina",
        env: { JINA_API_KEY: "jina-key" },
      }),
    ).toThrow("Provider \"jina\" does not support research. Supported providers: exa, tavily.");
  });

  it("rejects an explicitly selected provider that is not configured", () => {
    expect(() =>
      resolveProvider({
        capability: "extract",
        provider: "exa",
        env: { TAVILY_API_KEY: "tvly-key" },
      }),
    ).toThrow('Provider "exa" is not configured. Set EXA_API_KEY.');
  });

  it("rejects provider option blocks for the wrong provider", () => {
    expect(() =>
      validateProviderOptions("tavily", {
        exa: { livecrawl: "always" },
      }),
    ).toThrow(
      'Provider-specific options for "exa" cannot be used when the resolved provider is "tavily".',
    );
  });

  it("requires an explicit provider when ambiguity is not allowed", () => {
    expect(() =>
      resolveProvider({
        capability: "research",
        env: {
          EXA_API_KEY: "exa-key",
          TAVILY_API_KEY: "tvly-key",
        },
        requireExplicitWhenMultiple: true,
      }),
    ).toThrow('Multiple configured providers support research. Choose one explicitly: exa, tavily.');
  });

  it("still auto-selects the sole configured provider when ambiguity checks are enabled", () => {
    const provider = resolveProvider({
      capability: "research",
      env: { TAVILY_API_KEY: "tvly-key" },
      requireExplicitWhenMultiple: true,
    });

    expect(provider).toBe("tavily");
  });

  it("allows only the resolved provider option block", () => {
    expect(
      validateProviderOptions("exa", {
        exa: { livecrawl: "fallback" },
      }),
    ).toEqual({
      exa: { livecrawl: "fallback" },
    });
  });
});
