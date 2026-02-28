import { z } from "zod";
import { WordPressAPI, handleApiError } from "./api.js";
import { PostTypeRegistry } from "./registry.js";
import { FeedbackStore } from "./feedback.js";

import { handleDashboard } from "./modes/dashboard.js";
import { handlePosts } from "./modes/posts.js";
import { handleProducts } from "./modes/products.js";
import { handleSettings } from "./modes/settings.js";
import { handleMedia } from "./modes/media.js";
import { handleRegisterTypes } from "./modes/register-types.js";
import { handleFeedback } from "./modes/feedback.js";
import { handleConvert } from "./modes/convert.js";

export const TOOL_NAME = "wordpress";

export const TOOL_DESCRIPTION = `Manage WordPress (outliyr.com). 8 modes:
- dashboard: site overview — WP version, theme, plugin count, post counts by type
- posts: list/get/create/update/delete any post type; set content_format:"markdown" for server-side conversion (avoids sending Gutenberg blocks through LLM context)
- products: WooCommerce product CRUD — list/get/create/update/delete
- settings: read/write WordPress options — general settings or raw wp_options
- media: list/upload/delete media library items
- register_types: accept or ignore newly discovered post types
- feedback: set preferences and log corrections for self-annealing
- convert: convert markdown content to WordPress Gutenberg blocks`;

export const TOOL_SCHEMA = {
  mode: z
    .enum(["dashboard", "posts", "products", "settings", "media", "register_types", "feedback", "convert"])
    .describe("Operation mode"),

  action: z
    .string()
    .optional()
    .describe(
      "Sub-action: list/get/create/update/delete (posts, products, media), " +
      "get_general/get_option/update_option/list_options (settings), " +
      "list (register_types, feedback), " +
      "set_preference/log_correction (feedback)"
    ),

  // Common
  id: z.number().optional().describe("Entity ID (post, product, media)"),
  per_page: z.number().int().min(1).max(100).default(10).optional().describe("Results per page"),
  page: z.number().int().min(1).default(1).optional().describe("Page number"),
  search: z.string().optional().describe("Search query"),
  force: z.boolean().optional().describe("Force delete (bypass trash) or force-update protected settings"),

  // Posts
  post_type: z.string().optional().describe("Post type slug: post, page, outliyr_intel, odl_dataset, haq_entry, peptide_protocol, or any accepted CPT"),
  slug: z.string().optional().describe("Post/page URL slug"),
  title: z.string().optional().describe("Post/product title or media title"),
  content: z.string().optional().describe("Post content (Gutenberg blocks or HTML); for convert mode, the markdown content to convert"),
  content_format: z.enum(["html", "markdown"]).optional().describe("Content format: 'markdown' runs server-side conversion (strip+enhance+convert) so converted blocks never flow through LLM context. Default 'html' (pass-through)."),
  excerpt: z.string().optional().describe("Post excerpt"),
  status: z.string().optional().describe("Post/product status: draft, publish, pending, private, trash"),
  categories: z.array(z.union([z.string(), z.number()])).optional().describe("Category IDs or names"),
  tags: z.array(z.union([z.string(), z.number()])).optional().describe("Tag IDs or names"),
  featured_media: z.number().optional().describe("Featured image media ID"),
  featured_image_url: z.string().optional().describe("URL to sideload as featured image (alternative to featured_media ID)"),
  meta: z.record(z.string(), z.unknown()).optional().describe("Custom meta fields key-value pairs"),
  orderby: z.string().optional().describe("Sort: date, title, modified, id"),
  seo: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    focus_keyword: z.string().optional(),
  }).optional().describe("RankMath SEO fields"),

  // Products (WooCommerce-specific)
  product_id: z.number().optional().describe("WooCommerce product ID"),
  sku: z.string().optional().describe("Product SKU"),
  regular_price: z.string().optional().describe("Product regular price"),
  sale_price: z.string().optional().describe("Product sale price"),
  stock_quantity: z.number().optional().describe("Stock quantity"),
  stock_status: z.string().optional().describe("Stock status: instock, outofstock, onbackorder"),
  product_type: z.string().optional().describe("Product type: simple, grouped, variable, external"),
  short_description: z.string().optional().describe("Product short description"),
  images: z.array(z.object({ src: z.string(), alt: z.string().optional() })).optional().describe("Product images"),
  meta_data: z.array(z.object({ key: z.string(), value: z.unknown() })).optional().describe("WC meta data"),

  // Settings
  option_name: z.string().optional().describe("WordPress option name"),
  option_value: z.unknown().optional().describe("Value to set for the option"),

  // Media
  media_id: z.number().optional().describe("Media library item ID"),
  url: z.string().optional().describe("URL to download and upload as media"),
  alt_text: z.string().optional().describe("Image alt text"),
  filename: z.string().optional().describe("Filename for base64 upload"),
  data: z.string().optional().describe("Base64-encoded file data"),
  mime_type: z.string().optional().describe("MIME type filter for media list"),
  post_id: z.number().optional().describe("Attach media to this post ID"),

  // Register types
  decisions: z
    .array(z.object({ slug: z.string(), action: z.enum(["accept", "ignore"]) }))
    .optional()
    .describe("Post type registration decisions"),

  // Feedback
  key: z.string().optional().describe("Preference key"),
  value: z.unknown().optional().describe("Preference value"),
  issue: z.string().optional().describe("Correction: what went wrong"),
  resolution: z.string().optional().describe("Correction: how it was fixed"),

  // Convert
  strip_ai_commentary: z.boolean().optional().describe("Remove LLM preamble/postamble before converting"),
  enhance: z.boolean().optional().describe("Process @hint markers (Outliyr custom blocks) before converting"),
};

export type ToolParams = z.infer<z.ZodObject<typeof TOOL_SCHEMA>>;

export interface ToolContext {
  api: WordPressAPI;
  registry: PostTypeRegistry;
  feedback: FeedbackStore;
}

// Pre-flight: check for new post types before any operation
async function preFlightCheck(ctx: ToolContext): Promise<string | null> {
  try {
    const wpTypes = await ctx.api.get<Record<string, Record<string, unknown>>>("/wp/v2/types");
    const newTypes = ctx.registry.detectNewTypes(
      wpTypes as Record<string, { slug: string; name: string; rest_base: string }>
    );
    if (newTypes.length > 0) {
      return JSON.stringify({
        new_post_types_detected: true,
        unknown_types: newTypes,
        action_required:
          "New post types detected on WordPress. Call this tool with mode 'register_types' " +
          "to accept or ignore each type before proceeding with other operations.",
      });
    }
  } catch {
    // Non-fatal: if types endpoint fails, proceed without check
  }
  return null;
}

export async function toolHandler(ctx: ToolContext, params: ToolParams): Promise<string> {
  try {
    // Pre-flight check (skip for register_types, feedback, and convert modes)
    if (params.mode !== "register_types" && params.mode !== "feedback" && params.mode !== "convert") {
      const blocked = await preFlightCheck(ctx);
      if (blocked) return blocked;
    }

    switch (params.mode) {
      case "dashboard":
        return await handleDashboard(ctx, params);
      case "posts":
        return await handlePosts(ctx, params);
      case "products":
        return await handleProducts(ctx, params);
      case "settings":
        return await handleSettings(ctx, params);
      case "media":
        return await handleMedia(ctx, params);
      case "register_types":
        return await handleRegisterTypes(ctx, params);
      case "feedback":
        return await handleFeedback(ctx, params);
      case "convert":
        return await handleConvert(ctx, params);
      default:
        return JSON.stringify({ error: `Unknown mode: ${(params as Record<string, unknown>).mode}` });
    }
  } catch (err) {
    return JSON.stringify({ error: handleApiError(err) });
  }
}
