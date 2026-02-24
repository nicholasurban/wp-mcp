import { ToolContext, ToolParams } from "../tool.js";
import { inlineFormat } from "../converter/inline.js";

export async function handleConvert(
  _ctx: ToolContext,
  params: ToolParams
): Promise<string> {
  if (!params.content) return JSON.stringify({ error: "content is required" });

  let content = params.content;

  // TODO: strip AI commentary (params.strip_ai_commentary)
  // TODO: enhance @hints (params.enhance)
  // TODO: convert markdown to Gutenberg blocks

  return JSON.stringify({ content });
}
