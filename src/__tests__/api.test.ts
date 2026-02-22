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
