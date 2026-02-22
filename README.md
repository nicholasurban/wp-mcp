# wp-mcp

MCP server for managing WordPress (outliyr.com) from Claude across all platforms — Claude Code (desktop), Claude web, and iOS.

Single tool (`wordpress`) with 7 modes. Dual transport: stdio for local Claude Code, HTTP + OAuth 2.1 for remote/mobile access.

## Features

- **Posts**: CRUD for all registered post types — posts, pages, podcasts, and custom post types
- **Products**: WooCommerce product management via WC REST API
- **Settings**: Read/write WordPress options with safety guards (redacted secrets, protected options)
- **Media**: Upload from URL or base64, list, delete media library items
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
    posts.ts            # Post/page/CPT CRUD with RankMath SEO support
    products.ts         # WooCommerce product CRUD
    settings.ts         # WordPress options read/write
    media.ts            # Media library management
    register-types.ts   # Accept/ignore post type decisions
    feedback.ts         # Preference and correction management
  __tests__/
    api.test.ts         # API client unit tests
    registry.test.ts    # Post type registry tests
    feedback.test.ts    # Feedback store tests
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

## Usage

### Mode Reference

| Mode | Actions | Key Parameters |
|------|---------|----------------|
| `dashboard` | — | (none) |
| `posts` | list, get, create, update, delete | `post_type`, `id`, `slug`, `title`, `content`, `status`, `seo` |
| `products` | list, get, create, update, delete | `product_id`, `sku`, `regular_price`, `sale_price`, `stock_quantity` |
| `settings` | get_general, get_option, update_option, list_options | `option_name`, `option_value`, `force` |
| `media` | upload_url, upload_base64, list, delete | `url`, `data`, `filename`, `alt_text`, `mime_type` |
| `register_types` | decide, list | `decisions[]` |
| `feedback` | set_preference, log_correction, list | `post_type`, `key`, `value`, `issue`, `resolution` |

### Examples

**List recent posts:**
```json
{"mode": "posts", "action": "list", "per_page": 5}
```

**Create a draft:**
```json
{"mode": "posts", "action": "create", "title": "My Post", "content": "<p>Hello</p>", "status": "draft"}
```

**Update a WooCommerce product price:**
```json
{"mode": "products", "action": "update", "product_id": 123, "sale_price": "39.99"}
```

**Upload an image from URL:**
```json
{"mode": "media", "action": "upload_url", "url": "https://example.com/image.jpg", "alt_text": "Description"}
```

**Read a WordPress option:**
```json
{"mode": "settings", "action": "get_option", "option_name": "blogdescription"}
```

**Set RankMath SEO on create:**
```json
{"mode": "posts", "action": "create", "title": "SEO Post", "content": "...", "seo": {"title": "SEO Title", "description": "Meta description", "focus_keyword": "keyword"}}
```

### Post Type Discovery

On first use (or when new CPTs are registered in WordPress), the tool detects unknown types and returns:

```json
{"new_post_types_detected": true, "unknown_types": [...], "action_required": "Call with mode 'register_types'..."}
```

Accept or ignore each type:
```json
{"mode": "register_types", "action": "decide", "decisions": [
  {"slug": "podcast", "action": "accept"},
  {"slug": "nav_menu_item", "action": "ignore"}
]}
```

### Safety Guards

- **Settings**: Auth keys, salts, and secrets are never exposed. Protected options (`siteurl`, `home`, `active_plugins`) require `force: true`.
- **Delete**: Posts/products go to trash unless `force: true`.
- **API Client**: 60-second response cache, auto-invalidated on mutations. Retry on 429 with exponential backoff.

## Docker

```bash
docker build -t wp-mcp .
docker run -p 3000:3000 --env-file .env wp-mcp
```

Health check: `GET /health` returns `{"status": "ok"}`.

## Development

```bash
npm run dev          # Watch mode with tsx
npm test             # Run tests
npm run test:watch   # Watch mode tests
npm run build        # Compile TypeScript
```

## Tests

17 unit tests covering:
- API client (request building, auth headers, cache invalidation, error handling)
- Post type registry (accept/ignore, detection, persistence, mutual exclusion)
- Feedback store (preferences, corrections, cap enforcement, persistence)

```bash
npm test
```

## Deployment

Deployed on Coolify with Docker. DNS: `wp.mcp.outliyr.com` (A record, DNS-only, Coolify handles SSL via Let's Encrypt).

Persistent data stored in Docker volume at `/app/data/`.

## License

Private. For Outliyr use only.
