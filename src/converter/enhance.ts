import { generateUniqueId, LIGHTBULB_SVG, FIRE_SVG } from "./icons.js";

/**
 * Parse an attribute value from a hint opening tag.
 * e.g. <!-- @hint key="value" --> => "value"
 */
function parseAttr(line: string, key: string): string {
  const match = line.match(new RegExp(`${key}="([^"]*)"`));
  return match ? match[1] : "";
}

/**
 * Generate a Click-to-Tweet Gutenberg block.
 */
function genClickToTweet(lines: string[]): string {
  const tweet = lines.find((l) => l.trim())?.trim() ?? "";
  const escaped = tweet.replace(/"/g, '\\"');
  return `<!-- wp:bctt/clicktotweet {"tweet":"${escaped}"} /-->`;
}

/**
 * Generate a Pro Tip Gutenberg block (3 nested generateblocks).
 * Matches enhance.sh gen_protip_block() exactly.
 */
function genProTip(lines: string[]): string {
  const text = lines
    .filter((l) => l.trim())
    .map((l) => l.trim())
    .join(" ");
  const uidOuter = generateUniqueId();
  const uidInner = generateUniqueId();
  const uidHeadline = generateUniqueId();

  return [
    `<!-- wp:generateblocks/container {"uniqueId":"${uidOuter}","isDynamic":true,"blockVersion":4,"blockLabel":"ProTip","className":"protip-wrapper protip-outer-wrapper","globalClasses":["pro-tip-container","pro-tip-container-outline","content-enhancer"]} -->`,
    `<!-- wp:generateblocks/container {"uniqueId":"${uidInner}","isDynamic":true,"blockVersion":4,"className":"protip-inner-wrapper","globalClasses":["pro-tip-inner-container"]} -->`,
    `<!-- wp:generateblocks/headline {"uniqueId":"${uidHeadline}","element":"p","blockVersion":3,"hasIcon":true,"iconStyles":{"width":"2em","height":"2em","widthMobile":"1.5em","heightMobile":"1.5em"},"globalClasses":["pro-tip-text"]} -->`,
    `<p class="gb-headline gb-headline-${uidHeadline} pro-tip-text"><span class="gb-icon">${LIGHTBULB_SVG}</span><span class="gb-headline-text"><strong>Pro Tip:</strong> ${text}</span></p>`,
    `<!-- /wp:generateblocks/headline -->`,
    `<!-- /wp:generateblocks/container -->`,
    `<!-- /wp:generateblocks/container -->`,
  ].join("\n");
}

/**
 * Generate a Discount Gutenberg block (2 nested generateblocks).
 * Matches enhance.sh gen_discount_block() exactly.
 */
function genDiscount(lines: string[]): string {
  const text = lines
    .filter((l) => l.trim())
    .map((l) => l.trim())
    .join(" ");
  const uidContainer = generateUniqueId();
  const uidHeadline = generateUniqueId();

  return [
    `<!-- wp:generateblocks/container {"uniqueId":"${uidContainer}","isDynamic":true,"blockVersion":4,"className":"discount-container","metadata":{"name":"Discount Container"},"globalClasses":["discount-code-container"]} -->`,
    `<!-- wp:generateblocks/headline {"uniqueId":"${uidHeadline}","element":"p","blockVersion":3,"spacing":{"marginLeftMobile":"","paddingLeftMobile":""},"hasIcon":true,"iconStyles":{"height":"2em","width":"2em","widthMobile":"1.5em","heightMobile":"1.5em"},"metadata":{"name":"Discount Text"},"globalClasses":["discount-code-headline-text"]} -->`,
    `<p class="gb-headline gb-headline-${uidHeadline} discount-code-headline-text"><span class="gb-icon">${FIRE_SVG}</span><span class="gb-headline-text">${text}</span></p>`,
    `<!-- /wp:generateblocks/headline -->`,
    `<!-- /wp:generateblocks/container -->`,
  ].join("\n");
}

/**
 * Process @hint markers in content, converting them to Gutenberg blocks.
 *
 * State machine parser: scans line-by-line, detects `<!-- @type -->` opening
 * tags and `<!-- @end -->` closing tags, collects buffered lines between them,
 * and dispatches to the appropriate generator function.
 *
 * Runs AFTER AI stripping and BEFORE markdown-to-Gutenberg conversion.
 */
export function enhanceHints(content: string): string {
  const lines = content.split("\n");
  const output: string[] = [];
  let inBlock = "";
  let blockBuf: string[] = [];
  let blockAttrs = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect hint opening tags
    if (line.includes("<!-- @click-to-tweet")) {
      inBlock = "click-to-tweet";
      blockBuf = [];
      blockAttrs = line;
      continue;
    }
    if (line.includes("<!-- @protip")) {
      inBlock = "protip";
      blockBuf = [];
      blockAttrs = line;
      continue;
    }
    if (line.includes("<!-- @discount")) {
      inBlock = "discount";
      blockBuf = [];
      blockAttrs = line;
      continue;
    }
    // (More hint types will be added in Tasks 5 and 6)

    // End marker
    if (line.includes("<!-- @end -->") && inBlock) {
      switch (inBlock) {
        case "click-to-tweet":
          output.push(genClickToTweet(blockBuf));
          break;
        case "protip":
          output.push(genProTip(blockBuf));
          break;
        case "discount":
          output.push(genDiscount(blockBuf));
          break;
      }
      inBlock = "";
      blockBuf = [];
      blockAttrs = "";
      continue;
    }

    if (inBlock) {
      blockBuf.push(line);
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}
