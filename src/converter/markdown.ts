import { inlineFormat } from "./inline.js";

/**
 * Convert markdown text to WordPress Gutenberg block markup.
 * Line-by-line parser with state tracking for code blocks, lists, tables,
 * Gutenberg passthrough, and shortcodes.
 */
export function markdownToGutenberg(input: string): string {
  const lines = input.split("\n");
  const output: string[] = [];

  // State tracking
  let inCode = false;
  let codeLines: string[] = [];
  let inList = false;
  let listOrdered = false;
  let listItems: string[] = [];
  let inTable = false;
  let tableHeaderRow: string[] = [];
  let tableDataRows: string[][] = [];
  let inGutenbergBlock = 0; // depth counter for nested blocks
  let gutenbergLines: string[] = [];
  let inShortcode = false;
  let shortcodeTag = "";
  let shortcodeLines: string[] = [];
  let inBlockquote = false;
  let blockquoteLines: string[] = [];

  function flushList(): void {
    if (!inList) return;
    const tag = listOrdered ? "ol" : "ul";
    const attrs = listOrdered ? ' {"ordered":true}' : "";
    const items = listItems
      .map((item) => `<!-- wp:list-item --><li>${inlineFormat(item)}</li><!-- /wp:list-item -->`)
      .join("");
    output.push(`<!-- wp:list${attrs} -->`);
    output.push(`<${tag}>${items}</${tag}>`);
    output.push("<!-- /wp:list -->");
    output.push("");
    inList = false;
    listItems = [];
  }

  function flushTable(): void {
    if (!inTable) return;
    const headerCells = tableHeaderRow
      .map((h) => `<th>${inlineFormat(h.trim())}</th>`)
      .join("");
    const bodyRows = tableDataRows
      .map((row) => {
        const cells = row.map((d) => `<td>${inlineFormat(d.trim())}</td>`).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    output.push("<!-- wp:table -->");
    output.push(
      `<figure class="wp-block-table"><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></figure>`
    );
    output.push("<!-- /wp:table -->");
    output.push("");
    inTable = false;
    tableHeaderRow = [];
    tableDataRows = [];
  }

  function flushBlockquote(): void {
    if (!inBlockquote) return;
    const text = blockquoteLines.map((l) => inlineFormat(l)).join("<br>");
    output.push("<!-- wp:quote -->");
    output.push(
      `<blockquote class="wp-block-quote"><p>${text}</p></blockquote>`
    );
    output.push("<!-- /wp:quote -->");
    output.push("");
    inBlockquote = false;
    blockquoteLines = [];
  }

  function flushAll(): void {
    flushBlockquote();
    flushList();
    flushTable();
  }

  function parseTableRow(line: string): string[] {
    // Split "| A | B |" into ["A", "B"]
    return line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function isTableSeparator(line: string): boolean {
    return /^\|[\s\-:|]+\|$/.test(line.trim());
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- Gutenberg passthrough ---
    if (inGutenbergBlock > 0) {
      gutenbergLines.push(line);
      if (/^<!-- wp:/.test(line) && !/^<!-- \/wp:/.test(line) && !/\/-->$/.test(line)) {
        inGutenbergBlock++;
      }
      if (/^<!-- \/wp:/.test(line)) {
        inGutenbergBlock--;
        if (inGutenbergBlock === 0) {
          output.push(gutenbergLines.join("\n"));
          gutenbergLines = [];
        }
      }
      continue;
    }
    if (/^<!-- wp:/.test(line)) {
      flushAll();
      if (/\/-->$/.test(line)) {
        // Self-closing block (e.g. <!-- wp:separator /-->), emit directly
        output.push(line);
        output.push("");
        continue;
      }
      inGutenbergBlock = 1;
      gutenbergLines = [line];
      continue;
    }

    // --- Code fences ---
    if (/^```/.test(line)) {
      if (!inCode) {
        flushAll();
        inCode = true;
        codeLines = [];
      } else {
        const code = escapeHtml(codeLines.join("\n"));
        output.push("<!-- wp:code -->");
        output.push(
          `<pre class="wp-block-code"><code>${code}</code></pre>`
        );
        output.push("<!-- /wp:code -->");
        output.push("");
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // --- Shortcode blocks ---
    if (inShortcode) {
      shortcodeLines.push(line);
      const closePattern = new RegExp(`^\\[/${shortcodeTag}\\]`);
      if (closePattern.test(line.trim())) {
        output.push("<!-- wp:shortcode -->");
        output.push(shortcodeLines.join("\n"));
        output.push("<!-- /wp:shortcode -->");
        output.push("");
        inShortcode = false;
        shortcodeTag = "";
        shortcodeLines = [];
      }
      continue;
    }
    // Detect opening shortcode (paired shortcode like [tag]...[/tag])
    const shortcodeOpenMatch = line.trim().match(/^\[(\w+)[\s\]]/);
    if (shortcodeOpenMatch) {
      // Check if there's a closing tag somewhere later in the input
      const tag = shortcodeOpenMatch[1];
      const hasClosing = lines.slice(i + 1).some((l) => l.trim().startsWith(`[/${tag}]`));
      if (hasClosing) {
        flushAll();
        inShortcode = true;
        shortcodeTag = tag;
        shortcodeLines = [line];
        continue;
      }
      // Also check if the closing tag is on the same line
      if (line.includes(`[/${tag}]`)) {
        flushAll();
        output.push("<!-- wp:shortcode -->");
        output.push(line);
        output.push("<!-- /wp:shortcode -->");
        output.push("");
        continue;
      }
    }

    // --- Table rows ---
    if (/^\|.*\|/.test(line.trim())) {
      if (!inTable) {
        flushAll();
        inTable = true;
        tableHeaderRow = parseTableRow(line);
        tableDataRows = [];
      } else if (isTableSeparator(line)) {
        // Skip separator row
        continue;
      } else {
        tableDataRows.push(parseTableRow(line));
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // --- Blockquote ---
    const blockquoteMatch = line.match(/^>\s?(.*)/);
    if (blockquoteMatch) {
      if (!inBlockquote) {
        flushList();
      }
      inBlockquote = true;
      blockquoteLines.push(blockquoteMatch[1]);
      continue;
    } else if (inBlockquote) {
      flushBlockquote();
    }

    // --- Blank line ---
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // --- H1 — strip (title set separately) ---
    if (/^#\s+/.test(line)) {
      flushAll();
      continue;
    }

    // --- Headings H2–H6 ---
    const headingMatch = line.match(/^(#{2,6})\s+(.*)/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      let text = headingMatch[2];

      // Parse optional CSS class suffix: {.classname}
      let className = "";
      const classMatch = text.match(/\s*\{\.([^}]+)\}\s*$/);
      if (classMatch) {
        className = classMatch[1];
        text = text.replace(/\s*\{\.([^}]+)\}\s*$/, "").trim();
      }

      // Build the wp:heading comment attrs
      const attrs: Record<string, unknown> = {};
      if (level > 2) attrs.level = level;
      if (className) attrs.className = className;

      const attrsStr = Object.keys(attrs).length > 0
        ? ` ${JSON.stringify(attrs)}`
        : "";

      const classAttr = className
        ? `wp-block-heading ${className}`
        : "wp-block-heading";

      output.push(`<!-- wp:heading${attrsStr} -->`);
      output.push(
        `<h${level} class="${classAttr}">${inlineFormat(text)}</h${level}>`
      );
      output.push("<!-- /wp:heading -->");
      output.push("");
      continue;
    }

    // --- Image ---
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      flushAll();
      const alt = imageMatch[1];
      const src = imageMatch[2];
      output.push('<!-- wp:image {"sizeSlug":"large"} -->');
      output.push(
        `<figure class="wp-block-image size-large"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"/></figure>`
      );
      output.push("<!-- /wp:image -->");
      output.push("");
      continue;
    }

    // --- Unordered list ---
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    if (ulMatch) {
      if (inList && listOrdered) {
        flushList();
      }
      if (!inList) {
        inList = true;
        listOrdered = false;
        listItems = [];
      }
      listItems.push(ulMatch[1]);
      continue;
    }

    // --- Ordered list ---
    const olMatch = line.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      if (inList && !listOrdered) {
        flushList();
      }
      if (!inList) {
        inList = true;
        listOrdered = true;
        listItems = [];
      }
      listItems.push(olMatch[1]);
      continue;
    }

    // --- Default: paragraph ---
    flushList();
    output.push("<!-- wp:paragraph -->");
    output.push(`<p>${inlineFormat(line)}</p>`);
    output.push("<!-- /wp:paragraph -->");
    output.push("");
  }

  // Flush any remaining state
  flushAll();

  // Clean up trailing blank lines and join
  const result = output.join("\n").replace(/\n+$/, "");
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
