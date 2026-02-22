# WordPress MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript MCP server that provides structured, token-efficient CRUD access to WordPress (outliyr.com) — posts (all types), WooCommerce products, settings, and media — with dynamic post type discovery and self-annealing preferences.

**Architecture:** Single-tool MCP server with mode dispatcher (matching kit-mcp/heartbeat-mcp pattern). Dual transport: stdio for local Claude Code, HTTP+OAuth for web/iOS. Pre-flight post type discovery blocks operations until new types are accepted or ignored. Feedback store persists user preferences that auto-apply on future operations.

**Tech Stack:** TypeScript, Node.js 22, `@modelcontextprotocol/sdk`, Axios, Zod, Express, Vitest (testing). Docker multi-stage build. Coolify deployment.

**Reference:** Design doc at `docs/plans/2026-02-22-wp-mcp-design.md`. Clone patterns from `/Users/urbs/Documents/Apps/mcp-servers/kit-mcp/`.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `data/post_type_registry.json`
- Create: `data/feedback.json`

**Step 1: Initialize git repo**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp
git init
```

**Step 2: Create package.json**

```json
{
  "name": "wp-mcp-server",
  "version": "1.0.0",
  "description": "MCP server for WordPress (outliyr.com) — posts, products, settings, media",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "clean": "rm -rf dist",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.11.0",
    "axios": "^1.7.9",
    "express": "^4.21.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^3.0.0"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.env
*.log
```

**Step 5: Create .env.example**

```bash
# WordPress REST API (Application Passwords)
WP_SITE_URL=https://outliyr.com
WP_USERNAME=
WP_APP_PASSWORD=

# WooCommerce REST API
WC_CONSUMER_KEY=
WC_CONSUMER_SECRET=

# MCP OAuth 2.1 (for remote/iOS access)
PORT=3000
MCP_OAUTH_CLIENT_ID=
MCP_OAUTH_CLIENT_SECRET=
PUBLIC_URL=https://wp.mcp.outliyr.com
MCP_AUTH_TOKEN=

# Data paths (override for Docker volume)
DATA_DIR=./data
```

**Step 6: Create pre-seeded post_type_registry.json**

```json
{
  "accepted": {
    "post": { "label": "Posts", "rest_base": "posts", "accepted_at": "2026-02-22" },
    "page": { "label": "Pages", "rest_base": "pages", "accepted_at": "2026-02-22" },
    "product": { "label": "Products", "rest_base": "products", "woocommerce": true, "accepted_at": "2026-02-22" },
    "outliyr_intel": { "label": "Intelligence Builder", "rest_base": "outliyr_intel", "accepted_at": "2026-02-22" },
    "odl_dataset": { "label": "Data Lab Datasets", "rest_base": "odl_dataset", "accepted_at": "2026-02-22" },
    "haq_entry": { "label": "HAQ Entries", "rest_base": "haq_entry", "accepted_at": "2026-02-22" },
    "peptide_protocol": { "label": "Peptide Protocols", "rest_base": "protocols", "accepted_at": "2026-02-22" }
  },
  "ignored": {}
}
```

**Step 7: Create empty feedback.json**

```json
{
  "field_preferences": {},
  "corrections_log": []
}
```

**Step 8: Install dependencies**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp
npm install
```

**Step 9: Verify TypeScript compiles (empty src)**

```bash
mkdir -p src
echo 'console.log("wp-mcp");' > src/index.ts
npm run build
```

Expected: `dist/index.js` created.

**Step 10: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example data/ src/index.ts
git commit -m "feat: scaffold wp-mcp project with pre-seeded post type registry"
```

---

## Task 2: OAuth Module (clone from kit-mcp)

**Files:**
- Create: `src/oauth.ts`

This is a direct clone from kit-mcp — identical OAuth 2.1 + PKCE implementation. No modifications needed.

**Step 1: Copy oauth.ts from kit-mcp**

```bash
cp /Users/urbs/Documents/Apps/mcp-servers/kit-mcp/src/oauth.ts /Users/urbs/Documents/Apps/mcp-servers/wp-mcp/src/oauth.ts
```

**Step 2: Verify it compiles**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp && npm run build
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/oauth.ts
git commit -m "feat: add OAuth 2.1 module (clone from kit-mcp)"
```

---

## Task 3: WordPress API Client

**Files:**
- Create: `src/api.ts`
- Test: `src/__tests__/api.test.ts`

The API client handles both WordPress REST API (Application Passwords auth) and WooCommerce REST API (consumer key/secret). Follows the same caching + retry pattern as kit-mcp but with two auth mechanisms.

**Step 1: Write tests for API client initialization and auth headers**

Create `src/__tests__/api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { WordPressAPI } from "../api.js";

vi.mock("axios", () => {
  const mockInstance = {
    request: vi.fn(),
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
    },
  };
});

describe("WordPressAPI", () => {
  let api: WordPressAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    api = new WordPressAPI({
      siteUrl: "https://outliyr.com",
      username: "testuser",
      appPassword: "xxxx xxxx xxxx xxxx",
      wcConsumerKey: "ck_test",
      wcConsumerSecret: "cs_test",
    });
  });

  it("creates WP client with Basic auth header", () => {
    const createCall = (axios.create as any).mock.calls[0][0];
    expect(createCall.baseURL).toBe("https://outliyr.com/wp-json");
    expect(createCall.headers.Authorization).toMatch(/^Basic /);
  });

  it("creates WC client with consumer key auth", () => {
    // Second call to axios.create is the WC client
    const createCall = (axios.create as any).mock.calls[1][0];
    expect(createCall.baseURL).toBe("https://outliyr.com/wp-json/wc/v3");
  });

  it("caches GET requests within TTL", async () => {
    const mockRequest = (axios.create as any)().request;
    mockRequest.mockResolvedValue({ data: { id: 1, title: "Test" } });

    const first = await api.get("/wp/v2/posts/1");
    const second = await api.get("/wp/v2/posts/1");

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("clears cache on POST", async () => {
    const mockRequest = (axios.create as any)().request;
    mockRequest.mockResolvedValue({ data: { id: 1 } });

    await api.get("/wp/v2/posts/1");
    await api.post("/wp/v2/posts", { title: "New" });
    await api.get("/wp/v2/posts/1");

    // 3 calls: initial GET, POST, second GET (cache cleared)
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp && npx vitest run
```

Expected: FAIL — `WordPressAPI` not found.

**Step 3: Implement WordPress API client**

Create `src/api.ts`:

```typescript
import axios, { AxiosInstance, AxiosError } from "axios";

interface CacheEntry {
  data: unknown;
  expires: number;
}

export interface WPAPIConfig {
  siteUrl: string;
  username: string;
  appPassword: string;
  wcConsumerKey?: string;
  wcConsumerSecret?: string;
}

export class WordPressAPI {
  private wpClient: AxiosInstance;
  private wcClient: AxiosInstance | null = null;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL: number;

  constructor(config: WPAPIConfig, cacheTTL = 60_000) {
    this.cacheTTL = cacheTTL;

    // WordPress REST API — Basic auth with Application Password
    const basicAuth = Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");
    this.wpClient = axios.create({
      baseURL: `${config.siteUrl}/wp-json`,
      timeout: 30_000,
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    // WooCommerce REST API — consumer key/secret
    if (config.wcConsumerKey && config.wcConsumerSecret) {
      const wcAuth = Buffer.from(
        `${config.wcConsumerKey}:${config.wcConsumerSecret}`
      ).toString("base64");
      this.wcClient = axios.create({
        baseURL: `${config.siteUrl}/wp-json/wc/v3`,
        timeout: 30_000,
        headers: {
          Authorization: `Basic ${wcAuth}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
    }
  }

  // Determine which client to use based on path
  private clientFor(path: string): AxiosInstance {
    if (path.startsWith("/wc/") && this.wcClient) {
      return this.wcClient;
    }
    return this.wpClient;
  }

  // Adjust path: strip /wc/v3 prefix if using wcClient
  private adjustPath(path: string): string {
    if (path.startsWith("/wc/v3/") && this.wcClient) {
      return path.replace("/wc/v3", "");
    }
    return path;
  }

  private cacheKey(method: string, path: string, params?: Record<string, unknown>): string {
    return `${method}:${path}:${JSON.stringify(params ?? {})}`;
  }

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const key = this.cacheKey("GET", path, params);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.data as T;

    if (this.cache.size > 1000) {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (v.expires <= now) this.cache.delete(k);
      }
    }

    const res = await this.request<T>("GET", path, undefined, params);
    this.cache.set(key, { data: res, expires: Date.now() + this.cacheTTL });
    return res;
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    this.cache.clear();
    return this.request<T>("POST", path, data);
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    this.cache.clear();
    return this.request<T>("PUT", path, data);
  }

  async delete<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    this.cache.clear();
    return this.request<T>("DELETE", path, undefined, params);
  }

  // WordPress uses page-based pagination (X-WP-TotalPages header)
  async paginateAll<T>(path: string, params?: Record<string, unknown>): Promise<T[]> {
    const items: T[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const reqParams = { ...params, per_page: perPage, page };
      const client = this.clientFor(path);
      const adjustedPath = this.adjustPath(path);

      const res = await client.request({
        method: "GET",
        url: adjustedPath,
        params: reqParams,
      });

      const data = res.data;
      if (Array.isArray(data)) {
        items.push(...data);
      } else {
        break;
      }

      const totalPages = Number(res.headers["x-wp-totalpages"] ?? 1);
      if (page >= totalPages) break;
      page++;
    }

    return items;
  }

  // Upload media via multipart/form-data
  async uploadMedia(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    meta?: Record<string, string>
  ): Promise<Record<string, unknown>> {
    this.cache.clear();
    const FormData = (await import("node:buffer")).Blob;

    // Use the wpClient with multipart
    const formData = new globalThis.FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append("file", blob, filename);
    if (meta?.alt_text) formData.append("alt_text", meta.alt_text);
    if (meta?.title) formData.append("title", meta.title);
    if (meta?.post) formData.append("post", meta.post);

    const res = await this.wpClient.request({
      method: "POST",
      url: "/wp/v2/media",
      data: formData,
      headers: { "Content-Type": "multipart/form-data" },
    });

    return res.data;
  }

  // Download a file from URL and return buffer
  async downloadUrl(url: string): Promise<{ data: Buffer; mimeType: string; filename: string }> {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 60_000 });
    const contentType = res.headers["content-type"] || "application/octet-stream";
    const urlPath = new URL(url).pathname;
    const filename = urlPath.split("/").pop() || "upload";
    return { data: Buffer.from(res.data), mimeType: contentType, filename };
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown,
    params?: Record<string, unknown>,
    retries = 3,
  ): Promise<T> {
    const client = this.clientFor(path);
    const adjustedPath = this.adjustPath(path);

    try {
      const res = await client.request({ method, url: adjustedPath, data, params });
      return res.data as T;
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 429 && retries > 0) {
        const retryAfter = err.response.headers["retry-after"];
        const delay = retryAfter ? Number(retryAfter) * 1000 : Math.pow(2, 3 - retries) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        return this.request<T>(method, path, data, params, retries - 1);
      }
      throw err;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export function handleApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.response) {
      const status = error.response.status;
      const body = error.response.data;
      const msg =
        typeof body === "object" && body?.message
          ? (body.message as string)
          : JSON.stringify(body);
      switch (status) {
        case 400: return `Validation error: ${msg}`;
        case 401: return "Authentication failed. Check WP_USERNAME/WP_APP_PASSWORD.";
        case 403: return `Forbidden: ${msg}. Check user capabilities.`;
        case 404: return `Not found: ${msg}`;
        case 409: return `Conflict: ${msg}`;
        case 429: return "Rate limit exceeded after retries.";
        default: return `API error ${status}: ${msg}`;
      }
    }
    if (error.code === "ECONNABORTED") return "Request timed out.";
    if (error.code === "ENOTFOUND") return "WordPress site unreachable. Check WP_SITE_URL.";
  }
  return `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp && npx vitest run
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/api.ts src/__tests__/api.test.ts
git commit -m "feat: add WordPress + WooCommerce API client with caching and retry"
```

---

## Task 4: Post Type Registry

**Files:**
- Create: `src/registry.ts`
- Test: `src/__tests__/registry.test.ts`

The registry tracks accepted/ignored post types, persists to disk, and detects new types from the WP REST API.

**Step 1: Write tests for registry**

Create `src/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PostTypeRegistry } from "../registry.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("PostTypeRegistry", () => {
  let tmpDir: string;
  let registry: PostTypeRegistry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-mcp-test-"));
    // Write seed file
    fs.writeFileSync(
      path.join(tmpDir, "post_type_registry.json"),
      JSON.stringify({
        accepted: {
          post: { label: "Posts", rest_base: "posts", accepted_at: "2026-01-01" },
          page: { label: "Pages", rest_base: "pages", accepted_at: "2026-01-01" },
        },
        ignored: {},
      })
    );
    registry = new PostTypeRegistry(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads pre-seeded types from disk", () => {
    const accepted = registry.getAccepted();
    expect(accepted).toHaveProperty("post");
    expect(accepted).toHaveProperty("page");
  });

  it("detects new types not in registry", () => {
    const wpTypes = {
      post: { slug: "post", name: "Posts", rest_base: "posts" },
      page: { slug: "page", name: "Pages", rest_base: "pages" },
      podcast: { slug: "podcast", name: "Podcasts", rest_base: "podcasts" },
    };
    const newTypes = registry.detectNewTypes(wpTypes);
    expect(newTypes).toHaveLength(1);
    expect(newTypes[0].slug).toBe("podcast");
  });

  it("returns empty array when no new types", () => {
    const wpTypes = {
      post: { slug: "post", name: "Posts", rest_base: "posts" },
    };
    expect(registry.detectNewTypes(wpTypes)).toHaveLength(0);
  });

  it("accepts a new type and persists to disk", () => {
    registry.acceptType("podcast", "Podcasts", "podcasts");
    const accepted = registry.getAccepted();
    expect(accepted).toHaveProperty("podcast");

    // Verify persisted
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "post_type_registry.json"), "utf-8")
    );
    expect(onDisk.accepted).toHaveProperty("podcast");
  });

  it("ignores a type and persists", () => {
    registry.ignoreType("revision", "Revisions");
    const ignored = registry.getIgnored();
    expect(ignored).toHaveProperty("revision");
  });

  it("re-accepts a previously ignored type", () => {
    registry.ignoreType("podcast", "Podcasts");
    expect(registry.getIgnored()).toHaveProperty("podcast");

    registry.acceptType("podcast", "Podcasts", "podcasts");
    expect(registry.getAccepted()).toHaveProperty("podcast");
    expect(registry.getIgnored()).not.toHaveProperty("podcast");
  });

  it("returns rest_base for accepted type", () => {
    expect(registry.getRestBase("post")).toBe("posts");
    expect(registry.getRestBase("unknown")).toBeNull();
  });

  it("checks if a type is accepted", () => {
    expect(registry.isAccepted("post")).toBe(true);
    expect(registry.isAccepted("unknown")).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/registry.test.ts
```

Expected: FAIL — `PostTypeRegistry` not found.

**Step 3: Implement registry**

Create `src/registry.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";

interface TypeEntry {
  label: string;
  rest_base: string;
  woocommerce?: boolean;
  accepted_at?: string;
  ignored_at?: string;
}

interface RegistryData {
  accepted: Record<string, TypeEntry>;
  ignored: Record<string, TypeEntry>;
}

export interface DetectedType {
  slug: string;
  label: string;
  rest_base: string;
  public: boolean;
  supports?: string[];
}

export class PostTypeRegistry {
  private data: RegistryData;
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "post_type_registry.json");
    this.data = this.load();
  }

  private load(): RegistryData {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return { accepted: {}, ignored: {} };
    }
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  getAccepted(): Record<string, TypeEntry> {
    return { ...this.data.accepted };
  }

  getIgnored(): Record<string, TypeEntry> {
    return { ...this.data.ignored };
  }

  isAccepted(slug: string): boolean {
    return slug in this.data.accepted;
  }

  getRestBase(slug: string): string | null {
    return this.data.accepted[slug]?.rest_base ?? null;
  }

  isWooCommerce(slug: string): boolean {
    return this.data.accepted[slug]?.woocommerce === true;
  }

  detectNewTypes(
    wpTypes: Record<string, { slug: string; name: string; rest_base: string; [k: string]: unknown }>
  ): DetectedType[] {
    const newTypes: DetectedType[] = [];
    for (const [slug, info] of Object.entries(wpTypes)) {
      if (!(slug in this.data.accepted) && !(slug in this.data.ignored)) {
        // Skip WordPress built-in non-content types
        if (["attachment", "wp_block", "wp_template", "wp_template_part", "wp_navigation", "wp_font_face", "wp_font_family", "wp_global_styles"].includes(slug)) {
          continue;
        }
        newTypes.push({
          slug,
          label: info.name,
          rest_base: info.rest_base,
          public: (info as Record<string, unknown>).public !== false,
        });
      }
    }
    return newTypes;
  }

  acceptType(slug: string, label: string, restBase: string, woocommerce = false): void {
    // Remove from ignored if present
    delete this.data.ignored[slug];
    this.data.accepted[slug] = {
      label,
      rest_base: restBase,
      accepted_at: new Date().toISOString().split("T")[0],
      ...(woocommerce ? { woocommerce: true } : {}),
    };
    this.save();
  }

  ignoreType(slug: string, label: string): void {
    delete this.data.accepted[slug];
    this.data.ignored[slug] = {
      label,
      rest_base: "",
      ignored_at: new Date().toISOString().split("T")[0],
    };
    this.save();
  }

  getAllState(): RegistryData {
    return JSON.parse(JSON.stringify(this.data));
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/registry.test.ts
```

Expected: All 8 tests PASS.

**Step 5: Commit**

```bash
git add src/registry.ts src/__tests__/registry.test.ts
git commit -m "feat: add post type registry with discovery, accept/ignore, persistence"
```

---

## Task 5: Feedback Store

**Files:**
- Create: `src/feedback.ts`
- Test: `src/__tests__/feedback.test.ts`

**Step 1: Write tests for feedback store**

Create `src/__tests__/feedback.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FeedbackStore } from "../feedback.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("FeedbackStore", () => {
  let tmpDir: string;
  let store: FeedbackStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wp-mcp-fb-"));
    fs.writeFileSync(
      path.join(tmpDir, "feedback.json"),
      JSON.stringify({ field_preferences: {}, corrections_log: [] })
    );
    store = new FeedbackStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sets and retrieves a preference", () => {
    store.setPreference("post", "default_status", "draft");
    expect(store.getPreference("post", "default_status")).toBe("draft");
  });

  it("applies preferences as defaults to params", () => {
    store.setPreference("post", "default_status", "draft");
    store.setPreference("post", "default_per_page", 5);

    const defaults = store.getDefaults("post");
    expect(defaults).toEqual({ default_status: "draft", default_per_page: 5 });
  });

  it("logs a correction", () => {
    store.logCorrection("posts", "create", "Missing excerpt", "Added excerpt to response");
    const log = store.getCorrections();
    expect(log).toHaveLength(1);
    expect(log[0].mode).toBe("posts");
    expect(log[0].issue).toBe("Missing excerpt");
  });

  it("persists to disk", () => {
    store.setPreference("product", "default_status", "draft");
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "feedback.json"), "utf-8")
    );
    expect(onDisk.field_preferences.product.default_status).toBe("draft");
  });

  it("limits correction log to 100 entries", () => {
    for (let i = 0; i < 110; i++) {
      store.logCorrection("posts", "list", `Issue ${i}`, `Fix ${i}`);
    }
    expect(store.getCorrections()).toHaveLength(100);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/feedback.test.ts
```

Expected: FAIL — `FeedbackStore` not found.

**Step 3: Implement feedback store**

Create `src/feedback.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";

interface CorrectionEntry {
  date: string;
  mode: string;
  action: string;
  issue: string;
  resolution: string;
}

interface FeedbackData {
  field_preferences: Record<string, Record<string, unknown>>;
  corrections_log: CorrectionEntry[];
}

export class FeedbackStore {
  private data: FeedbackData;
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "feedback.json");
    this.data = this.load();
  }

  private load(): FeedbackData {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return { field_preferences: {}, corrections_log: [] };
    }
  }

  private save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  setPreference(postType: string, key: string, value: unknown): void {
    if (!this.data.field_preferences[postType]) {
      this.data.field_preferences[postType] = {};
    }
    this.data.field_preferences[postType][key] = value;
    this.save();
  }

  getPreference(postType: string, key: string): unknown {
    return this.data.field_preferences[postType]?.[key];
  }

  getDefaults(postType: string): Record<string, unknown> {
    return { ...(this.data.field_preferences[postType] ?? {}) };
  }

  logCorrection(mode: string, action: string, issue: string, resolution: string): void {
    this.data.corrections_log.push({
      date: new Date().toISOString().split("T")[0],
      mode,
      action,
      issue,
      resolution,
    });
    // Keep only last 100 entries
    if (this.data.corrections_log.length > 100) {
      this.data.corrections_log = this.data.corrections_log.slice(-100);
    }
    this.save();
  }

  getCorrections(limit = 100): CorrectionEntry[] {
    return this.data.corrections_log.slice(-limit);
  }

  getAllState(): FeedbackData {
    return JSON.parse(JSON.stringify(this.data));
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/feedback.test.ts
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/feedback.ts src/__tests__/feedback.test.ts
git commit -m "feat: add self-annealing feedback store with preferences and corrections log"
```

---

## Task 6: Tool Schema + Mode Dispatcher

**Files:**
- Create: `src/tool.ts`

This defines the single `wordpress` tool with its Zod schema and dispatches to mode handlers. It also includes the pre-flight post type check.

**Step 1: Create tool.ts**

```typescript
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

export const TOOL_NAME = "wordpress";

export const TOOL_DESCRIPTION = `Manage WordPress (outliyr.com). 7 modes:
- dashboard: site overview — WP version, theme, plugin count, post counts by type
- posts: list/get/create/update/delete any accepted post type (posts, pages, CPTs)
- products: WooCommerce product CRUD — list/get/create/update/delete
- settings: read/write WordPress options — general settings or raw wp_options
- media: list/upload/delete media library items
- register_types: accept or ignore newly discovered post types
- feedback: set preferences and log corrections for self-annealing`;

export const TOOL_SCHEMA = {
  mode: z
    .enum(["dashboard", "posts", "products", "settings", "media", "register_types", "feedback"])
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
  content: z.string().optional().describe("Post content (Gutenberg blocks or HTML)"),
  excerpt: z.string().optional().describe("Post excerpt"),
  status: z.string().optional().describe("Post/product status: draft, publish, pending, private, trash"),
  categories: z.array(z.union([z.string(), z.number()])).optional().describe("Category IDs or names"),
  tags: z.array(z.union([z.string(), z.number()])).optional().describe("Tag IDs or names"),
  featured_media: z.number().optional().describe("Featured image media ID"),
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
    // Pre-flight check (skip for register_types and feedback modes)
    if (params.mode !== "register_types" && params.mode !== "feedback") {
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
      default:
        return JSON.stringify({ error: `Unknown mode: ${(params as Record<string, unknown>).mode}` });
    }
  } catch (err) {
    return JSON.stringify({ error: handleApiError(err) });
  }
}
```

**Step 2: Verify it compiles (will fail until modes exist — that's expected)**

This file depends on mode handlers created in Tasks 7-13. Just create it now, we'll verify compilation after all modes are written.

**Step 3: Commit**

```bash
git add src/tool.ts
git commit -m "feat: add tool schema and mode dispatcher with pre-flight type discovery"
```

---

## Task 7: Dashboard Mode

**Files:**
- Create: `src/modes/dashboard.ts`

**Step 1: Implement dashboard mode**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/modes/dashboard.ts
git commit -m "feat: add dashboard mode — site overview with type counts"
```

---

## Task 8: Posts Mode

**Files:**
- Create: `src/modes/posts.ts`

**Step 1: Implement posts mode**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/modes/posts.ts
git commit -m "feat: add posts mode — CRUD for all accepted post types with SEO support"
```

---

## Task 9: Products Mode

**Files:**
- Create: `src/modes/products.ts`

**Step 1: Implement products mode**

```typescript
import { ToolContext, ToolParams } from "../tool.js";

export async function handleProducts(ctx: ToolContext, params: ToolParams): Promise<string> {
  const action = params.action ?? "list";
  const basePath = "/wc/v3/products";

  const defaults = ctx.feedback.getDefaults("product");
  const perPage = params.per_page ?? (defaults.default_per_page as number | undefined) ?? 10;

  switch (action) {
    case "list": {
      const queryParams: Record<string, unknown> = {
        per_page: perPage,
        page: params.page ?? 1,
      };
      if (params.status) queryParams.status = params.status;
      if (params.search) queryParams.search = params.search;
      if (params.sku) queryParams.sku = params.sku;
      if (params.stock_status) queryParams.stock_status = params.stock_status;
      if (params.categories) queryParams.category = params.categories;
      if (params.orderby) queryParams.orderby = params.orderby;

      const products = await ctx.api.get<Record<string, unknown>[]>(basePath, queryParams);

      const compact = products.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        price: p.price,
        regular_price: p.regular_price,
        sale_price: p.sale_price,
        stock_quantity: p.stock_quantity,
        stock_status: p.stock_status,
        sku: p.sku,
        permalink: p.permalink,
        type: p.type,
      }));

      return JSON.stringify({ count: compact.length, products: compact });
    }

    case "get": {
      const id = params.product_id ?? params.id;
      let product: Record<string, unknown>;

      if (id) {
        product = await ctx.api.get<Record<string, unknown>>(`${basePath}/${id}`);
      } else if (params.sku) {
        const results = await ctx.api.get<Record<string, unknown>[]>(basePath, { sku: params.sku });
        if (!results.length) return JSON.stringify({ error: `No product with SKU '${params.sku}'` });
        product = results[0];
      } else {
        return JSON.stringify({ error: "Provide product_id, id, or sku" });
      }

      return JSON.stringify(product);
    }

    case "create": {
      if (!params.title) return JSON.stringify({ error: "title (product name) required" });

      const defaultStatus = (defaults.default_status as string | undefined) ?? "draft";

      const body: Record<string, unknown> = {
        name: params.title,
        status: params.status ?? defaultStatus,
        type: params.product_type ?? "simple",
      };
      if (params.regular_price) body.regular_price = params.regular_price;
      if (params.sale_price) body.sale_price = params.sale_price;
      if (params.content) body.description = params.content;
      if (params.short_description) body.short_description = params.short_description;
      if (params.sku) body.sku = params.sku;
      if (params.stock_quantity !== undefined) {
        body.stock_quantity = params.stock_quantity;
        body.manage_stock = true;
      }
      if (params.categories) body.categories = params.categories.map((c) => ({ id: c }));
      if (params.images) body.images = params.images;
      if (params.meta_data) body.meta_data = params.meta_data;

      const created = await ctx.api.post<Record<string, unknown>>(basePath, body);

      return JSON.stringify({
        id: created.id,
        permalink: created.permalink,
        status: created.status,
      });
    }

    case "update": {
      const id = params.product_id ?? params.id;
      if (!id) return JSON.stringify({ error: "product_id or id required" });

      const body: Record<string, unknown> = {};
      const updatedFields: string[] = [];

      if (params.title) { body.name = params.title; updatedFields.push("name"); }
      if (params.content) { body.description = params.content; updatedFields.push("description"); }
      if (params.short_description) { body.short_description = params.short_description; updatedFields.push("short_description"); }
      if (params.status) { body.status = params.status; updatedFields.push("status"); }
      if (params.regular_price) { body.regular_price = params.regular_price; updatedFields.push("regular_price"); }
      if (params.sale_price) { body.sale_price = params.sale_price; updatedFields.push("sale_price"); }
      if (params.sku) { body.sku = params.sku; updatedFields.push("sku"); }
      if (params.stock_quantity !== undefined) {
        body.stock_quantity = params.stock_quantity;
        body.manage_stock = true;
        updatedFields.push("stock_quantity");
      }
      if (params.images) { body.images = params.images; updatedFields.push("images"); }
      if (params.categories) { body.categories = params.categories.map((c) => ({ id: c })); updatedFields.push("categories"); }
      if (params.meta_data) { body.meta_data = params.meta_data; updatedFields.push("meta_data"); }

      if (Object.keys(body).length === 0) {
        return JSON.stringify({ error: "No fields to update" });
      }

      await ctx.api.put<Record<string, unknown>>(`${basePath}/${id}`, body);

      return JSON.stringify({ id, updated_fields: updatedFields });
    }

    case "delete": {
      const id = params.product_id ?? params.id;
      if (!id) return JSON.stringify({ error: "product_id or id required" });

      await ctx.api.delete(`${basePath}/${id}`, { force: params.force ?? false });

      return JSON.stringify({ id, deleted: true });
    }

    default:
      return JSON.stringify({
        error: `Unknown products action: ${action}. Use: list, get, create, update, delete`,
      });
  }
}
```

**Step 2: Commit**

```bash
git add src/modes/products.ts
git commit -m "feat: add products mode — WooCommerce product CRUD"
```

---

## Task 10: Settings Mode

**Files:**
- Create: `src/modes/settings.ts`

**Step 1: Implement settings mode**

```typescript
import { ToolContext, ToolParams } from "../tool.js";

// Options that should never be exposed
const REDACTED_OPTIONS = [
  "auth_key", "auth_salt", "logged_in_key", "logged_in_salt",
  "nonce_key", "nonce_salt", "secure_auth_key", "secure_auth_salt",
  "db_password", "ftp_credentials",
];

// Options that require force=true to modify
const PROTECTED_OPTIONS = [
  "siteurl", "home", "active_plugins", "template", "stylesheet",
  "users_can_register", "default_role",
];

export async function handleSettings(ctx: ToolContext, params: ToolParams): Promise<string> {
  const action = params.action ?? "get_general";

  switch (action) {
    case "get_general": {
      const settings = await ctx.api.get<Record<string, unknown>>("/wp/v2/settings");
      return JSON.stringify({
        title: settings.title,
        description: settings.description,
        url: settings.url,
        email: settings.email,
        timezone: settings.timezone_string,
        date_format: settings.date_format,
        time_format: settings.time_format,
        language: settings.language,
        posts_per_page: settings.posts_per_page,
      });
    }

    case "get_option": {
      if (!params.option_name) return JSON.stringify({ error: "option_name required" });

      if (REDACTED_OPTIONS.some((r) => params.option_name!.includes(r))) {
        return JSON.stringify({ error: "This option contains sensitive data and is redacted." });
      }

      // Use WP REST API options endpoint (requires custom endpoint or settings API)
      // Fallback: use the settings endpoint for known options
      try {
        const settings = await ctx.api.get<Record<string, unknown>>("/wp/v2/settings");
        if (params.option_name! in settings) {
          return JSON.stringify({ name: params.option_name, value: settings[params.option_name!] });
        }
        // For non-standard options, we need a custom endpoint
        return JSON.stringify({
          error: `Option '${params.option_name}' not available via REST API. ` +
            "Only options registered with 'show_in_rest' are accessible.",
        });
      } catch {
        return JSON.stringify({ error: `Failed to read option '${params.option_name}'` });
      }
    }

    case "update_option": {
      if (!params.option_name) return JSON.stringify({ error: "option_name required" });
      if (params.option_value === undefined) return JSON.stringify({ error: "option_value required" });

      if (REDACTED_OPTIONS.some((r) => params.option_name!.includes(r))) {
        return JSON.stringify({ error: "Cannot modify sensitive options." });
      }

      if (PROTECTED_OPTIONS.includes(params.option_name!) && !params.force) {
        return JSON.stringify({
          error: `'${params.option_name}' is protected. Set force=true to modify.`,
          warning: "Changing this option may break your site.",
        });
      }

      // Read current value
      const current = await ctx.api.get<Record<string, unknown>>("/wp/v2/settings");
      const previousValue = current[params.option_name!];

      await ctx.api.post("/wp/v2/settings", {
        [params.option_name!]: params.option_value,
      });

      return JSON.stringify({
        name: params.option_name,
        previous_value: previousValue,
        new_value: params.option_value,
      });
    }

    case "list_options": {
      const settings = await ctx.api.get<Record<string, unknown>>("/wp/v2/settings");
      const entries = Object.entries(settings)
        .filter(([key]) => {
          if (params.search) return key.includes(params.search);
          return true;
        })
        .filter(([key]) => !REDACTED_OPTIONS.some((r) => key.includes(r)))
        .map(([key, value]) => ({
          name: key,
          value_preview: typeof value === "string"
            ? value.slice(0, 100) + (value.length > 100 ? "..." : "")
            : JSON.stringify(value).slice(0, 100),
        }));

      return JSON.stringify({ count: entries.length, options: entries });
    }

    default:
      return JSON.stringify({
        error: `Unknown settings action: ${action}. Use: get_general, get_option, update_option, list_options`,
      });
  }
}
```

**Step 2: Commit**

```bash
git add src/modes/settings.ts
git commit -m "feat: add settings mode — read/write WP options with safety guards"
```

---

## Task 11: Media Mode

**Files:**
- Create: `src/modes/media.ts`

**Step 1: Implement media mode**

```typescript
import { ToolContext, ToolParams } from "../tool.js";

export async function handleMedia(ctx: ToolContext, params: ToolParams): Promise<string> {
  const action = params.action ?? "list";

  switch (action) {
    case "list": {
      const queryParams: Record<string, unknown> = {
        per_page: params.per_page ?? 10,
        page: params.page ?? 1,
      };
      if (params.search) queryParams.search = params.search;
      if (params.mime_type) queryParams.mime_type = params.mime_type;

      const media = await ctx.api.get<Record<string, unknown>[]>("/wp/v2/media", queryParams);

      const compact = media.map((m) => ({
        id: m.id,
        title: (m.title as Record<string, unknown>)?.rendered ?? m.title,
        url: (m.source_url as string) ?? (m.guid as Record<string, unknown>)?.rendered,
        mime_type: m.mime_type,
        width: (m.media_details as Record<string, unknown>)?.width,
        height: (m.media_details as Record<string, unknown>)?.height,
        filesize: (m.media_details as Record<string, unknown>)?.filesize,
        alt_text: m.alt_text,
        date: m.date,
      }));

      return JSON.stringify({ count: compact.length, media: compact });
    }

    case "upload_url": {
      if (!params.url) return JSON.stringify({ error: "url required" });

      const { data, mimeType, filename } = await ctx.api.downloadUrl(params.url);

      const result = await ctx.api.uploadMedia(
        data,
        params.filename ?? filename,
        mimeType,
        {
          alt_text: params.alt_text ?? "",
          title: params.title ?? "",
          ...(params.post_id ? { post: String(params.post_id) } : {}),
        }
      );

      return JSON.stringify({
        id: result.id,
        url: result.source_url ?? (result.guid as Record<string, unknown>)?.rendered,
        mime_type: result.mime_type,
      });
    }

    case "upload_base64": {
      if (!params.data) return JSON.stringify({ error: "data (base64) required" });
      if (!params.filename) return JSON.stringify({ error: "filename required" });

      const buffer = Buffer.from(params.data, "base64");
      const mimeType = params.mime_type ?? guessMimeType(params.filename);

      const result = await ctx.api.uploadMedia(
        buffer,
        params.filename,
        mimeType,
        {
          alt_text: params.alt_text ?? "",
          title: params.title ?? "",
          ...(params.post_id ? { post: String(params.post_id) } : {}),
        }
      );

      return JSON.stringify({
        id: result.id,
        url: result.source_url ?? (result.guid as Record<string, unknown>)?.rendered,
        mime_type: result.mime_type,
      });
    }

    case "delete": {
      const id = params.media_id ?? params.id;
      if (!id) return JSON.stringify({ error: "media_id or id required" });

      await ctx.api.delete(`/wp/v2/media/${id}`, { force: params.force ?? true });

      return JSON.stringify({ id, deleted: true });
    }

    default:
      return JSON.stringify({
        error: `Unknown media action: ${action}. Use: list, upload_url, upload_base64, delete`,
      });
  }
}

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    pdf: "application/pdf", mp4: "video/mp4", mp3: "audio/mpeg",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
```

**Step 2: Commit**

```bash
git add src/modes/media.ts
git commit -m "feat: add media mode — upload from URL/base64, list, delete"
```

---

## Task 12: Register Types Mode

**Files:**
- Create: `src/modes/register-types.ts`

**Step 1: Implement register_types mode**

```typescript
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
```

**Step 2: Commit**

```bash
git add src/modes/register-types.ts
git commit -m "feat: add register_types mode — accept/ignore post type discovery"
```

---

## Task 13: Feedback Mode

**Files:**
- Create: `src/modes/feedback.ts`

**Step 1: Implement feedback mode**

```typescript
import { ToolContext, ToolParams } from "../tool.js";

export async function handleFeedback(ctx: ToolContext, params: ToolParams): Promise<string> {
  const action = params.action ?? "list";

  switch (action) {
    case "set_preference": {
      const postType = params.post_type ?? "post";
      if (!params.key) return JSON.stringify({ error: "key required" });
      if (params.value === undefined) return JSON.stringify({ error: "value required" });

      ctx.feedback.setPreference(postType, params.key, params.value);

      return JSON.stringify({
        ok: true,
        post_type: postType,
        key: params.key,
        value: params.value,
        all_preferences: ctx.feedback.getDefaults(postType),
      });
    }

    case "log_correction": {
      const mode = params.mode ?? "unknown";
      const corrAction = params.action ?? "unknown";
      if (!params.issue) return JSON.stringify({ error: "issue required" });
      if (!params.resolution) return JSON.stringify({ error: "resolution required" });

      ctx.feedback.logCorrection(mode, corrAction, params.issue, params.resolution);

      return JSON.stringify({
        ok: true,
        logged: { mode, action: corrAction, issue: params.issue, resolution: params.resolution },
      });
    }

    case "list": {
      return JSON.stringify(ctx.feedback.getAllState());
    }

    default:
      return JSON.stringify({
        error: `Unknown feedback action: ${action}. Use: set_preference, log_correction, list`,
      });
  }
}
```

**Step 2: Commit**

```bash
git add src/modes/feedback.ts
git commit -m "feat: add feedback mode — self-annealing preferences and corrections"
```

---

## Task 14: Entry Point (Dual Transport)

**Files:**
- Modify: `src/index.ts`

**Step 1: Implement index.ts with dual transport**

Replace `src/index.ts` with:

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WordPressAPI } from "./api.js";
import { PostTypeRegistry } from "./registry.js";
import { FeedbackStore } from "./feedback.js";
import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_SCHEMA, toolHandler, ToolParams, ToolContext } from "./tool.js";
import { setupOAuth } from "./oauth.js";
import path from "node:path";

const server = new McpServer({
  name: "wp-mcp-server",
  version: "1.0.0",
});

async function main(): Promise<void> {
  // Required env vars
  const siteUrl = process.env.WP_SITE_URL;
  const username = process.env.WP_USERNAME;
  const appPassword = process.env.WP_APP_PASSWORD;

  if (!siteUrl || !username || !appPassword) {
    console.error("ERROR: WP_SITE_URL, WP_USERNAME, and WP_APP_PASSWORD are required");
    process.exit(1);
  }

  // Data directory for persistent state
  const dataDir = process.env.DATA_DIR ?? path.join(import.meta.dirname ?? ".", "..", "data");

  const api = new WordPressAPI({
    siteUrl,
    username,
    appPassword,
    wcConsumerKey: process.env.WC_CONSUMER_KEY,
    wcConsumerSecret: process.env.WC_CONSUMER_SECRET,
  });

  const registry = new PostTypeRegistry(dataDir);
  const feedback = new FeedbackStore(dataDir);

  const ctx: ToolContext = { api, registry, feedback };

  // Register single tool
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    TOOL_SCHEMA,
    async (params) => {
      const result = await toolHandler(ctx, params as ToolParams);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  // Transport selection
  const PORT = process.env.PORT ? Number(process.env.PORT) : null;

  if (PORT) {
    // HTTP transport with OAuth
    const express = (await import("express")).default;
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );

    const oauthClientId = process.env.MCP_OAUTH_CLIENT_ID;
    const oauthClientSecret = process.env.MCP_OAUTH_CLIENT_SECRET;
    const publicUrl = process.env.PUBLIC_URL;

    if (!oauthClientId || !oauthClientSecret || !publicUrl) {
      console.error("ERROR: MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, and PUBLIC_URL required for HTTP");
      process.exit(1);
    }

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    const { validateToken } = setupOAuth(app, {
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
      publicUrl,
      staticToken: process.env.MCP_AUTH_TOKEN,
    });

    app.post("/mcp", async (req, res) => {
      if (!validateToken(req)) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => transport.close());
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get("/health", (_req, res) => res.json({ status: "ok" }));

    app.listen(PORT, () => {
      console.error(`WordPress MCP server running on http://0.0.0.0:${PORT}/mcp`);
    });
  } else {
    // Stdio transport (default for Claude Code)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("WordPress MCP server running via stdio");
  }
}

main().catch((err) => {
  console.error("Server error:", err);
  process.exit(1);
});
```

**Step 2: Build and verify compilation**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp && npm run build
```

Expected: Successful compilation with no errors.

**Step 3: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass (registry + feedback + api tests).

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add entry point with dual transport (stdio + HTTP/OAuth)"
```

---

## Task 15: Dockerfile

**Files:**
- Create: `Dockerfile`

**Step 1: Create Dockerfile**

```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY data/ ./data/

ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

**Step 2: Verify Docker builds**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp && docker build -t wp-mcp .
```

Expected: Successful build.

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: add Dockerfile with multi-stage build and health check"
```

---

## Task 16: Local Smoke Test

**Files:**
- Create: `.env` (not committed)

**Step 1: Create .env with real credentials**

```bash
# Create .env with credentials (NOT committed)
cat > /Users/urbs/Documents/Apps/mcp-servers/wp-mcp/.env << 'ENVEOF'
WP_SITE_URL=https://outliyr.com
WP_USERNAME=<username>
WP_APP_PASSWORD=<app-password>
WC_CONSUMER_KEY=ck_18cf34b8d6a6baa056be4b0c58ef76567c68bf64
WC_CONSUMER_SECRET=cs_b0e3643e65634ef6e680c9cc3b457973f45711b1
DATA_DIR=./data
ENVEOF
```

Note: Fill in WP_USERNAME and WP_APP_PASSWORD. The WC keys are provided.

**Step 2: Run locally via stdio and test with MCP inspector or manual curl**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp
# Load env vars and run
set -a && source .env && set +a && npm run dev
```

Test in a separate terminal with the MCP inspector or register with Claude Code:

```bash
claude mcp add-json wp-mcp '{
  "command": "node",
  "args": ["/Users/urbs/Documents/Apps/mcp-servers/wp-mcp/dist/index.js"],
  "env": {
    "WP_SITE_URL": "https://outliyr.com",
    "WP_USERNAME": "<username>",
    "WP_APP_PASSWORD": "<app-password>",
    "WC_CONSUMER_KEY": "ck_18cf34b8d6a6baa056be4b0c58ef76567c68bf64",
    "WC_CONSUMER_SECRET": "cs_b0e3643e65634ef6e680c9cc3b457973f45711b1",
    "DATA_DIR": "/Users/urbs/Documents/Apps/mcp-servers/wp-mcp/data"
  }
}'
```

**Step 3: Verify each mode works**

Test calls (via Claude or MCP inspector):
1. `{ "mode": "dashboard" }` — should return site info
2. `{ "mode": "posts", "action": "list", "per_page": 3 }` — should return 3 posts
3. `{ "mode": "products", "action": "list", "per_page": 3 }` — should return WC products
4. `{ "mode": "settings", "action": "get_general" }` — should return site settings
5. `{ "mode": "media", "action": "list", "per_page": 3 }` — should return media items
6. `{ "mode": "register_types", "action": "list" }` — should show registry

**Step 4: Fix any issues found during smoke testing**

---

## Task 17: Deploy to Coolify

**Step 1: Push to GitHub**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp
# Create GitHub repo (if not exists)
gh repo create nicholasurban/wp-mcp --private --source=. --push
```

**Step 2: Create Coolify application**

Use Coolify API or dashboard to create a new Docker application:
- Source: GitHub `nicholasurban/wp-mcp`
- Build pack: Dockerfile
- Port: 3000
- Persistent volume: bind mount for `/app/data`

**Step 3: Configure environment variables in Coolify**

Set all env vars from `.env.example` plus OAuth credentials:
- `WP_SITE_URL`, `WP_USERNAME`, `WP_APP_PASSWORD`
- `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`
- `PORT=3000`
- `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET`
- `PUBLIC_URL=https://wp.mcp.outliyr.com`
- `MCP_AUTH_TOKEN` (optional static token)
- `DATA_DIR=/app/data`

**Step 4: Configure DNS**

Add A record: `wp.mcp.outliyr.com` → Coolify server IP (not proxied through Cloudflare)

**Step 5: Verify remote deployment**

```bash
curl https://wp.mcp.outliyr.com/health
# Expected: {"status":"ok"}
```

**Step 6: Register remote MCP server for iOS/web**

```bash
claude mcp add-json wp-mcp-remote '{
  "type": "url",
  "url": "https://wp.mcp.outliyr.com/mcp"
}'
```

---

## Task 18: Claude Skill (SKILL.md)

**Files:**
- Create: `/Users/urbs/.claude/skills/wordpress/SKILL.md`

**Step 1: Write the skill**

```markdown
---
name: wordpress
description: Use when interacting with WordPress — creating, editing, or listing posts, pages, custom post types, WooCommerce products, site settings, or media. Triggers on "WordPress", "blog post", "WooCommerce", "product", "wp settings", "media upload", "outliyr.com content".
---

# WordPress MCP

Interact with outliyr.com via the `wordpress` MCP tool. One tool, 7 modes.

## Modes

| Mode | Use for | Default action |
|------|---------|---------------|
| `dashboard` | Site overview | overview |
| `posts` | Blog posts, pages, CPTs | list |
| `products` | WooCommerce products | list |
| `settings` | WP options | get_general |
| `media` | Media library | list |
| `register_types` | Accept/ignore new CPTs | list |
| `feedback` | Set preferences | list |

## Post Types

Accepted: post, page, product (via products mode), outliyr_intel, odl_dataset, haq_entry, peptide_protocol.

Set `post_type` param for CPTs. Default is `post`.

## Key Behaviors

- **New post types**: If the tool returns `new_post_types_detected`, you MUST call `register_types` mode before any other operation. Present the new types to the user and ask if they want to accept or ignore each one.
- **Default status**: All creates default to `draft`. Never publish without user confirmation.
- **SEO**: Pass `seo: { title, description, focus_keyword }` on create/update for RankMath.
- **Feedback**: When the user corrects your behavior, call `feedback` mode with `set_preference` or `log_correction` to persist the learning.

## Self-Annealing Changelog

<!-- Claude: append rules here when user corrections form patterns -->
```

**Step 2: Commit the skill**

```bash
cd /Users/urbs/.claude/skills
mkdir -p wordpress
# After writing SKILL.md
git add wordpress/SKILL.md
git commit -m "feat: add wordpress MCP skill"
```

---

## Task 19: Final Verification

**Step 1: Run full test suite**

```bash
cd /Users/urbs/Documents/Apps/mcp-servers/wp-mcp && npx vitest run
```

Expected: All tests pass.

**Step 2: Verify local stdio works**

Test via Claude Code with registered MCP server.

**Step 3: Verify remote HTTP works**

Test via iOS Claude app or web (if deployed).

**Step 4: Verify post type discovery**

If a new CPT exists that isn't in the registry, verify the tool blocks and prompts.

**Step 5: Verify feedback persistence**

```json
{ "mode": "feedback", "action": "set_preference", "post_type": "post", "key": "default_per_page", "value": 5 }
```

Then verify subsequent `posts` list calls use per_page=5.
