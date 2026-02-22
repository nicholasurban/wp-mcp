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
