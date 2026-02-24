import { ToolContext, ToolParams } from "../tool.js";
import { markdownToGutenberg } from "../converter/markdown.js";
import { stripAiCommentary } from "../converter/strip.js";
import { enhanceHints } from "../converter/enhance.js";

export async function handleConvert(
  _ctx: ToolContext,
  params: ToolParams
): Promise<string> {
  if (!params.content) return JSON.stringify({ error: "content is required" });

  let content = params.content;

  if (params.strip_ai_commentary) {
    content = stripAiCommentary(content);
  }

  if (params.enhance) {
    content = enhanceHints(content);
  }

  content = markdownToGutenberg(content);
  return JSON.stringify({ content });
}
