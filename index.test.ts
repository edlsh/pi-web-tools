import { beforeAll, describe, expect, mock, test } from "bun:test";

class MockText {
  constructor(private text = "") {}
  render() {
    return this.text.split("\n");
  }
  setText(text: string) {
    this.text = text;
  }
}

class MockSpacer {
  constructor(private height = 1) {}
  render() {
    return Array.from({ length: this.height }, () => "");
  }
}

class MockContainer {
  private children: Array<{ render: () => string[] }> = [];
  addChild(child: { render: () => string[] }) {
    this.children.push(child);
  }
  clear() {
    this.children = [];
  }
  invalidate() {}
  render() {
    return this.children.flatMap((child) => child.render());
  }
}

type RegisteredTool = {
  name: string;
  parameters?: any;
  renderResult: (result: any, options: any, theme: any, context?: any) => any;
};

beforeAll(() => {
  mock.module("@mariozechner/pi-coding-agent", () => ({
    keyHint: (_key: string, description: string) => description,
  }));

  mock.module("@mariozechner/pi-ai", () => ({
    StringEnum: (values: readonly string[], options?: Record<string, unknown>) => ({ values, ...options }),
  }));

  mock.module("@mariozechner/pi-tui", () => ({
    Container: MockContainer,
    Spacer: MockSpacer,
    Text: MockText,
  }));

  mock.module("@sinclair/typebox", () => ({
    Type: {
      Object: (value: unknown) => value,
      String: (value?: unknown) => value,
      Optional: (value: unknown) => value,
      Array: (value: unknown) => value,
      Union: (value: unknown) => value,
      Boolean: (value?: unknown) => value,
      Number: (value?: unknown) => value,
    },
  }));
});

async function setupTools() {
  const { default: webToolsExtension } = await import("./index");
  const tools = new Map<string, RegisteredTool>();
  webToolsExtension({
    on() {},
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
  } as any);
  return tools;
}

function createTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  };
}

describe("web-tools inline previews", () => {
  test("renders compact search previews with domains and titles when collapsed", async () => {
    const tools = await setupTools();
    const tool = tools.get("web_search");
    if (!tool) throw new Error("web_search tool not registered");

    const component = tool.renderResult(
      {
        content: [{ type: "text", text: "full search output" }],
        details: {
          provider: "jina",
          resultCount: 3,
          truncated: false,
          previews: [
            {
              domain: "example.com",
              title: "Provider-neutral search",
              snippet: "Normalized body content for the first result.",
              url: "https://example.com/search",
            },
            {
              domain: "docs.example.com",
              title: "Reference docs",
              snippet: "API surface and usage notes.",
              url: "https://docs.example.com/reference",
            },
            {
              domain: "blog.example.com",
              title: "Release post",
              snippet: "Announcement and rollout summary.",
              url: "https://blog.example.com/release",
            },
          ],
        },
      },
      { expanded: false, isPartial: false },
      createTheme(),
    ) as MockContainer;

    const rendered = component.render().join("\n");
    expect(rendered).toContain("Jina: 3 results");
    expect(rendered).toContain("example.com — Provider-neutral search");
    expect(rendered).toContain("docs.example.com — Reference docs");
    expect(rendered).toContain("+1 more");
    expect(rendered).not.toContain("https://example.com/search");
    expect(rendered).not.toContain("Normalized body content for the first result.");
    expect(rendered).not.toContain("─ Domains ─");
  });

  test("uses singular summary labels for single-result search tools", async () => {
    const tools = await setupTools();
    const theme = createTheme();

    const search = tools.get("web_search");
    const similar = tools.get("web_find_similar");
    const code = tools.get("web_code_search");
    if (!search || !similar || !code) throw new Error("search tools not registered");

    const searchRendered = (search.renderResult(
      {
        content: [{ type: "text", text: "search output" }],
        details: { provider: "exa", resultCount: 1, truncated: false },
      },
      { expanded: false, isPartial: false },
      theme,
    ) as MockText).render().join("\n");

    const similarRendered = (similar.renderResult(
      {
        content: [{ type: "text", text: "similar output" }],
        details: { provider: "exa", resultCount: 1, truncated: false },
      },
      { expanded: false, isPartial: false },
      theme,
    ) as MockText).render().join("\n");

    const codeRendered = (code.renderResult(
      {
        content: [{ type: "text", text: "code output" }],
        details: { provider: "exa", resultCount: 1, truncated: false },
      },
      { expanded: false, isPartial: false },
      theme,
    ) as MockText).render().join("\n");

    expect(searchRendered).toBe("Exa: 1 result · expand");
    expect(similarRendered).toBe("Exa: 1 similar page · expand");
    expect(codeRendered).toBe("Exa: 1 code result · expand");
  });

  test("renders full text when expanded and truncates after the configured line budget", async () => {
    const tools = await setupTools();
    const tool = tools.get("web_search");
    if (!tool) throw new Error("web_search tool not registered");

    const expandedText = Array.from({ length: 35 }, (_, i) => `line ${i + 1}`).join("\n");
    const component = tool.renderResult(
      {
        content: [{ type: "text", text: expandedText }],
        details: {
          provider: "exa",
          resultCount: 1,
          truncated: false,
        },
      },
      { expanded: true, isPartial: false },
      createTheme(),
    ) as MockText;

    const rendered = component.render().join("\n");
    expect(rendered.split("\n")[0]).toBe("Exa: 1 result");
    expect(rendered).toContain("line 1");
    expect(rendered).toContain("line 30");
    expect(rendered).not.toContain("line 31");
    expect(rendered).toContain("...");
  });

  test("renders compact extract previews and collapses overflow into a more counter", async () => {
    const tools = await setupTools();
    const tool = tools.get("web_extract");
    if (!tool) throw new Error("web_extract tool not registered");

    const component = tool.renderResult(
      {
        content: [{ type: "text", text: "full extract output" }],
        details: {
          provider: "tavily",
          urlCount: 4,
          fetchedCount: 4,
          truncated: false,
          previews: [
            { domain: "a.example.com", title: "A", snippet: "Alpha body", url: "https://a.example.com" },
            { domain: "b.example.com", title: "B", snippet: "Beta body", url: "https://b.example.com" },
            { domain: "c.example.com", title: "C", snippet: "Gamma body", url: "https://c.example.com" },
            { domain: "d.example.com", title: "D", snippet: "Delta body", url: "https://d.example.com" },
          ],
        },
      },
      { expanded: false, isPartial: false },
      createTheme(),
    ) as MockContainer;

    const rendered = component.render().join("\n");
    expect(rendered).toContain("Tavily: 4/4 pages fetched");
    expect(rendered).toContain("a.example.com — A");
    expect(rendered).toContain("b.example.com — B");
    expect(rendered).toContain("+2 more");
    expect(rendered).not.toContain("https://a.example.com");
    expect(rendered).not.toContain("Alpha body");
    expect(rendered).not.toContain("─ Content Preview ─");
    expect(rendered).not.toContain("d.example.com — D");
  });
});

describe("web-tools schemas", () => {
  test("advertises only research-capable providers for research tools", async () => {
    const tools = await setupTools();
    const start = tools.get("web_research_start");
    const check = tools.get("web_research_check");
    if (!start || !check) throw new Error("research tools not registered");

    expect(start.parameters?.provider?.values).toEqual(["exa", "tavily"]);
    expect(check.parameters?.provider?.values).toEqual(["exa", "tavily"]);
  });
});
