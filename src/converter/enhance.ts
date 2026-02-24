import {
  generateUniqueId,
  LIGHTBULB_SVG,
  FIRE_SVG,
  ARROW_SVG,
  DNA_EMOJI_IMG,
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
 * Generate a RankMath FAQ Gutenberg block from Q/A pairs.
 */
function genFaq(lines: string[]): string {
  const pairs: { q: string; a: string }[] = [];
  let currentQ = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match **Q: text** pattern
    const qMatch = trimmed.match(/^\*\*Q:\s*(.+?)\*\*$/);
    if (qMatch) {
      currentQ = qMatch[1];
      continue;
    }

    // Match **A:** text pattern
    const aMatch = trimmed.match(/^\*\*A:\*\*\s*(.+)$/);
    if (aMatch && currentQ) {
      pairs.push({ q: currentQ, a: aMatch[1] });
      currentQ = "";
    }
  }

  const questions = pairs.map((p) => ({
    id: `faq-question-${Date.now()}${generateUniqueId()}`,
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

/**
 * Generate a Key Takeaways accordion Gutenberg block.
 */
function genKeyTakeaways(lines: string[]): string {
  const items = lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim());

  const uidAccordion = generateUniqueId();
  const uidItem = generateUniqueId();
  const uidToggle = generateUniqueId();
  const uidContent = generateUniqueId();

  const itemBlocks = items
    .map((item) => {
      const uidHeadline = generateUniqueId();
      return [
        `<!-- wp:generateblocks/headline {"uniqueId":"${uidHeadline}","element":"p","blockVersion":3,"hasIcon":true,"iconStyles":{"width":"","height":"","paddingRight":"0.5em"},"globalClasses":["key-takeaways-item"]} -->`,
        `<p class="gb-headline gb-headline-${uidHeadline} key-takeaways-item"><span class="gb-icon">${DNA_EMOJI_IMG}</span><span class="gb-headline-text">${item}</span></p>`,
        `<!-- /wp:generateblocks/headline -->`,
      ].join("\n");
    })
    .join("\n");

  return [
    `<!-- wp:generateblocks/container {"uniqueId":"${uidAccordion}","isDynamic":true,"blockVersion":4,"variantRole":"accordion","metadata":{"name":"Key Takeaways"},"globalClasses":["accordion-outline","key-takeaways-top"]} -->`,
    `<!-- wp:generateblocks/container {"uniqueId":"${uidItem}","isDynamic":true,"blockVersion":4,"variantRole":"accordion-item","globalClasses":["accordion-outline-item"]} -->`,
    `<!-- wp:generateblocks/button {"uniqueId":"${uidToggle}","blockVersion":4,"variantRole":"accordion-toggle","globalClasses":["accordion-outline-title"]} -->`,
    `<button class="gb-button gb-button-${uidToggle} accordion-outline-title">Key Takeaways</button>`,
    `<!-- /wp:generateblocks/button -->`,
    `<!-- wp:generateblocks/container {"uniqueId":"${uidContent}","isDynamic":true,"blockVersion":4,"variantRole":"accordion-content","globalClasses":["accordion-outline-content-key-takeaways"]} -->`,
    itemBlocks,
    `<!-- /wp:generateblocks/container -->`,
    `<!-- /wp:generateblocks/container -->`,
    `<!-- /wp:generateblocks/container -->`,
  ].join("\n");
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
