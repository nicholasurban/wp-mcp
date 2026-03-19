import { describe, it, expect } from "vitest";
import { inlineFormat } from "../converter/inline.js";
import { markdownToGutenberg } from "../converter/markdown.js";
import { stripAiCommentary } from "../converter/strip.js";
import { enhanceHints, normalizeBareHints } from "../converter/enhance.js";

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

describe("markdownToGutenberg", () => {
  it("converts H2 heading", () => {
    const result = markdownToGutenberg("## Hello World");
    expect(result).toContain("<!-- wp:heading -->");
    expect(result).toContain('<h2 class="wp-block-heading">Hello World</h2>');
    expect(result).toContain("<!-- /wp:heading -->");
  });

  it("converts H3 heading with level attribute", () => {
    const result = markdownToGutenberg("### Sub Heading");
    expect(result).toContain('<!-- wp:heading {"level":3} -->');
    expect(result).toContain("<h3");
  });

  it("converts paragraph", () => {
    const result = markdownToGutenberg("Just a paragraph.");
    expect(result).toContain("<!-- wp:paragraph -->");
    expect(result).toContain("<p>Just a paragraph.</p>");
  });

  it("converts unordered list", () => {
    const result = markdownToGutenberg("- Item A\n- Item B");
    expect(result).toContain("<!-- wp:list -->");
    expect(result).toContain("<!-- wp:list-item --><li>Item A</li><!-- /wp:list-item -->");
  });

  it("converts ordered list", () => {
    const result = markdownToGutenberg("1. First\n2. Second");
    expect(result).toContain('<!-- wp:list {"ordered":true} -->');
    expect(result).toContain("<ol");
  });

  it("converts image", () => {
    const result = markdownToGutenberg("![alt text](https://example.com/img.jpg)");
    expect(result).toContain("<!-- wp:image");
    expect(result).toContain('src="https://example.com/img.jpg"');
    expect(result).toContain('alt="alt text"');
  });

  it("converts blockquote", () => {
    const result = markdownToGutenberg("> A wise quote");
    expect(result).toContain("<!-- wp:quote -->");
    expect(result).toContain("<blockquote");
  });

  it("converts code block", () => {
    const result = markdownToGutenberg("```\nconst x = 1;\n```");
    expect(result).toContain("<!-- wp:code -->");
    expect(result).toContain("const x = 1;");
  });

  it("strips H1 lines", () => {
    const result = markdownToGutenberg("# Title\n\n## Real Heading");
    expect(result).not.toContain("<h1");
    expect(result).toContain("<h2");
  });

  it("passes through raw Gutenberg blocks", () => {
    const raw = '<!-- wp:paragraph -->\n<p>Already Gutenberg</p>\n<!-- /wp:paragraph -->';
    const result = markdownToGutenberg(raw);
    expect(result).toContain(raw);
  });

  it("converts markdown table to wp:table", () => {
    const md = "| Name | Score |\n| --- | --- |\n| Alice | 95 |\n| Bob | 87 |";
    const result = markdownToGutenberg(md);
    expect(result).toContain("<!-- wp:table -->");
    expect(result).toContain("<table>");
    expect(result).toContain("<th>Name</th>");
    expect(result).toContain("<td>Alice</td>");
  });

  it("wraps shortcodes in wp:shortcode blocks", () => {
    const result = markdownToGutenberg("[otr_transcript]\nContent here\n[/otr_transcript]");
    expect(result).toContain("<!-- wp:shortcode -->");
    expect(result).toContain("[otr_transcript]");
  });

  it("applies inline formatting inside paragraphs", () => {
    const result = markdownToGutenberg("Text with **bold** word.");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("handles heading with CSS class suffix", () => {
    const result = markdownToGutenberg("## Transcript {.podcast-transcript}");
    expect(result).toContain("podcast-transcript");
    expect(result).not.toContain("{.podcast-transcript}");
  });
});

describe("stripAiCommentary", () => {
  it("removes preamble", () => {
    const input = "Sure, here is the article:\n\n## Real Content\n\nParagraph.";
    const result = stripAiCommentary(input);
    expect(result.startsWith("## Real Content")).toBe(true);
  });

  it("removes postamble", () => {
    const input = "## Content\n\nParagraph.\n\nLet me know if you'd like changes!";
    const result = stripAiCommentary(input);
    expect(result).not.toContain("Let me know");
  });

  it("removes both preamble and postamble", () => {
    const input = "Certainly! Here's the article.\n\n## Heading\n\nBody.\n\nWould you like me to revise?";
    const result = stripAiCommentary(input);
    expect(result.startsWith("## Heading")).toBe(true);
    expect(result.endsWith("Body.")).toBe(true);
  });

  it("leaves clean content unchanged", () => {
    const input = "## Heading\n\nParagraph.";
    expect(stripAiCommentary(input)).toBe(input);
  });

  it("preserves raw Gutenberg blocks", () => {
    const input = "Here is the content:\n\n<!-- wp:paragraph -->\n<p>Block</p>\n<!-- /wp:paragraph -->";
    const result = stripAiCommentary(input);
    expect(result.startsWith("<!-- wp:paragraph -->")).toBe(true);
  });
});

describe("enhanceHints", () => {
  it("converts click-to-tweet hint", () => {
    const input = "<!-- @click-to-tweet -->\nTweetable quote here\n<!-- @end -->";
    const result = enhanceHints(input);
    expect(result).toContain("wp:bctt/clicktotweet");
    expect(result).toContain("Tweetable quote here");
    expect(result).not.toContain("@click-to-tweet");
  });

  it("converts protip hint", () => {
    const input = "<!-- @protip -->\nThis is a tip\n<!-- @end -->";
    const result = enhanceHints(input);
    expect(result).toContain("wp:generateblocks/container");
    expect(result).toContain("protip-wrapper");
    expect(result).toContain("<strong>Pro Tip:</strong> This is a tip");
  });

  it("converts discount hint", () => {
    const input = "<!-- @discount -->\nUse code SAVE20 for 20% off\n<!-- @end -->";
    const result = enhanceHints(input);
    expect(result).toContain("discount-container");
    expect(result).toContain("Use code SAVE20 for 20% off");
  });

  it("passes non-hint content through unchanged", () => {
    const input = "## Regular Heading\n\nRegular paragraph.";
    expect(enhanceHints(input)).toBe(input);
  });

  it("converts FAQ hint", () => {
    const input = "<!-- @faq -->\n**Q: What is this?**\n**A:** An answer.\n**Q: Why?**\n**A:** Because.\n<!-- @end -->";
    const result = enhanceHints(input);
    expect(result).toContain("wp:rank-math/faq-block");
    expect(result).toContain("What is this?");
    expect(result).toContain("An answer.");
  });

  it("converts CTA hint (self-closing)", () => {
    const input = '<!-- @cta url="https://example.com" text="Buy Now" sponsored="true" -->';
    const result = enhanceHints(input);
    expect(result).toContain("wp:generateblocks/button");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("Buy Now");
    expect(result).toContain('rel="sponsored"');
  });

  it("converts key-takeaways hint", () => {
    const input = "<!-- @key-takeaways -->\n- First point\n- Second point\n<!-- @end -->";
    const result = enhanceHints(input);
    expect(result).toContain("accordion");
    expect(result).toContain("Key Takeaways");
    expect(result).toContain("First point");
  });

  it("converts jump-links hint", () => {
    const input = '<!-- @jump-links title="Top Picks" -->\n- **Product A** — Best overall\n- **Product B** — Budget pick\n<!-- @end -->';
    const result = enhanceHints(input);
    expect(result).toContain("intro-box-overview");
    expect(result).toContain("Top Picks");
    expect(result).toContain("<strong>Product A</strong>");
  });

  it("converts data-lab hint", () => {
    const input = '<!-- @data-lab title="Test Data" columns="Name,Score" -->\nAlice,95\nBob,87\n<!-- @end -->';
    const result = enhanceHints(input);
    expect(result).toContain("wp:outliyr/data-lab");
    expect(result).toContain("Test Data");
    expect(result).toContain("Name,Score");
  });

  it("converts product-roundup hint with sub-sections", () => {
    const input = [
      '<!-- @product-roundup id="prod1" name="Cool Product" -->',
      '<!-- @accolade -->Best Overall<!-- @end-accolade -->',
      '<!-- @image -->https://example.com/img.jpg<!-- @end-image -->',
      '<!-- @stats -->',
      '- **Price:** $99',
      '- **Rating:** 5/5',
      '<!-- @end-stats -->',
      '<!-- @cta url="https://example.com" text="Buy" sponsored="true" -->',
      '<!-- @discount -->Use code SAVE<!-- @end-discount -->',
      '<!-- @end-product -->',
    ].join("\n");
    const result = enhanceHints(input);
    expect(result).toContain("product-roundup-container");
    expect(result).toContain("Cool Product");
    expect(result).toContain('id="prod1"');
    expect(result).toContain("Best Overall");
    expect(result).toContain("$99");
  });
});

describe("normalizeBareHints", () => {
  it("converts bare @key-takeaways to HTML comment", () => {
    expect(normalizeBareHints("@key-takeaways")).toBe("<!-- @key-takeaways -->");
  });

  it("converts <p>@faq</p> to HTML comment", () => {
    expect(normalizeBareHints("<p>@faq</p>")).toBe("<!-- @faq -->");
  });

  it("converts bare @end to HTML comment", () => {
    expect(normalizeBareHints("@end")).toBe("<!-- @end -->");
  });

  it("converts bare @end-product to HTML comment", () => {
    expect(normalizeBareHints("@end-product")).toBe("<!-- @end-product -->");
  });

  it("converts bare @cta with attributes", () => {
    const input = '@cta url="https://example.com" text="Buy Now" sponsored="true"';
    expect(normalizeBareHints(input)).toBe('<!-- @cta url="https://example.com" text="Buy Now" sponsored="true" -->');
  });

  it("converts <p>@cta</p> with attributes inside p tags", () => {
    const input = '<p>@cta url="https://example.com" text="Buy" sponsored="true"</p>';
    expect(normalizeBareHints(input)).toBe('<!-- @cta url="https://example.com" text="Buy" sponsored="true" -->');
  });

  it("skips lines already containing HTML comments", () => {
    const input = "<!-- @key-takeaways -->";
    expect(normalizeBareHints(input)).toBe(input);
  });

  it("leaves email addresses unchanged", () => {
    const input = "Contact user@example.com for details";
    expect(normalizeBareHints(input)).toBe(input);
  });

  it("leaves unknown @words unchanged", () => {
    const input = "@randomword is not a hint";
    expect(normalizeBareHints(input)).toBe(input);
  });

  it("does not match hint names as substrings (e.g. @faq.com)", () => {
    expect(normalizeBareHints("@faq.com")).toBe("@faq.com");
    expect(normalizeBareHints("@discount-code")).toBe("@discount-code");
  });

  it("skips bare hints inside code fences", () => {
    const input = "```\n@key-takeaways\n```";
    expect(normalizeBareHints(input)).toBe(input);
  });

  it("converts bare sub-section hints (accolade, image, stats)", () => {
    expect(normalizeBareHints("@accolade")).toBe("<!-- @accolade -->");
    expect(normalizeBareHints("@image")).toBe("<!-- @image -->");
    expect(normalizeBareHints("@stats")).toBe("<!-- @stats -->");
  });

  it("converts bare sub-section closers", () => {
    expect(normalizeBareHints("@end-accolade")).toBe("<!-- @end-accolade -->");
    expect(normalizeBareHints("@end-image")).toBe("<!-- @end-image -->");
    expect(normalizeBareHints("@end-stats")).toBe("<!-- @end-stats -->");
    expect(normalizeBareHints("@end-discount")).toBe("<!-- @end-discount -->");
  });

  it("handles multiline content with mixed bare and comment hints", () => {
    const input = [
      "## Heading",
      "@key-takeaways",
      "- Item one",
      "- Item two",
      "@end",
      "",
      "<!-- @faq -->",
      "## Question?",
      "Answer.",
      "<!-- @end -->",
    ].join("\n");
    const result = normalizeBareHints(input);
    expect(result).toContain("<!-- @key-takeaways -->");
    expect(result).toContain("<!-- @end -->");
    expect(result).toContain("<!-- @faq -->");
  });

  it("end-to-end: bare hints normalize then enhance to Gutenberg", () => {
    const input = "@key-takeaways\n- First point\n- Second point\n@end";
    const normalized = normalizeBareHints(input);
    const enhanced = enhanceHints(normalized);
    expect(enhanced).toContain("accordion");
    expect(enhanced).toContain("Key Takeaways");
    expect(enhanced).toContain("First point");
    expect(enhanced).toContain("Second point");
  });
});
