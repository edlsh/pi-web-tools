# pi-web-tools

Web search and retrieval tools for Pi coding agent with provider-aware routing across Exa, Jina, and Tavily.

This package is published on npm as `@edlsh/pi-web-tools`.
This package is a Pi extension package. It is not intended to be imported as a standalone general-purpose library.

## What it adds

This package registers six Pi tools:

- `web_search` — search the web
- `web_extract` — extract readable page content from one or more URLs
- `web_research_start` — start an asynchronous research job
- `web_research_check` — check research job status
- `web_find_similar` — find pages similar to a source URL with Exa
- `web_code_search` — search GitHub-oriented code/docs results with Exa

The tool layer keeps provider-specific details behind one consistent interface while still exposing provider option blocks when you need them.

## Provider routing

Supported providers and API keys:

- `EXA_API_KEY`
- `JINA_API_KEY`
- `TAVILY_API_KEY`

A `.env.example` file in this repo documents the expected variables. The extension itself does not auto-load `.env`; export the values in your shell or use your own env-management tool.

When `provider` is omitted, `web_search`, `web_extract`, and `web_research_start` auto-select the first configured compatible provider in this priority order:

1. `exa`
2. `jina`
3. `tavily`

`web_research_check` is stricter: if more than one configured provider supports research, you must pass `provider` explicitly because research IDs are provider-specific.

## Install

```bash
pi install npm:@edlsh/pi-web-tools
```

Then restart Pi so it reloads extensions.

## Minimal usage

### Search

```typescript
web_search({
  query: "latest zig comptime features",
  maxResults: 5
})
```

### Extract

```typescript
web_extract({
  urls: ["https://example.com/article"],
  provider: "tavily"
})
```

### Research lifecycle

```typescript
const start = web_research_start({
  provider: "exa",
  query: "State of AI infrastructure spending in 2026"
});

web_research_check({
  provider: "exa",
  researchId: start.details.researchId
})
```

### Exa-only similarity and code search

```typescript
web_find_similar({
  url: "https://example.com/reference",
  numResults: 5
})

web_code_search({
  query: "Promise.withResolvers",
  numResults: 10
})
```

## Provider-specific options

Each multi-provider tool accepts only the option block that matches the resolved provider. For example:

```typescript
web_search({
  query: "AI chip supply chain",
  exa: {
    livecrawl: "fallback",
    highlights: true
  }
})
```

If the resolved provider is not `exa`, the tool returns a validation error instead of silently ignoring those options.

## TUI behavior

Collapsed tool results are intentionally compact:

- one summary line
- one compact preview line when previewable results exist
- expanded mode still shows the fuller text payload

That keeps Pi sessions readable while preserving the detailed output behind expansion.

## Development

Run the test suite:

```bash
bun test
```

Inspect the publish payload:

```bash
npm run pack:check
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
