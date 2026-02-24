# wp-mcp

MCP server for managing WordPress (outliyr.com) from Claude across all platforms — Claude Code (desktop), Claude web, and iOS.

Single tool (`wordpress`) with 8 modes. Dual transport: stdio for local Claude Code, HTTP + OAuth 2.1 for remote/mobile access.

## Features

- **Posts**: CRUD for all registered post types with slug-based idempotency, category/tag name resolution, and featured image URL sideloading
- **Products**: WooCommerce product management via WC REST API
- **Settings**: Read/write WordPress options with safety guards (redacted secrets, protected options)
- **Media**: Upload from URL or base64, list, delete media library items
- **Convert**: Markdown-to-Gutenberg block conversion with AI commentary stripping and @hint custom block enhancement (9 block types)
- **Dashboard**: Site overview — title, theme, plugin count, accepted post types
- **Post Type Discovery**: Auto-detects new custom post types and blocks operations until you accept or ignore them
- **Self-Annealing**: Feedback system for per-post-type preferences and corrections log

## Architecture

```
src/
  index.ts              # Entry point — dual transport (stdio / HTTP+OAuth)
  tool.ts               # Single tool schema, pre-flight check, mode dispatcher
  api.ts                # WordPress + WooCommerce API client (Axios, caching, retry)
  oauth.ts              # OAuth 2.1 + PKCE for remote access
  registry.ts           # Post type registry with disk persistence
  feedback.ts           # Self-annealing feedback store
  modes/
    dashboard.ts        # Site overview
    posts.ts            # Post/page/CPT CRUD with idempotency, term resolution, image sideloading
    products.ts         # WooCommerce product CRUD
    settings.ts         # WordPress options read/write
    media.ts            # Media library management
    convert.ts          # Markdown → Gutenberg conversion pipeline
    register-types.ts   # Accept/ignore post type decisions
    feedback.ts         # Preference and correction management
  converter/
    inline.ts           # Inline markdown formatting (bold, italic, code, links)
    markdown.ts         # Line-by-line markdown → Gutenberg block parser
    strip.ts            # AI commentary stripping (preamble/postamble removal)
    enhance.ts          # @hint marker state machine (9 custom block types)
    icons.ts            # SVG constants and unique ID generation
  __tests__/
    api.test.ts         # API client unit tests
    registry.test.ts    # Post type registry tests
    feedback.test.ts    # Feedback store tests
    convert.test.ts     # Convert mode tests (inline, markdown, strip, enhance)
    posts.test.ts       # Posts mode tests (idempotency, term resolution, image sideload)
data/
  post_type_registry.json  # Pre-seeded accepted/ignored types
  feedback.json            # Persisted preferences and corrections
```

## Setup

### Prerequisites

- Node.js >= 18
- WordPress site with [Application Passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) enabled
- WooCommerce (optional, for products mode)

### Install

```bash
git clone https://github.com/nicholasurban/wp-mcp.git
cd wp-mcp
npm install
npm run build
```

### Configure

```bash
cp .env.example .env
# Edit .env with your credentials
```

| Variable | Required | Description |
|----------|----------|-------------|
| `WP_SITE_URL` | Yes | WordPress site URL (e.g., `https://outliyr.com`) |
| `WP_USERNAME` | Yes | WordPress username |
| `WP_APP_PASSWORD` | Yes | Application Password (create in wp-admin > Profile) |
| `WC_CONSUMER_KEY` | No | WooCommerce consumer key (for products mode) |
| `WC_CONSUMER_SECRET` | No | WooCommerce consumer secret |
| `PORT` | No | Set to enable HTTP transport (e.g., `3000`) |
| `MCP_OAUTH_CLIENT_ID` | No | OAuth client ID (required if PORT is set) |
| `MCP_OAUTH_CLIENT_SECRET` | No | OAuth client secret (required if PORT is set) |
| `PUBLIC_URL` | No | Public URL for OAuth metadata (required if PORT is set) |
| `MCP_AUTH_TOKEN` | No | Static bearer token for simplified auth |
| `DATA_DIR` | No | Override data directory path (default: `./data`) |

### Register with Claude Code (local stdio)

```bash
claude mcp add-json wp-mcp '{
  "command": "node",
  "args": ["/path/to/wp-mcp/dist/index.js"],
  "env": {
    "WP_SITE_URL": "https://your-site.com",
    "WP_USERNAME": "your-username",
    "WP_APP_PASSWORD": "xxxx xxxx xxxx xxxx xxxx xxxx",
    "WC_CONSUMER_KEY": "ck_...",
    "WC_CONSUMER_SECRET": "cs_...",
    "DATA_DIR": "/path/to/wp-mcp/data"
  }
}' --scope user
```

### Register as remote MCP (for iOS / Claude web)

```bash
claude mcp add -t http -s user \
  --header "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -- wp-mcp-remote "https://your-domain.com/mcp"
```

---

## Modes In Detail

### 1. Dashboard

Returns a site overview in a single call.

```json
{"mode": "dashboard"}
```

**Response:**
```json
{
  "site": {"title": "Outliyr", "url": "https://outliyr.com"},
  "active_theme": {"name": "GeneratePress", "version": "3.x"},
  "plugins": {"total": 83, "active": 49},
  "registered_post_types": 25,
  "accepted_post_types": ["post", "page", "podcast", "product", ...],
  "ignored_post_types": ["nav_menu_item", "gp_font", ...]
}
```

No parameters. Useful as a first call to confirm connectivity and see site state.

---

### 2. Posts

CRUD for any accepted post type: posts, pages, podcasts, and all custom post types.

**Parameters:**

| Parameter | Type | Used In | Description |
|-----------|------|---------|-------------|
| `post_type` | string | all | Post type slug (default: `"post"`). Must be accepted in registry. |
| `action` | string | all | `list`, `get`, `create`, `update`, `delete` (default: `list`) |
| `id` | number | get, update, delete | Post ID |
| `slug` | string | get, create | URL slug |
| `title` | string | create, update | Post title |
| `content` | string | create, update | Post content (HTML or Gutenberg blocks) |
| `excerpt` | string | create, update | Post excerpt |
| `status` | string | list, create, update | `draft`, `publish`, `pending`, `private`, `trash` |
| `categories` | array | list, create, update | Category IDs or names |
| `tags` | array | list, create, update | Tag IDs or names |
| `featured_media` | number | create, update | Featured image media ID |
| `featured_image_url` | string | create, update | URL to sideload as featured image (alternative to featured_media) |
| `meta` | object | create, update | Custom meta fields `{"key": "value"}` |
| `orderby` | string | list | Sort field: `date`, `title`, `modified`, `id` |
| `search` | string | list | Search query |
| `per_page` | number | list | Results per page (default: 10, max: 100) |
| `page` | number | list | Page number |
| `force` | boolean | delete | `true` = permanent delete, `false` = trash (default) |
| `seo` | object | create, update | RankMath SEO fields (see below) |

**SEO object** (RankMath):
```json
{"seo": {"title": "SEO Title %sep% Site", "description": "Meta description", "focus_keyword": "primary keyword"}}
```

SEO fields are written as post meta (`rank_math_title`, `rank_math_description`, `rank_math_focus_keyword`) via a separate API call after create/update.

**List response shape:**
```json
{"count": 3, "posts": [
  {"id": 68514, "title": "Post Title", "status": "publish", "date": "2026-02-19T19:57:50", "slug": "post-slug", "link": "https://outliyr.com/post-slug", "type": "post"}
]}
```

**Get response shape:**
```json
{"id": 68514, "title": "Post Title", "content": "<p>Full HTML...</p>", "excerpt": "...", "status": "publish", "date": "...", "modified": "...", "slug": "...", "link": "...", "type": "post", "categories": [1, 5], "tags": [12], "featured_media": 1234, "meta": {}}
```

**Create response:**
```json
{"id": 99999, "link": "https://outliyr.com/?p=99999", "edit_link": "https://outliyr.com/wp-admin/post.php?post=99999&action=edit", "status": "draft", "idempotent_hit": false}
```

**Idempotency:** When `slug` is provided on create, the tool checks for an existing post with that slug first. If found, it updates the existing post instead of creating a duplicate and returns `"idempotent_hit": true`.

**Category/tag name resolution:** `categories` and `tags` accept both numeric IDs and string names. Names are resolved to IDs via the WordPress REST API.

**Featured image sideloading:** `featured_image_url` downloads the image, uploads it to the media library, and sets it as the featured image.

**Update response:**
```json
{"id": 99999, "link": "https://outliyr.com/post-slug", "updated_fields": ["title", "content", "seo"]}
```

**Delete response:**
```json
{"id": 99999, "deleted": false, "trashed": true, "previous_status": "draft"}
```

**Post type routing:** If the post type is a WooCommerce type (e.g., `product`), the tool returns an error directing you to use `products` mode instead.

**Feedback defaults:** If `feedback` mode has been used to set `default_status` or `default_per_page` for a post type, those values are applied automatically when not explicitly provided.

**Examples:**

```json
// List published podcasts
{"mode": "posts", "action": "list", "post_type": "podcast", "status": "publish", "per_page": 5}

// Get a post by slug
{"mode": "posts", "action": "get", "slug": "future-biohacking-trends"}

// Create a page with SEO
{"mode": "posts", "action": "create", "post_type": "page", "title": "About", "content": "<p>About us</p>", "status": "draft", "seo": {"title": "About %sep% Outliyr", "description": "Learn about Outliyr"}}

// Update post content
{"mode": "posts", "action": "update", "id": 68514, "content": "<p>Updated content</p>"}

// Trash a post
{"mode": "posts", "action": "delete", "id": 99999}

// Permanently delete
{"mode": "posts", "action": "delete", "id": 99999, "force": true}
```

---

### 3. Products

WooCommerce product CRUD via `/wc/v3/products`. Only available when `WC_CONSUMER_KEY` and `WC_CONSUMER_SECRET` are configured.

**Parameters:**

| Parameter | Type | Used In | Description |
|-----------|------|---------|-------------|
| `action` | string | all | `list`, `get`, `create`, `update`, `delete` (default: `list`) |
| `product_id` | number | get, update, delete | Product ID (alias: `id`) |
| `sku` | string | list, get, create, update | Product SKU (can be used to look up a product) |
| `title` | string | create, update | Product name |
| `content` | string | create, update | Product description (full HTML) |
| `short_description` | string | create, update | Product short description |
| `status` | string | list, create, update | `draft`, `publish`, `pending`, `private` |
| `regular_price` | string | create, update | Regular price (as string, e.g., `"49.99"`) |
| `sale_price` | string | create, update | Sale price |
| `stock_quantity` | number | create, update | Stock quantity (auto-enables `manage_stock`) |
| `stock_status` | string | list | Filter: `instock`, `outofstock`, `onbackorder` |
| `product_type` | string | create | `simple`, `grouped`, `variable`, `external` (default: `simple`) |
| `categories` | array | create, update | Category IDs (wrapped as `[{"id": N}]` automatically) |
| `images` | array | create, update | Image objects: `[{"src": "url", "alt": "text"}]` |
| `meta_data` | array | create, update | WC meta: `[{"key": "name", "value": "val"}]` |
| `search` | string | list | Search query |
| `orderby` | string | list | Sort field |
| `per_page` | number | list | Results per page (default: 10) |
| `page` | number | list | Page number |
| `force` | boolean | delete | `true` = permanent delete |

**List response shape:**
```json
{"count": 3, "products": [
  {"id": 64734, "name": "Pison PERFORM", "status": "publish", "price": "299", "regular_price": "299", "sale_price": "", "stock_quantity": null, "stock_status": "instock", "sku": "", "permalink": "https://outliyr.com/shop/pison-perform", "type": "external"}
]}
```

**Get response:** Returns the full WooCommerce product object (all fields).

**Create response:**
```json
{"id": 12345, "permalink": "https://outliyr.com/?post_type=product&p=12345", "status": "draft"}
```

**Update response:**
```json
{"id": 12345, "updated_fields": ["regular_price", "sale_price"]}
```

**Examples:**

```json
// List all products
{"mode": "products", "action": "list", "per_page": 20}

// Get by SKU
{"mode": "products", "action": "get", "sku": "PISON-001"}

// Create an external product
{"mode": "products", "action": "create", "title": "New Supplement", "regular_price": "59.99", "sale_price": "49.99", "product_type": "external", "content": "<p>Description here</p>"}

// Update price and stock
{"mode": "products", "action": "update", "product_id": 64734, "sale_price": "249", "stock_quantity": 50}

// Delete
{"mode": "products", "action": "delete", "product_id": 12345, "force": true}
```

---

### 4. Settings

Read and write WordPress options via the `/wp/v2/settings` endpoint.

**Parameters:**

| Parameter | Type | Used In | Description |
|-----------|------|---------|-------------|
| `action` | string | all | `get_general`, `get_option`, `update_option`, `list_options` (default: `get_general`) |
| `option_name` | string | get_option, update_option | WordPress option key |
| `option_value` | any | update_option | New value for the option |
| `search` | string | list_options | Filter options by key substring |
| `force` | boolean | update_option | Required for protected options |

**Safety rules:**

*Redacted options* (never exposed, never writable):
`auth_key`, `auth_salt`, `logged_in_key`, `logged_in_salt`, `nonce_key`, `nonce_salt`, `secure_auth_key`, `secure_auth_salt`, `db_password`, `ftp_credentials`

*Protected options* (require `force: true` to modify):
`siteurl`, `home`, `active_plugins`, `template`, `stylesheet`, `users_can_register`, `default_role`

**Note:** Only options registered with `show_in_rest` in WordPress are accessible. For custom options not exposed via the REST API, a custom endpoint on the WordPress side is required.

**get_general response:**
```json
{"title": "Outliyr", "description": "Bioharmonizing science...", "url": "https://outliyr.com", "email": "nick@outliyr.com", "timezone": "America/Chicago", "date_format": "m/d/Y", "time_format": "g:i A", "language": "", "posts_per_page": 27}
```

**list_options response:**
```json
{"count": 42, "options": [
  {"name": "blogname", "value_preview": "Outliyr"},
  {"name": "blogdescription", "value_preview": "Bioharmonizing science for the ultimate quality of life"}
]}
```
Values are truncated to 100 characters in preview. Redacted options are filtered out.

**update_option response:**
```json
{"name": "blogdescription", "previous_value": "Old description", "new_value": "New description"}
```

**Examples:**

```json
// Get site settings
{"mode": "settings", "action": "get_general"}

// Read a specific option
{"mode": "settings", "action": "get_option", "option_name": "posts_per_page"}

// Update site description
{"mode": "settings", "action": "update_option", "option_name": "blogdescription", "option_value": "New tagline"}

// Update a protected option (requires force)
{"mode": "settings", "action": "update_option", "option_name": "users_can_register", "option_value": false, "force": true}

// Search options by keyword
{"mode": "settings", "action": "list_options", "search": "rank_math"}
```

---

### 5. Media

Upload, list, and delete WordPress media library items.

**Parameters:**

| Parameter | Type | Used In | Description |
|-----------|------|---------|-------------|
| `action` | string | all | `list`, `upload_url`, `upload_base64`, `delete` (default: `list`) |
| `url` | string | upload_url | URL to download and sideload into media library |
| `data` | string | upload_base64 | Base64-encoded file data |
| `filename` | string | upload_base64 | Required filename for base64 uploads |
| `title` | string | upload_url, upload_base64 | Media title |
| `alt_text` | string | upload_url, upload_base64 | Image alt text |
| `mime_type` | string | list, upload_base64 | MIME type filter (list) or override (upload) |
| `post_id` | number | upload_url, upload_base64 | Attach uploaded media to this post |
| `media_id` | number | delete | Media item ID (alias: `id`) |
| `search` | string | list | Search media by title |
| `per_page` | number | list | Results per page (default: 10) |
| `page` | number | list | Page number |
| `force` | boolean | delete | Media deletes are permanent by default (`force: true`) |

**Supported MIME types for auto-detection** (upload_url infers from URL, upload_base64 infers from filename):
`jpg/jpeg`, `png`, `gif`, `webp`, `svg`, `pdf`, `mp4`, `mp3`

**List response shape:**
```json
{"count": 3, "media": [
  {"id": 68627, "title": "Image Title", "url": "https://outliyr.com/wp-content/uploads/image.png", "mime_type": "image/png", "width": 1200, "height": 630, "filesize": 22306, "alt_text": "", "date": "2026-02-21T15:20:08"}
]}
```

**Upload response:**
```json
{"id": 99999, "url": "https://outliyr.com/wp-content/uploads/2026/02/hero.jpg", "mime_type": "image/jpeg"}
```

**Examples:**

```json
// List recent images
{"mode": "media", "action": "list", "mime_type": "image", "per_page": 20}

// Upload from URL
{"mode": "media", "action": "upload_url", "url": "https://example.com/hero.jpg", "title": "Hero Image", "alt_text": "A description of the image"}

// Upload from URL and attach to a post
{"mode": "media", "action": "upload_url", "url": "https://example.com/photo.png", "post_id": 68514}

// Upload base64 image
{"mode": "media", "action": "upload_base64", "data": "iVBORw0KGgo...", "filename": "chart.png", "alt_text": "Performance chart"}

// Delete media item
{"mode": "media", "action": "delete", "media_id": 99999}

// Search
{"mode": "media", "action": "list", "search": "pison"}
```

---

### 6. Register Types

Manage post type discovery. On every non-register_types/feedback call, a pre-flight check queries `/wp/v2/types` and compares against the registry. If new types are detected, all other operations are blocked until you decide.

**Parameters:**

| Parameter | Type | Used In | Description |
|-----------|------|---------|-------------|
| `action` | string | all | `decide` or `list` (default: `decide`) |
| `decisions` | array | decide | Array of `{"slug": "type_slug", "action": "accept"}` or `{"slug": "type_slug", "action": "ignore"}` |

**Built-in types auto-ignored** (filtered before detection):
`attachment`, `revision`, `wp_block`, `wp_template`, `wp_template_part`, `wp_navigation`, `wp_global_styles`, `wp_font_family`, `wp_font_face`, `custom_css`, `customize_changeset`, `oembed_cache`, `user_request`

**Pre-flight blocking response** (returned instead of your actual request):
```json
{
  "new_post_types_detected": true,
  "unknown_types": [
    {"slug": "new_cpt", "label": "New CPT", "rest_base": "new_cpt", "public": true}
  ],
  "action_required": "New post types detected on WordPress. Call this tool with mode 'register_types' to accept or ignore each type before proceeding with other operations."
}
```

**Decide response:**
```json
{
  "decisions": [
    {"slug": "podcast", "action": "accepted", "result": "ok"},
    {"slug": "nav_menu_item", "action": "ignored", "result": "ok"}
  ],
  "registry": {
    "accepted": {"post": {"label": "Posts", "rest_base": "posts", "accepted_at": "2026-02-22"}, ...},
    "ignored": {"nav_menu_item": {"label": "Navigation Menu Items", "ignored_at": "2026-02-22"}, ...}
  }
}
```

**List response:** Returns the full registry state (accepted + ignored maps).

**Pre-seeded accepted types:**
`post`, `page`, `podcast`, `product` (WooCommerce), `outliyr_intel`, `odl_dataset`, `haq_entry`, `peptide_protocol`, `gp_elements`, `gblocks_templates`, `rank_math_schema`

**Pre-seeded ignored types:**
`nav_menu_item`, `bp3d-model-viewer`, `guests`, `gp_font`, `gblocks_styles`, `gblocks_condition`, `gblocks_overlay`, `gblocks_global_style`

**Accept/ignore is mutually exclusive:** Accepting a previously ignored type moves it from ignored to accepted (and vice versa). Decisions are persisted to `data/post_type_registry.json`.

---

### 7. Feedback

Self-annealing feedback system. Set per-post-type preferences and log corrections so behavior improves over time.

**Parameters:**

| Parameter | Type | Used In | Description |
|-----------|------|---------|-------------|
| `action` | string | all | `set_preference`, `log_correction`, `list` (default: `list`) |
| `post_type` | string | set_preference, log_correction | Target post type or mode context (default: `"post"` for preferences, `"general"` for corrections) |
| `key` | string | set_preference | Preference key (e.g., `"default_status"`, `"default_per_page"`) |
| `value` | any | set_preference | Preference value |
| `issue` | string | log_correction | Description of what went wrong |
| `resolution` | string | log_correction | How it was fixed |

**How preferences are applied:**
- `default_status`: Used as the default status for `create` actions when `status` is not explicitly provided. Applied in both `posts` and `products` modes.
- `default_per_page`: Used as the default `per_page` for `list` actions when not explicitly provided.
- Custom keys can be set freely — they're stored but only the above keys are currently consumed by mode handlers.

**Corrections log:** Capped at 100 entries (oldest removed first). Each entry records the post type context, a "correction" tag, the issue, and resolution with a timestamp.

**set_preference response:**
```json
{"ok": true, "post_type": "post", "key": "default_status", "value": "publish", "all_preferences": {"default_status": "publish"}}
```

**log_correction response:**
```json
{"ok": true, "logged": {"mode": "post", "issue": "Created posts as draft instead of publish", "resolution": "Set default_status preference to publish"}}
```

**list response:**
```json
{"field_preferences": {"post": {"default_status": "publish"}, "product": {"default_per_page": 20}}, "corrections_log": []}
```

**Examples:**

```json
// Set default status for new posts
{"mode": "feedback", "action": "set_preference", "post_type": "post", "key": "default_status", "value": "publish"}

// Set default per_page for product listings
{"mode": "feedback", "action": "set_preference", "post_type": "product", "key": "default_per_page", "value": 20}

// Log a correction
{"mode": "feedback", "action": "log_correction", "post_type": "podcast", "issue": "Podcast content was missing the transcript shortcode", "resolution": "Always wrap transcripts in [otr_transcript] shortcode"}

// View all feedback state
{"mode": "feedback", "action": "list"}
```

---

### 8. Convert

Convert markdown content to WordPress Gutenberg block markup. Three-stage pipeline: strip AI commentary, enhance @hint markers, convert markdown to blocks.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | string | Markdown content to convert (required) |
| `strip_ai_commentary` | boolean | Remove LLM preamble/postamble (e.g., "Sure, here is the article...") |
| `enhance` | boolean | Process `<!-- @hint -->` markers into custom Gutenberg blocks |

**Pipeline order:** strip → enhance → convert. Each stage is optional (gated by its boolean flag), but markdown conversion always runs.

**Supported @hint markers** (when `enhance: true`):

| Hint | Block Generated |
|------|----------------|
| `<!-- @click-to-tweet -->` | `wp:bctt/clicktotweet` |
| `<!-- @protip -->` | GenerateBlocks container with lightbulb icon |
| `<!-- @discount -->` | GenerateBlocks container with fire icon |
| `<!-- @faq -->` | `wp:rank-math/faq-block` with Q/A pairs |
| `<!-- @cta url="..." text="..." -->` | GenerateBlocks button (self-closing) |
| `<!-- @key-takeaways -->` | Accordion with DNA emoji items |
| `<!-- @jump-links -->` | Star-icon overview container |
| `<!-- @data-lab -->` | `wp:outliyr/data-lab` block |
| `<!-- @product-roundup -->` | Nested product card with sub-sections |

**Markdown conversion** handles: headings (H2-H6 with optional CSS class), paragraphs, ordered/unordered lists, images, blockquotes, code blocks, tables, shortcodes, and raw Gutenberg block passthrough.

**Response:**
```json
{"content": "<!-- wp:heading -->\n<h2 class=\"wp-block-heading\">Hello World</h2>\n<!-- /wp:heading -->\n\n<!-- wp:paragraph -->\n<p>A paragraph with <strong>bold</strong> text.</p>\n<!-- /wp:paragraph -->"}
```

**Examples:**

```json
// Basic markdown conversion
{"mode": "convert", "content": "## Hello World\n\nA paragraph with **bold** text."}

// Full pipeline with AI stripping and hint enhancement
{"mode": "convert", "content": "Sure, here is the article:\n\n## Heading\n\n<!-- @protip -->\nA useful tip\n<!-- @end -->\n\nRegular paragraph.\n\nLet me know if you need changes!", "strip_ai_commentary": true, "enhance": true}
```

---

## API Client Details

The `WordPressAPI` class manages two Axios instances:

| Client | Base URL | Auth | Used For |
|--------|----------|------|----------|
| WordPress | `{WP_SITE_URL}/wp-json` | Basic Auth (Application Passwords) | All `/wp/v2/` endpoints |
| WooCommerce | `{WP_SITE_URL}/wp-json` | Consumer Key/Secret (query params) | All `/wc/v3/` endpoints |

**Caching:** GET responses are cached for 60 seconds. Cache is cleared on any POST/PUT/DELETE mutation. Maximum 1000 cache entries (LRU eviction).

**Retry:** 429 (rate-limited) responses trigger automatic retry with exponential backoff (3 attempts max).

**Error handling:** API errors are caught and returned as structured JSON with the status code, message, and endpoint.

---

## Docker

```bash
docker build -t wp-mcp .
docker run -p 3000:3000 --env-file .env wp-mcp
```

Multi-stage build using `node:22-slim`. Includes `curl` for Docker health checks.

Health check: `GET /health` returns `{"status": "ok"}`.

The `data/` directory is copied into the image at `/app/data/`. For persistence across container restarts, mount a Docker volume at `/app/data/`.

## Development

```bash
npm run dev          # Watch mode with tsx
npm test             # Run tests
npm run test:watch   # Watch mode tests
npm run build        # Compile TypeScript
```

## Tests

66 unit tests covering:
- **API client** (4 tests): Request building, auth headers for WP and WC clients, cache invalidation on mutations, error handling
- **Post type registry** (8 tests): Accept/ignore, detection of new types, persistence to disk, mutual exclusion, built-in type filtering
- **Feedback store** (5 tests): Set/get preferences, per-post-type isolation, corrections logging, 100-entry cap, persistence
- **Convert mode** (35 tests): Inline formatting (6), markdown→Gutenberg (14), AI commentary stripping (5), @hint enhancement (10)
- **Posts mode** (14 tests): Slug-based idempotency (4), category/tag name resolution (6), featured image URL sideloading (4)

```bash
npm test
```

## Deployment

Deployed on Coolify with Docker. DNS: `wp.mcp.outliyr.com` (A record, DNS-only, Coolify handles SSL via Let's Encrypt).

Persistent data stored in Docker volume at `/app/data/`.

## License

Private. For Outliyr use only.
