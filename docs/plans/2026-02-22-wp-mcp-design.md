# WordPress MCP Server Design

**Date:** 2026-02-22
**Status:** Approved

## Problem

No structured, token-efficient way to interact with WordPress (outliyr.com) from Claude across all platforms (Code, web, iOS). Need CRUD for posts (all types), WooCommerce products, settings, and media — with dynamic post type discovery and self-annealing.

## Deliverables

1. **`wp-mcp`** — TypeScript MCP server in `mcp-servers/wp-mcp/`
2. **`wordpress` skill** — Claude skill in `claude-skills/wordpress/`

## Architecture

```
Claude (Code / Web / iOS)
    │
    │ stdio (local) or HTTP+OAuth (remote)
    │
    ▼
wp-mcp server
    ├── Post Type Registry (accepted/ignored, persisted)
    ├── Feedback Store (self-annealing preferences)
    └── API Client (cached, App Passwords + WC keys)
            │
            │ REST API
            ▼
      outliyr.com WordPress
      /wp-json/wp/v2/*   (posts, pages, CPTs, media, settings)
      /wp-json/wc/v3/*   (WooCommerce products)
```

## Authentication

- **WordPress REST API:** Application Passwords (built-in since WP 5.6)
  - Env: `WP_SITE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`
- **WooCommerce REST API:** Consumer key/secret
  - Env: `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`
- **MCP OAuth 2.1:** Identical pattern to heartbeat-mcp/kit-mcp
  - Env: `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET`, `PUBLIC_URL`, `MCP_AUTH_TOKEN`

## Tool Design

Single tool (`wordpress`) with `mode` parameter. Matches heartbeat-mcp and kit-mcp pattern.

### Modes

#### `posts` — All accepted post types

| Action | Params | Returns |
|--------|--------|---------|
| `list` | `post_type`, `status`, `search`, `per_page` (10), `page`, `category`, `tag`, `orderby` | `{id, title, status, date, slug, link, type}[]` |
| `get` | `post_id` or `slug`+`post_type` | Full post with content, meta, SEO |
| `create` | `post_type`, `title`, `content`, `status` ("draft"), `excerpt`, `categories`, `tags`, `featured_media`, `meta` | `{id, link, edit_link, status}` |
| `update` | `post_id`, + fields to change | `{id, link, updated_fields}` |
| `delete` | `post_id`, `force` (false=trash) | `{id, deleted, trashed}` |

Content accepts raw Gutenberg blocks or plain HTML. RankMath SEO fields via `seo` sub-object.

#### `products` — WooCommerce

| Action | Params | Returns |
|--------|--------|---------|
| `list` | `status`, `category`, `search`, `sku`, `stock_status`, `per_page`, `page` | `{id, name, status, price, sale_price, stock_quantity, sku, permalink}[]` |
| `get` | `product_id` or `sku` | Full WC product |
| `create` | `name`, `type`, `regular_price`, `description`, `short_description`, `categories`, `images`, `sku`, `stock_quantity`, `meta_data` | `{id, permalink, status}` |
| `update` | `product_id`, + fields | `{id, updated_fields}` |
| `delete` | `product_id`, `force` | `{id, deleted}` |

#### `settings`

| Action | Params | Returns |
|--------|--------|---------|
| `get_general` | — | Core WP settings object |
| `get_option` | `option_name` | `{name, value}` |
| `update_option` | `option_name`, `option_value` | `{name, previous_value, new_value}` |
| `list_options` | `search` (prefix) | Truncated option list |

Sensitive options redacted. Critical options (`siteurl`, `home`, `active_plugins`) blocked unless `force: true`.

#### `media`

| Action | Params | Returns |
|--------|--------|---------|
| `list` | `search`, `mime_type`, `per_page`, `page` | `{id, title, url, mime_type, width, height, filesize}[]` |
| `upload_url` | `url`, `alt_text`, `title`, `post_id` | `{id, url, mime_type}` |
| `upload_base64` | `data`, `filename`, `alt_text`, `title`, `post_id` | `{id, url, mime_type}` |
| `delete` | `media_id`, `force` | `{id, deleted}` |

#### `dashboard`

| Action | Params | Returns |
|--------|--------|---------|
| `overview` | — | WP version, theme, plugin count, post counts by type, PHP version |

#### `register_types`

| Action | Params | Returns |
|--------|--------|---------|
| _(default)_ | `decisions: [{slug, action}]` | Updated registry |
| `list` | — | Current accepted/ignored types |

#### `feedback`

| Action | Params | Returns |
|--------|--------|---------|
| `set_preference` | `post_type`, `key`, `value` | Updated preferences |
| `log_correction` | `mode`, `action`, `issue`, `resolution` | Logged |
| `list` | — | All preferences and recent corrections |

## Post Type Discovery

### Pre-seeded registry (`post_type_registry.json`)

```json
{
  "accepted": {
    "post": { "label": "Posts", "rest_base": "posts" },
    "page": { "label": "Pages", "rest_base": "pages" },
    "product": { "label": "Products", "rest_base": "products", "woocommerce": true },
    "outliyr_intel": { "label": "Intelligence Builder", "rest_base": "outliyr_intel" },
    "odl_dataset": { "label": "Data Lab Datasets", "rest_base": "odl_dataset" },
    "haq_entry": { "label": "HAQ Entries", "rest_base": "haq_entry" },
    "peptide_protocol": { "label": "Peptide Protocols", "rest_base": "protocols" }
  },
  "ignored": {}
}
```

### Discovery flow

On every tool call, pre-flight check fetches `/wp-json/wp/v2/types` (cached 5 min). If new types detected:

1. Tool call is **blocked** — returns early with `new_post_types_detected: true` and the unknown types
2. User must call `register_types` mode with accept/ignore decisions
3. Only then does the original operation proceed
4. Ignored types can be re-accepted later

## Self-Annealing

### Skill-level (SKILL.md)

Changelog section at bottom of SKILL.md. Claude appends rules when user corrections form patterns. Same approach as `nick-urban-writing-style` skill.

### Server-level (feedback.json)

Persisted preferences per post type (default status, included fields, per_page defaults). Corrections log for audit trail. Server applies preferences automatically on operations — user overrides take precedence.

## Token Efficiency

- Compact response shapes — only essential fields in list views
- `per_page: 10` default, never dump all records
- Optional `fields` param for targeted responses
- Structured errors, not stack traces
- ~0.8k token schema overhead (comparable to SKILL.md but machine-readable)

## File Structure

```
mcp-servers/wp-mcp/
  src/
    index.ts              # Dual transport (stdio + HTTP/OAuth)
    oauth.ts              # OAuth 2.1 (clone from kit-mcp)
    api.ts                # WordPress + WooCommerce REST client
    tool.ts               # Single tool, mode dispatcher
    registry.ts           # Post type discovery & registration
    feedback.ts           # Self-annealing preference storage
    modes/
      posts.ts            # CRUD for all accepted post types
      products.ts         # WooCommerce product CRUD
      settings.ts         # WP options read/write
      media.ts            # Media library management
      dashboard.ts        # Site health overview
      register-types.ts   # Post type accept/ignore
      feedback.ts         # Preference management
  data/                   # Persisted (Docker volume)
    post_type_registry.json
    feedback.json
  Dockerfile              # Node 22-slim multi-stage
  package.json
  tsconfig.json
  .env.example

claude-skills/wordpress/
  SKILL.md                # Usage guidance + self-annealing changelog
```

## Deployment

- **Remote URL:** `https://wp.mcp.outliyr.com/mcp`
- **Health check:** `GET /health`
- **Coolify:** GitHub repo auto-rebuild, `data/` as persistent Docker volume
- **DNS:** A record `wp.mcp.outliyr.com` → Coolify instance (not proxied through Cloudflare)

## Relationship to Existing Skills

The `outliyr-wordpress-publish` skill can eventually be simplified to invoke the `wordpress` MCP tool for post creation, rather than maintaining its own bash script + PHP endpoint. Migration is optional and non-breaking.
