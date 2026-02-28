import { ToolContext, ToolParams } from "../tool.js";
import { WordPressAPI } from "../api.js";
import { markdownToGutenberg } from "../converter/markdown.js";
import { stripAiCommentary } from "../converter/strip.js";
import { enhanceHints } from "../converter/enhance.js";

async function resolveTermIds(
  api: WordPressAPI,
  taxonomy: string,
  terms: (string | number)[]
): Promise<number[]> {
  const ids: number[] = [];
  for (const term of terms) {
    if (typeof term === "number") {
      ids.push(term);
    } else {
      const results = await api.get<{ id: number; name: string }[]>(
        `/wp/v2/${taxonomy}`,
        { search: term, per_page: 100 }
      );
      const match = results.find(
        (r) => r.name.toLowerCase() === term.toLowerCase()
      );
      if (!match) {
        throw new Error(`${taxonomy} "${term}" not found in WordPress`);
      }
      ids.push(match.id);
    }
  }
  return ids;
}

async function sideloadFeaturedImage(
  api: WordPressAPI,
  params: ToolParams,
  body: Record<string, unknown>
): Promise<void> {
  if (params.featured_image_url) {
    const { data, mimeType, filename } = await api.downloadUrl(params.featured_image_url);
    const media = await api.uploadMedia(data, filename, mimeType, {
      title: (params.title as string) ?? filename,
    });
    body.featured_media = (media as Record<string, unknown>).id;
  } else if (params.featured_media) {
    body.featured_media = params.featured_media;
  }
}

async function resolveTermsForBody(
  api: WordPressAPI,
  params: ToolParams,
  body: Record<string, unknown>
): Promise<void> {
  if (params.categories) {
    body.categories = await resolveTermIds(api, "categories", params.categories as (string | number)[]);
  }
  if (params.tags) {
    body.tags = await resolveTermIds(api, "tags", params.tags as (string | number)[]);
  }
}

// wp_block posts use wp_pattern_category taxonomy instead of categories
const PATTERN_CAT_TAXONOMY = "wp_pattern_category";

// Resolve pattern category slugs/names to term IDs, creating if needed
async function resolvePatternCategoryIds(
  ctx: ToolContext,
  input: unknown
): Promise<number[]> {
  if (!input) return [];
  const items = Array.isArray(input) ? input : [input];
  const ids: number[] = [];

  for (const item of items) {
    if (typeof item === "number") {
      ids.push(item);
      continue;
    }
    const slug = String(item);
    // Search by slug first
    const existing = await ctx.api.get<{ id: number; slug: string }[]>(
      `/wp/v2/${PATTERN_CAT_TAXONOMY}`,
      { slug, per_page: 1 }
    );
    if (existing.length > 0) {
      ids.push(existing[0].id);
    } else {
      // Create the pattern category
      const created = await ctx.api.post<{ id: number }>(
        `/wp/v2/${PATTERN_CAT_TAXONOMY}`,
        { name: slug, slug }
      );
      ids.push(created.id);
    }
  }
  return ids;
}

export async function handlePosts(ctx: ToolContext, params: ToolParams): Promise<string> {
  const action = params.action ?? "list";
  const postType = params.post_type ?? "post";
  const isPatternBlock = postType === "wp_block";

  // Validate post type is accepted
  if (!ctx.registry.isAccepted(postType)) {
    return JSON.stringify({
      error: `Post type '${postType}' is not accepted. Accepted types: ${Object.keys(ctx.registry.getAccepted()).join(", ")}`,
    });
  }

  // WooCommerce products should use the products mode
  if (ctx.registry.isWooCommerce(postType)) {
    return JSON.stringify({
      error: `'${postType}' is a WooCommerce type. Use mode 'products' instead.`,
    });
  }

  const restBase = ctx.registry.getRestBase(postType)!;
  const basePath = `/wp/v2/${restBase}`;

  // Apply feedback defaults
  const defaults = ctx.feedback.getDefaults(postType);
  const perPage = params.per_page ?? (defaults.default_per_page as number | undefined) ?? 10;
  const defaultStatus = (defaults.default_status as string | undefined) ?? "draft";

  // Server-side markdown conversion: strip → enhance → convert to Gutenberg
  if (params.content && params.content_format === "markdown") {
    let c = stripAiCommentary(params.content);
    c = enhanceHints(c);
    params.content = markdownToGutenberg(c);
  }

  switch (action) {
    case "list": {
      const queryParams: Record<string, unknown> = {
        per_page: perPage,
        page: params.page ?? 1,
      };
      if (params.status) queryParams.status = params.status;
      if (params.search) queryParams.search = params.search;
      if (params.orderby) queryParams.orderby = params.orderby;
      if (params.categories) {
        if (isPatternBlock) {
          queryParams[PATTERN_CAT_TAXONOMY] = (await resolvePatternCategoryIds(ctx, params.categories)).join(",");
        } else {
          queryParams.categories = params.categories;
        }
      }
      if (params.tags) queryParams.tags = params.tags;

      const posts = await ctx.api.get<Record<string, unknown>[]>(basePath, queryParams);

      // Compact response shape
      const compact = posts.map((p) => ({
        id: p.id,
        title: (p.title as Record<string, unknown>)?.rendered ?? p.title,
        status: p.status,
        date: p.date,
        slug: p.slug,
        link: p.link,
        type: p.type,
      }));

      return JSON.stringify({ count: compact.length, posts: compact });
    }

    case "get": {
      let post: Record<string, unknown>;
      if (params.id) {
        post = await ctx.api.get<Record<string, unknown>>(`${basePath}/${params.id}`);
      } else if (params.slug) {
        const results = await ctx.api.get<Record<string, unknown>[]>(basePath, { slug: params.slug });
        if (!results.length) return JSON.stringify({ error: `No ${postType} found with slug '${params.slug}'` });
        post = results[0];
      } else {
        return JSON.stringify({ error: "Provide id or slug" });
      }

      return JSON.stringify({
        id: post.id,
        title: (post.title as Record<string, unknown>)?.rendered ?? post.title,
        content: (post.content as Record<string, unknown>)?.rendered ?? post.content,
        excerpt: (post.excerpt as Record<string, unknown>)?.rendered ?? post.excerpt,
        status: post.status,
        date: post.date,
        modified: post.modified,
        slug: post.slug,
        link: post.link,
        type: post.type,
        categories: isPatternBlock ? post[PATTERN_CAT_TAXONOMY] : post.categories,
        tags: post.tags,
        featured_media: post.featured_media,
        meta: post.meta,
      });
    }

    case "create": {
      if (!params.title) return JSON.stringify({ error: "title required" });

      // Idempotency: check for existing post by slug
      if (params.slug) {
        const existing = await ctx.api.get<Record<string, unknown>[]>(basePath, {
          slug: params.slug,
          status: "any",
          per_page: 1,
        });
        if (existing.length > 0) {
          // Update existing post instead of creating a duplicate
          const existingId = existing[0].id as number;
          const body: Record<string, unknown> = {
            title: params.title,
          };
          if (params.content) body.content = params.content;
          if (params.excerpt) body.excerpt = params.excerpt;
          if (params.status) body.status = params.status;
          if (params.meta) body.meta = params.meta;

          // Resolve category/tag names to IDs
          try {
            await resolveTermsForBody(ctx.api, params, body);
          } catch (err) {
            return JSON.stringify({ error: (err as Error).message });
          }

          // Sideload featured image or use provided ID
          await sideloadFeaturedImage(ctx.api, params, body);

          const updated = await ctx.api.post<Record<string, unknown>>(`${basePath}/${existingId}`, body);

          // Set RankMath SEO via separate meta update if provided
          if (params.seo) {
            const seoMeta: Record<string, unknown> = {};
            if (params.seo.title) seoMeta.rank_math_title = params.seo.title;
            if (params.seo.description) seoMeta.rank_math_description = params.seo.description;
            if (params.seo.focus_keyword) seoMeta.rank_math_focus_keyword = params.seo.focus_keyword;
            if (Object.keys(seoMeta).length > 0) {
              await ctx.api.post(`${basePath}/${existingId}`, { meta: seoMeta });
            }
          }

          return JSON.stringify({
            id: existingId,
            link: updated.link,
            edit_link: `${process.env.WP_SITE_URL}/wp-admin/post.php?post=${existingId}&action=edit`,
            status: updated.status,
            idempotent_hit: true,
          });
        }
      }

      // Normal create path (no existing post found)
      const body: Record<string, unknown> = {
        title: params.title,
        status: params.status ?? defaultStatus,
      };
      if (params.content) body.content = params.content;
      if (params.excerpt) body.excerpt = params.excerpt;
      if (params.slug) body.slug = params.slug;
      if (params.meta) body.meta = params.meta;

      // Resolve category/tag names to IDs (pattern blocks use a different taxonomy)
      try {
        if (isPatternBlock && params.categories) {
          body[PATTERN_CAT_TAXONOMY] = await resolvePatternCategoryIds(ctx, params.categories);
        } else {
          await resolveTermsForBody(ctx.api, params, body);
        }
      } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
      }

      // Sideload featured image or use provided ID
      await sideloadFeaturedImage(ctx.api, params, body);

      const created = await ctx.api.post<Record<string, unknown>>(basePath, body);

      // Set RankMath SEO via separate meta update if provided
      if (params.seo) {
        const seoMeta: Record<string, unknown> = {};
        if (params.seo.title) seoMeta.rank_math_title = params.seo.title;
        if (params.seo.description) seoMeta.rank_math_description = params.seo.description;
        if (params.seo.focus_keyword) seoMeta.rank_math_focus_keyword = params.seo.focus_keyword;
        if (Object.keys(seoMeta).length > 0) {
          await ctx.api.post(`${basePath}/${created.id}`, { meta: seoMeta });
        }
      }

      return JSON.stringify({
        id: created.id,
        link: created.link,
        edit_link: `${process.env.WP_SITE_URL}/wp-admin/post.php?post=${created.id}&action=edit`,
        status: created.status,
        idempotent_hit: false,
      });
    }

    case "update": {
      if (!params.id) return JSON.stringify({ error: "id required" });

      const body: Record<string, unknown> = {};
      const updatedFields: string[] = [];

      if (params.title) { body.title = params.title; updatedFields.push("title"); }
      if (params.content) { body.content = params.content; updatedFields.push("content"); }
      if (params.excerpt) { body.excerpt = params.excerpt; updatedFields.push("excerpt"); }
      if (params.status) { body.status = params.status; updatedFields.push("status"); }
      if (params.slug) { body.slug = params.slug; updatedFields.push("slug"); }
      if (params.meta) { body.meta = params.meta; updatedFields.push("meta"); }

      // Resolve category/tag names to IDs (pattern blocks use a different taxonomy)
      try {
        if (isPatternBlock && params.categories) {
          body[PATTERN_CAT_TAXONOMY] = await resolvePatternCategoryIds(ctx, params.categories);
          updatedFields.push("categories");
        } else {
          if (params.categories) {
            body.categories = await resolveTermIds(ctx.api, "categories", params.categories as (string | number)[]);
            updatedFields.push("categories");
          }
          if (params.tags) {
            body.tags = await resolveTermIds(ctx.api, "tags", params.tags as (string | number)[]);
            updatedFields.push("tags");
          }
        }
      } catch (err) {
        return JSON.stringify({ error: (err as Error).message });
      }

      // Sideload featured image or use provided ID
      await sideloadFeaturedImage(ctx.api, params, body);
      if (params.featured_image_url || params.featured_media) {
        updatedFields.push("featured_media");
      }

      if (Object.keys(body).length === 0) {
        return JSON.stringify({ error: "No fields to update" });
      }

      const updated = await ctx.api.post<Record<string, unknown>>(`${basePath}/${params.id}`, body);

      if (params.seo) {
        const seoMeta: Record<string, unknown> = {};
        if (params.seo.title) seoMeta.rank_math_title = params.seo.title;
        if (params.seo.description) seoMeta.rank_math_description = params.seo.description;
        if (params.seo.focus_keyword) seoMeta.rank_math_focus_keyword = params.seo.focus_keyword;
        if (Object.keys(seoMeta).length > 0) {
          await ctx.api.post(`${basePath}/${params.id}`, { meta: seoMeta });
          updatedFields.push("seo");
        }
      }

      return JSON.stringify({
        id: updated.id,
        link: updated.link,
        updated_fields: updatedFields,
      });
    }

    case "delete": {
      if (!params.id) return JSON.stringify({ error: "id required" });
      const queryParams: Record<string, unknown> = {};
      if (params.force) queryParams.force = true;

      const result = await ctx.api.delete<Record<string, unknown>>(
        `${basePath}/${params.id}`,
        queryParams
      );

      return JSON.stringify({
        id: params.id,
        deleted: params.force ? true : false,
        trashed: params.force ? false : true,
        previous_status: result.status,
      });
    }

    default:
      return JSON.stringify({
        error: `Unknown posts action: ${action}. Use: list, get, create, update, delete`,
      });
  }
}
