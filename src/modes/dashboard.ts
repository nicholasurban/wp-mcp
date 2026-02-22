import { ToolContext, ToolParams } from "../tool.js";

export async function handleDashboard(ctx: ToolContext, _params: ToolParams): Promise<string> {
  // Parallel requests with fallbacks
  const [siteInfo, postTypes, plugins, themes] = await Promise.all([
    ctx.api.get<Record<string, unknown>>("/wp/v2/settings").catch(() => null),
    ctx.api.get<Record<string, Record<string, unknown>>>("/wp/v2/types").catch(() => null),
    ctx.api.get<Record<string, unknown>[]>("/wp/v2/plugins").catch(() => null),
    ctx.api.get<Record<string, unknown>[]>("/wp/v2/themes").catch(() => null),
  ]);

  // Count posts per accepted type
  const postCounts: Record<string, number> = {};
  const accepted = ctx.registry.getAccepted();
  const countPromises = Object.entries(accepted).map(async ([slug, info]) => {
    if (info.woocommerce) return; // Products counted separately
    try {
      const restBase = info.rest_base;
      const res = await ctx.api.get<unknown[]>(`/wp/v2/${restBase}`, { per_page: 1 });
      // WP returns total in response — but simple GET doesn't expose headers here
      // Use a count-only approach
      postCounts[slug] = Array.isArray(res) ? -1 : 0; // Placeholder
    } catch {
      postCounts[slug] = -1;
    }
  });
  await Promise.all(countPromises);

  const activeTheme = themes?.find((t: Record<string, unknown>) =>
    (t as Record<string, { active?: boolean }>).status?.active === true ||
    (t as Record<string, unknown>).active === true
  );

  return JSON.stringify({
    site: {
      title: (siteInfo as Record<string, unknown>)?.title ?? "unknown",
      url: (siteInfo as Record<string, unknown>)?.url ?? "unknown",
    },
    active_theme: activeTheme
      ? { name: (activeTheme as Record<string, unknown>).name, version: (activeTheme as Record<string, unknown>).version }
      : null,
    plugins: {
      total: plugins?.length ?? 0,
      active: plugins?.filter((p: Record<string, unknown>) => p.status === "active").length ?? 0,
    },
    registered_post_types: postTypes ? Object.keys(postTypes).length : 0,
    accepted_post_types: Object.keys(accepted),
    ignored_post_types: Object.keys(ctx.registry.getIgnored()),
  });
}
