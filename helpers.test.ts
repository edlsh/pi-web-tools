import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { formatToolOutput } from "./helpers";

const cleanupPaths = new Set<string>();

afterEach(() => {
  for (const path of cleanupPaths) {
    rmSync(path, { force: true });
  }
  cleanupPaths.clear();
});

describe("web-tools truncation output persistence", () => {
  it("does not persist full output by default when truncation occurs", () => {
    const longText = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");

    const result = formatToolOutput(longText, { persistFullOutput: false });

    expect(result.truncated).toBe(true);
    expect(result.fullOutputPath).toBeUndefined();
    expect(result.output).not.toContain("Full output saved to:");
  });

  it("persists full output only when explicitly enabled", () => {
    const longText = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");

    const result = formatToolOutput(longText, { persistFullOutput: true });

    expect(result.truncated).toBe(true);
    expect(result.fullOutputPath).toBeString();
    expect(result.output).toContain("Full output saved to:");
    expect(existsSync(result.fullOutputPath!)).toBe(true);
    cleanupPaths.add(result.fullOutputPath!);
  });
});
