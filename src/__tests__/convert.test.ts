import { describe, it, expect } from "vitest";
import { inlineFormat } from "../converter/inline.js";

describe("inlineFormat", () => {
  it("converts bold", () => {
    expect(inlineFormat("Hello **world**")).toBe("Hello <strong>world</strong>");
  });
  it("converts italic", () => {
    expect(inlineFormat("Hello *world*")).toBe("Hello <em>world</em>");
  });
  it("converts inline code", () => {
    expect(inlineFormat("Use `npm install`")).toBe("Use <code>npm install</code>");
  });
  it("converts links", () => {
    expect(inlineFormat("[click](https://example.com)")).toBe('<a href="https://example.com">click</a>');
  });
  it("handles multiple formats in one line", () => {
    expect(inlineFormat("**bold** and *italic*")).toBe("<strong>bold</strong> and <em>italic</em>");
  });
  it("returns plain text unchanged", () => {
    expect(inlineFormat("no formatting here")).toBe("no formatting here");
  });
});
