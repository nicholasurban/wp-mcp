import {
  generateUniqueId,
  LIGHTBULB_SVG,
  FIRE_SVG,
  ARROW_SVG,
  STAR_SVG,
} from "./icons.js";

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
 * Uses EXACT template from reusable block 40521 — only text content changes.
 * UniqueIds, globalClasses, and all attributes are locked to the template.
 */
function genProTip(lines: string[]): string {
  const text = lines
    .filter((l) => l.trim())
    .map((l) => l.trim())
    .join(" ");

  return [
    `<!-- wp:generateblocks/container {"uniqueId":"8766bab4","isDynamic":true,"blockVersion":4,"blockLabel":"ProTip","className":"protip-wrapper protip-outer-wrapper","metadata":{"name":"Pro Tip"},"globalClasses":["pro-tip-container"]} -->`,
    `<!-- wp:generateblocks/container {"uniqueId":"d43560c2","isDynamic":true,"blockVersion":4,"className":"protip-wrapper protip-inner-wrapper","globalClasses":["pro-tip-container-inner"]} -->`,
    `<!-- wp:generateblocks/headline {"uniqueId":"c1e5fdf3","element":"p","blockVersion":3,"display":"flex","displayMobile":"inline-flex","flexDirectionMobile":"row","alignItems":"flex-start","alignItemsMobile":"flex-start","columnGap":"0.5em","columnGapMobile":"0em","spacing":{"marginBottom":"0px"},"linkColor":"var(\\u002d\\u002daccent)","hasIcon":true,"iconStyles":{"height":"1.5em","width":"1.5em","paddingTop":"0px","paddingTopMobile":"0px","paddingLeftMobile":"0px","paddingRightMobile":"5px"},"globalClasses":["pro-tip-text"]} -->`,
    `<p class="gb-headline gb-headline-c1e5fdf3 pro-tip-text"><span class="gb-icon">${LIGHTBULB_SVG}</span><span class="gb-headline-text"><strong>Pro Tip:</strong> ${text}</span></p>`,
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
 * Generate a RankMath FAQ Gutenberg block from Q/A pairs.
 * Supports two input formats:
 *   1. ## heading + answer paragraph (preferred, matches skill docs)
 *   2. **Q: text** / **A:** text (legacy)
 */
function genFaq(lines: string[]): string {
  const pairs: { q: string; a: string }[] = [];
  let currentQ = "";
  let currentA: string[] = [];

  function flushPair() {
    if (currentQ && currentA.length > 0) {
      pairs.push({ q: currentQ, a: currentA.join(" ") });
    }
    currentQ = "";
    currentA = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format 1: ## heading (question)
    const h2Match = trimmed.match(/^##\s+(.+?)(\?)?$/);
    if (h2Match) {
      flushPair();
      currentQ = h2Match[1] + (h2Match[2] || "?");
      continue;
    }

    // Format 2: **Q: text** (legacy)
    const qMatch = trimmed.match(/^\*\*Q:\s*(.+?)\*\*$/);
    if (qMatch) {
      flushPair();
      currentQ = qMatch[1];
      continue;
    }

    // Format 2: **A:** text (legacy)
    const aMatch = trimmed.match(/^\*\*A:\*\*\s*(.+)$/);
    if (aMatch && currentQ) {
      currentA.push(aMatch[1]);
      continue;
    }

    // Any other non-empty line while we have a question = answer text
    if (currentQ) {
      currentA.push(trimmed);
    }
  }
  flushPair();

  const questions = pairs.map((p) => ({
    id: `faq-question-${generateUniqueId()}${generateUniqueId()}`,
    title: p.q,
    content: p.a,
    visible: true,
  }));

  const questionsJson = JSON.stringify(questions);

  const itemsHtml = pairs
    .map(
      (p) =>
        `<div class="rank-math-faq-item"><h3 class="rank-math-question">${p.q}</h3><div class="rank-math-answer">${p.a}</div></div>`,
    )
    .join("\n");

  return [
    `<!-- wp:rank-math/faq-block {"questions":${questionsJson}} -->`,
    `<div class="wp-block-rank-math-faq-block">`,
    itemsHtml,
    `</div>`,
    `<!-- /wp:rank-math/faq-block -->`,
  ].join("\n");
}

/**
 * Generate a CTA button Gutenberg block (self-closing hint).
 */
function genCta(attrs: string): string {
  const url = parseAttr(attrs, "url");
  const text = parseAttr(attrs, "text");
  const sponsored = parseAttr(attrs, "sponsored") === "true";

  const uidContainer = generateUniqueId();
  const uidButton = generateUniqueId();

  const relSponsoredJson = sponsored ? `,"relSponsored":true` : "";
  const relAttr = sponsored ? ` rel="sponsored"` : "";

  return [
    `<!-- wp:generateblocks/container {"uniqueId":"${uidContainer}","isDynamic":true,"blockVersion":4,"metadata":{"name":"CTA Button Container"},"globalClasses":["btn-container"]} -->`,
    `<!-- wp:generateblocks/button {"uniqueId":"${uidButton}","hasUrl":true${relSponsoredJson},"blockVersion":4,"hasIcon":true,"iconLocation":"right","className":"btn-outline","globalClasses":["btn-primary-outline"],"isGlobalStyle":true,"globalStyleId":"8f2cafa1","globalStyleLabel":"Button Outline (Blue to Gold)"} -->`,
    `<a class="gb-button gb-button-${uidButton} btn-primary-outline btn-outline" href="${url}"${relAttr}><span class="gb-button-text">${text}</span><span class="gb-icon">${ARROW_SVG}</span></a>`,
    `<!-- /wp:generateblocks/button -->`,
    `<!-- /wp:generateblocks/container -->`,
  ].join("\n");
}

// Template headline IDs from reusable block 51824 — use in order, wrap around for 9+ items
const KEY_TAKEAWAY_HEADLINE_IDS = [
  "60005305", "426bc5ac", "b74b277c", "2e7c9b3f",
  "be20854d", "a3f7e821", "c94d5b16", "f1e08a3c",
];

// Accordion chevron SVGs from reusable block 51824
const CHEVRON_DOWN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="1em" height="1em" aria-hidden="true" role="img" class="gb-accordion__icon"><path d="M207.029 381.476L12.686 187.132c-9.373-9.373-9.373-24.569 0-33.941l22.667-22.667c9.357-9.357 24.522-9.375 33.901-.04L224 284.505l154.745-154.021c9.379-9.335 24.544-9.317 33.901.04l22.667 22.667c9.373 9.373 9.373 24.569 0 33.941L240.971 381.476c-9.373 9.372-24.569 9.372-33.942 0z" fill="currentColor"></path></svg>';
const CHEVRON_UP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="1em" height="1em" aria-hidden="true" role="img" class="gb-accordion__icon-open"><path d="M240.971 130.524l194.343 194.343c9.373 9.373 9.373 24.569 0 33.941l-22.667 22.667c-9.357 9.357-24.522 9.375-33.901.04L224 227.495 69.255 381.516c-9.379 9.335-24.544 9.317-33.901-.04l-22.667-22.667c-9.373-9.373-9.373-24.569 0-33.941L207.03 130.525c9.372-9.373 24.568-9.373 33.941-.001z" fill="currentColor"></path></svg>';

/**
 * Generate a Key Takeaways accordion Gutenberg block.
 * Uses EXACT template from reusable block 51824 — only text content changes.
 * UniqueIds, globalClasses, and all attributes are locked to the template.
 */
function genKeyTakeaways(lines: string[]): string {
  const items = lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());

  const itemBlocks = items
    .map((item, i) => {
      const uid = KEY_TAKEAWAY_HEADLINE_IDS[i % KEY_TAKEAWAY_HEADLINE_IDS.length];
      return [
        `<!-- wp:generateblocks/headline {"uniqueId":"${uid}","element":"p","blockVersion":3,"hasIcon":true,"globalClasses":["key-takeaways-item"]} -->`,
        `<p class="gb-headline gb-headline-${uid} key-takeaways-item"><span class="gb-icon">🧬</span><span class="gb-headline-text">${item}</span></p>`,
        `<!-- /wp:generateblocks/headline -->`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `<!-- wp:generateblocks/container {"uniqueId":"ca82a9de","isDynamic":true,"blockVersion":4,"variantRole":"accordion","metadata":{"name":"Key Takeaways"},"globalClasses":["accordion-outline","key-takeaways-top"]} -->`,
    `<!-- wp:generateblocks/container {"uniqueId":"484d6c67","isDynamic":true,"blockVersion":4,"variantRole":"accordion-item","metadata":{"name":"Entire Accordion Item"},"globalClasses":["accordion-outline-item"]} -->`,
    `<!-- wp:generateblocks/button {"uniqueId":"9988d281","anchor":"gb-accordion-toggle-9988d281","blockVersion":4,"variantRole":"accordion-toggle","buttonType":"button","position":"relative","hasIcon":true,"iconLocation":"right","metadata":{"name":"Accordion Button"},"globalClasses":["accordion-outline-title"]} -->`,
    `<button class="gb-button gb-button-9988d281 gb-accordion__toggle accordion-outline-title" id="gb-accordion-toggle-9988d281"><span class="gb-button-text">🔬 Key Takeaways</span><span class="gb-icon">${CHEVRON_DOWN_SVG}${CHEVRON_UP_SVG}</span></button>`,
    `<!-- /wp:generateblocks/button -->`,
    ``,
    `<!-- wp:generateblocks/container {"uniqueId":"5c86dbb2","anchor":"gb-accordion-content-5c86dbb2","gradientDirection":360,"gradientColorOne":"rgba(255, 255, 255, 0.1)","gradientColorTwo":"rgba(0, 0, 0, 0.30)","gradientSelector":"pseudo-element","isDynamic":true,"blockVersion":4,"variantRole":"accordion-content","position":"relative","overflowX":"hidden","overflowY":"hidden","metadata":{"name":"Accordion Content Container"},"advBackgrounds":[{"target":"self","device":"all","state":"normal","type":"gradient","direction":179,"colorOne":"rgba(255, 255, 255, 0.1)","colorTwo":"rgba(0, 0, 0, 0.30)","stopOne":83,"stopTwo":17}],"globalClasses":["accordion-outline-content-key-takeaways"]} -->`,
    itemBlocks,
    `<!-- /wp:generateblocks/container -->`,
    `<!-- /wp:generateblocks/container -->`,
    `<!-- /wp:generateblocks/container -->`,
  ].join("\n");
}

/**
 * Generate a Data Lab Gutenberg block (self-closing).
 * Matches enhance.sh gen_data_lab() exactly.
 */
function genDataLab(title: string, columns: string, rows: string[]): string {
  const rowData = rows
    .filter((l) => l.trim())
    .join("\\n");
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedColumns = columns.replace(/"/g, '\\"');
  const escapedRows = rowData.replace(/"/g, '\\"');

  return `<!-- wp:outliyr/data-lab {"mode":"local_override","dataEntryMode":"visual","dataFormat":"table","builderTitle":"${escapedTitle}","builderColumnsText":"${escapedColumns}","builderRowsText":"${escapedRows}","showTable":true,"showChart":true,"defaultView":"table","titleTag":"h3"} /-->`;
}

/**
 * Generate a stats accordion block for product roundups.
 * Matches enhance.sh gen_stats_accordion() exactly.
 */
function genStatsAccordion(lines: string[]): string {
  const items = lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());

  const uidAccordion = generateUniqueId();
  const uidItem = generateUniqueId();
  const uidToggle = generateUniqueId();
  const uidContent = generateUniqueId();

  const listItems = items
    .map((item) => `<!-- wp:list-item --><li>${item}</li><!-- /wp:list-item -->`)
    .join("");

  return [
    `<!-- wp:generateblocks/container {"uniqueId":"${uidAccordion}","isDynamic":true,"blockVersion":4,"variantRole":"accordion","globalClasses":["accordion-outline"]} -->`,
    `<!-- wp:generateblocks/container {"uniqueId":"${uidItem}","isDynamic":true,"blockVersion":4,"variantRole":"accordion-item","globalClasses":["accordion-outline-item"]} -->`,
    `<!-- wp:generateblocks/button {"uniqueId":"${uidToggle}","blockVersion":4,"variantRole":"accordion-toggle","globalClasses":["accordion-outline-title"]} -->`,
    `<button class="gb-button gb-button-${uidToggle} accordion-outline-title">Product Stats</button>`,
    `<!-- /wp:generateblocks/button -->`,
    `<!-- wp:generateblocks/container {"uniqueId":"${uidContent}","isDynamic":true,"blockVersion":4,"variantRole":"accordion-content","globalClasses":["accordion-outline-content"]} -->`,
    `<!-- wp:list -->`,
    `<ul class="wp-block-list">${listItems}</ul>`,
    `<!-- /wp:list -->`,
    `<!-- /wp:generateblocks/container -->`,
    `<!-- /wp:generateblocks/container -->`,
    `<!-- /wp:generateblocks/container -->`,
  ].join("\n");
}

/**
 * Generate a Product Roundup Gutenberg block with nested sub-sections.
 * Matches enhance.sh gen_product_block() exactly.
 */
function genProductRoundup(
  id: string,
  name: string,
  lines: string[],
): string {
  let inSub = "";
  let accolade = "";
  let imageUrl = "";
  const statsBuf: string[] = [];
  let ctaLine = "";
  const discountBuf: string[] = [];

  for (const line of lines) {
    // Handle inline sub-sections (both open and close on same line)
    const inlineAccolade = line.match(
      /<!-- @accolade -->(.+?)<!-- @end-accolade -->/,
    );
    if (inlineAccolade) {
      accolade = inlineAccolade[1].trim();
      continue;
    }
    const inlineImage = line.match(
      /<!-- @image -->(.+?)<!-- @end-image -->/,
    );
    if (inlineImage) {
      imageUrl = inlineImage[1].trim();
      continue;
    }
    const inlineDiscount = line.match(
      /<!-- @discount -->(.+?)<!-- @end-discount -->/,
    );
    if (inlineDiscount) {
      discountBuf.push(inlineDiscount[1].trim());
      continue;
    }

    if (line.includes("<!-- @accolade -->")) {
      inSub = "accolade";
      continue;
    }
    if (line.includes("<!-- @end-accolade -->")) {
      inSub = "";
      continue;
    }
    if (line.includes("<!-- @image -->")) {
      inSub = "image";
      continue;
    }
    if (line.includes("<!-- @end-image -->")) {
      inSub = "";
      continue;
    }
    if (line.includes("<!-- @stats -->")) {
      inSub = "stats";
      continue;
    }
    if (line.includes("<!-- @end-stats -->")) {
      inSub = "";
      continue;
    }
    if (line.includes("<!-- @cta ")) {
      ctaLine = line;
      continue;
    }
    if (line.includes("<!-- @discount -->")) {
      inSub = "discount";
      continue;
    }
    if (line.includes("<!-- @end-discount -->")) {
      inSub = "";
      continue;
    }

    switch (inSub) {
      case "accolade":
        accolade += line.trim();
        break;
      case "image":
        imageUrl += line.trim();
        break;
      case "stats":
        statsBuf.push(line);
        break;
      case "discount":
        discountBuf.push(line);
        break;
    }
  }

  const uidContainer = generateUniqueId();
  const uidHeadline = generateUniqueId();

  const parts: string[] = [];

  // Opening container
  parts.push(
    `<!-- wp:generateblocks/container {"uniqueId":"${uidContainer}","anchor":"${id}","isDynamic":true,"blockVersion":4,"className":"product-container","globalClasses":["product-roundup-container"],"globalStyleId":"1cef8261"} -->`,
  );

  // Product name headline
  parts.push(
    `<!-- wp:generateblocks/headline {"uniqueId":"${uidHeadline}","element":"h3","blockVersion":3,"className":"product-name","globalClasses":["product-roundup-name"]} -->`,
  );
  parts.push(
    `<h3 class="gb-headline gb-headline-${uidHeadline} product-roundup-name product-name" id="${id}">${name}</h3>`,
  );
  parts.push(`<!-- /wp:generateblocks/headline -->`);

  // Accolade (if present)
  if (accolade) {
    const uidAccolade = generateUniqueId();
    parts.push(
      `<!-- wp:generateblocks/headline {"uniqueId":"${uidAccolade}","element":"p","blockVersion":3,"className":"product-accolade","globalClasses":["product-roundup-accolade"]} -->`,
    );
    parts.push(
      `<p class="gb-headline gb-headline-${uidAccolade} product-roundup-accolade product-accolade">${accolade}</p>`,
    );
    parts.push(`<!-- /wp:generateblocks/headline -->`);
  }

  // Image (if present)
  if (imageUrl) {
    parts.push(`<!-- wp:image -->`);
    parts.push(
      `<figure class="wp-block-image"><img src="${imageUrl}" alt="${name}"/></figure>`,
    );
    parts.push(`<!-- /wp:image -->`);
  }

  // Stats accordion (if present)
  if (statsBuf.length > 0) {
    parts.push(genStatsAccordion(statsBuf));
  }

  // CTA button (if present)
  if (ctaLine) {
    parts.push(genCta(ctaLine));
  }

  // Discount (if present)
  if (discountBuf.length > 0) {
    parts.push(genDiscount(discountBuf));
  }

  // Closing container
  parts.push(`<!-- /wp:generateblocks/container -->`);

  return parts.join("\n");
}

/**
 * Generate a Jump Links container Gutenberg block.
 */
function genJumpLinks(title: string, lines: string[]): string {
  const items = lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());

  const uidContainer = generateUniqueId();
  const uidTitle = generateUniqueId();

  const itemBlocks = items
    .map((item) => {
      const uidHeadline = generateUniqueId();
      // Strip ** markers and split on em-dash
      const cleaned = item.replace(/\*\*/g, "");
      const parts = cleaned.split(" \u2014 ");
      let content: string;
      if (parts.length >= 2) {
        content = `<strong>${parts[0]}</strong>: ${parts.slice(1).join(" \u2014 ")}`;
      } else {
        content = `<strong>${cleaned}</strong>`;
      }

      return [
        `<!-- wp:generateblocks/headline {"uniqueId":"${uidHeadline}","element":"p","blockVersion":3,"hasIcon":true,"iconColor":"#fcb900","iconStyles":{"width":"","height":"","paddingRight":"0.5em"},"globalClasses":["intro-box-overview-item"]} -->`,
        `<p class="gb-headline gb-headline-${uidHeadline} intro-box-overview-item"><span class="gb-icon">${STAR_SVG}</span><span class="gb-headline-text">${content}</span></p>`,
        `<!-- /wp:generateblocks/headline -->`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<!-- wp:generateblocks/container {"uniqueId":"${uidContainer}","isDynamic":true,"blockVersion":4,"metadata":{"name":"Jump Links Container"},"globalClasses":["intro-box-overview-container"]} -->`,
    `<!-- wp:generateblocks/headline {"uniqueId":"${uidTitle}","element":"div","blockVersion":3,"globalClasses":["intro-box-overview-title"]} -->`,
    `<div class="gb-headline gb-headline-${uidTitle} gb-headline-text intro-box-overview-title">${title}</div>`,
    `<!-- /wp:generateblocks/headline -->`,
    itemBlocks,
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

    // Product-roundup contains sub-section tags that must NOT be processed
    // by the main state machine. Buffer everything until @end-product.
    if (inBlock === "product-roundup") {
      if (line.includes("<!-- @end-product -->")) {
        output.push(
          genProductRoundup(
            parseAttr(blockAttrs, "id"),
            parseAttr(blockAttrs, "name"),
            blockBuf,
          ),
        );
        inBlock = "";
        blockBuf = [];
        blockAttrs = "";
      } else {
        blockBuf.push(line);
      }
      continue;
    }

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
    // @faq
    if (line.includes("<!-- @faq -->")) {
      inBlock = "faq";
      blockBuf = [];
      continue;
    }
    // @key-takeaways
    if (line.includes("<!-- @key-takeaways -->")) {
      inBlock = "key-takeaways";
      blockBuf = [];
      continue;
    }
    // @jump-links (has title attribute)
    if (line.includes("<!-- @jump-links ")) {
      inBlock = "jump-links";
      blockBuf = [];
      blockAttrs = line;
      continue;
    }
    // @data-lab (has title and columns attributes)
    if (line.includes("<!-- @data-lab ")) {
      inBlock = "data-lab";
      blockBuf = [];
      blockAttrs = line;
      continue;
    }
    // @product-roundup (has id and name attributes, uses @end-product not @end)
    if (line.includes("<!-- @product-roundup ")) {
      inBlock = "product-roundup";
      blockBuf = [];
      blockAttrs = line;
      continue;
    }
    // @cta (self-closing, no @end needed)
    if (line.includes("<!-- @cta ") && !inBlock) {
      output.push(genCta(line));
      continue;
    }

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
        case "faq":
          output.push(genFaq(blockBuf));
          break;
        case "key-takeaways":
          output.push(genKeyTakeaways(blockBuf));
          break;
        case "jump-links":
          output.push(genJumpLinks(parseAttr(blockAttrs, "title"), blockBuf));
          break;
        case "data-lab":
          output.push(
            genDataLab(
              parseAttr(blockAttrs, "title"),
              parseAttr(blockAttrs, "columns"),
              blockBuf,
            ),
          );
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
