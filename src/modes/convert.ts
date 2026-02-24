import { ToolContext, ToolParams } from "../tool.js";
import { markdownToGutenberg } from "../converter/markdown.js";
import { stripAiCommentary } from "../converter/strip.js";

export async function handleConvert(
  _ctx: ToolContext,
  params: ToolParams
): Promise<string> {
  if (!params.content) return JSON.stringify({ error: "content is required" });

  let content = params.content;

  if (params.strip_ai_commentary) {
    content = stripAiCommentary(content);
  }

  // TODO: enhance @hints (params.enhance)

  content = markdownToGutenberg(content);
  return JSON.stringify({ content });
}
