import { ToolContext, ToolParams } from "../tool.js";

export async function handleRegisterTypes(ctx: ToolContext, params: ToolParams): Promise<string> {
  const action = params.action ?? "decide";

  switch (action) {
    case "list": {
      return JSON.stringify(ctx.registry.getAllState());
    }

    case "decide":
    default: {
      if (!params.decisions || params.decisions.length === 0) {
        // No decisions — return current state + pending types
        const wpTypes = await ctx.api.get<Record<string, Record<string, unknown>>>("/wp/v2/types");
        const newTypes = ctx.registry.detectNewTypes(
          wpTypes as Record<string, { slug: string; name: string; rest_base: string }>
        );
        return JSON.stringify({
          ...ctx.registry.getAllState(),
          pending_types: newTypes,
        });
      }

      const results: Array<{ slug: string; action: string; result: string }> = [];

      for (const decision of params.decisions) {
        if (decision.action === "accept") {
          // Fetch type info from WP to get rest_base
          try {
            const wpTypes = await ctx.api.get<Record<string, Record<string, unknown>>>("/wp/v2/types");
            const typeInfo = wpTypes[decision.slug];
            if (typeInfo) {
              ctx.registry.acceptType(
                decision.slug,
                typeInfo.name as string,
                typeInfo.rest_base as string
              );
              results.push({ slug: decision.slug, action: "accepted", result: "ok" });
            } else {
              results.push({ slug: decision.slug, action: "accept", result: `Type '${decision.slug}' not found on WordPress` });
            }
          } catch {
            results.push({ slug: decision.slug, action: "accept", result: "Failed to fetch type info" });
          }
        } else if (decision.action === "ignore") {
          ctx.registry.ignoreType(decision.slug, decision.slug);
          results.push({ slug: decision.slug, action: "ignored", result: "ok" });
        }
      }

      return JSON.stringify({ decisions: results, registry: ctx.registry.getAllState() });
    }
  }
}
