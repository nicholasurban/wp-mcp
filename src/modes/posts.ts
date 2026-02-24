import { ToolContext, ToolParams } from "../tool.js";

export async function handlePosts(ctx: ToolContext, params: ToolParams): Promise<string> {
  const action = params.action ?? "list";
  const postType = params.post_type ?? "post";

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

  switch (action) {
    case "list": {
      const queryParams: Record<string, unknown> = {
        per_page: perPage,
        page: params.page ?? 1,
      };
      if (params.status) queryParams.status = params.status;
      if (params.search) queryParams.search = params.search;
      if (params.orderby) queryParams.orderby = params.orderby;
      if (params.categories) queryParams.categories = params.categories;
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
        categories: post.categories,
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
          if (params.categories) body.categories = params.categories;
          if (params.tags) body.tags = params.tags;
          if (params.featured_media) body.featured_media = params.featured_media;
          if (params.meta) body.meta = params.meta;

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
      if (params.categories) body.categories = params.categories;
      if (params.tags) body.tags = params.tags;
      if (params.featured_media) body.featured_media = params.featured_media;
      if (params.meta) body.meta = params.meta;

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
      if (params.categories) { body.categories = params.categories; updatedFields.push("categories"); }
      if (params.tags) { body.tags = params.tags; updatedFields.push("tags"); }
      if (params.featured_media) { body.featured_media = params.featured_media; updatedFields.push("featured_media"); }
      if (params.meta) { body.meta = params.meta; updatedFields.push("meta"); }

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
