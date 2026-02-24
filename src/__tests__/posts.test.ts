import { describe, it, expect, vi } from "vitest";
import { handlePosts } from "../modes/posts.js";

// Create a mock context matching ToolContext shape
function createMockContext() {
  return {
    api: {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({ id: 1, link: "https://example.com/test", status: "draft" }),
      delete: vi.fn().mockResolvedValue({ status: "publish" }),
    },
    registry: {
      isAccepted: vi.fn().mockReturnValue(true),
      isWooCommerce: vi.fn().mockReturnValue(false),
      getRestBase: vi.fn().mockReturnValue("posts"),
      getAccepted: vi.fn().mockReturnValue({ post: {} }),
    },
    feedback: {
      getDefaults: vi.fn().mockReturnValue({}),
    },
  };
}

describe("posts idempotency", () => {
  it("should update existing post when slug matches (idempotent hit)", async () => {
    const ctx = createMockContext();
    // Mock: slug lookup returns existing post
    ctx.api.get.mockResolvedValue([{ id: 123, link: "https://example.com/test", status: "draft" }]);
    // Mock: update returns the updated post
    ctx.api.post.mockResolvedValue({ id: 123, link: "https://example.com/test", status: "draft" });

    const result = JSON.parse(
      await handlePosts(ctx as any, {
        mode: "posts",
        action: "create",
        title: "Test Post",
        slug: "test-slug",
        content: "<p>Content</p>",
      } as any)
    );

    // Should have checked for existing post by slug with status: "any"
    expect(ctx.api.get).toHaveBeenCalledWith(
      "/wp/v2/posts",
      expect.objectContaining({ slug: "test-slug", status: "any", per_page: 1 })
    );
    // Should have updated the existing post, not created fresh
    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts/123",
      expect.objectContaining({ title: "Test Post", content: "<p>Content</p>" })
    );
    expect(result.idempotent_hit).toBe(true);
    expect(result.id).toBe(123);
  });

  it("should create normally when no existing post with slug (no hit)", async () => {
    const ctx = createMockContext();
    // Mock: slug lookup returns empty
    ctx.api.get.mockResolvedValue([]);
    // Mock: create returns new post
    ctx.api.post.mockResolvedValue({ id: 456, link: "https://example.com/new", status: "draft" });

    const result = JSON.parse(
      await handlePosts(ctx as any, {
        mode: "posts",
        action: "create",
        title: "New Post",
        slug: "new-slug",
      } as any)
    );

    // Should have checked for existing
    expect(ctx.api.get).toHaveBeenCalledWith(
      "/wp/v2/posts",
      expect.objectContaining({ slug: "new-slug" })
    );
    // Should create fresh at base path (not /posts/ID)
    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts",
      expect.objectContaining({ title: "New Post" })
    );
    expect(result.idempotent_hit).toBe(false);
    expect(result.id).toBe(456);
  });

  it("should skip idempotency check when no slug provided", async () => {
    const ctx = createMockContext();
    ctx.api.post.mockResolvedValue({ id: 789, link: "https://example.com/no-slug", status: "draft" });

    const result = JSON.parse(
      await handlePosts(ctx as any, {
        mode: "posts",
        action: "create",
        title: "No Slug Post",
      } as any)
    );

    // Should NOT have called get (no slug to check)
    expect(ctx.api.get).not.toHaveBeenCalled();
    expect(result.idempotent_hit).toBe(false);
    expect(result.id).toBe(789);
  });

  it("should apply SEO fields during idempotent update", async () => {
    const ctx = createMockContext();
    // Mock: slug lookup returns existing post
    ctx.api.get.mockResolvedValue([{ id: 50, link: "https://example.com/seo-test", status: "publish" }]);
    // First call: update post body; second call: update SEO meta
    ctx.api.post
      .mockResolvedValueOnce({ id: 50, link: "https://example.com/seo-test", status: "publish" })
      .mockResolvedValueOnce({});

    const result = JSON.parse(
      await handlePosts(ctx as any, {
        mode: "posts",
        action: "create",
        title: "SEO Post",
        slug: "seo-test",
        seo: {
          title: "SEO Title",
          description: "SEO Desc",
          focus_keyword: "keyword",
        },
      } as any)
    );

    expect(result.idempotent_hit).toBe(true);
    expect(result.id).toBe(50);

    // Should have made two POST calls: one for body update, one for SEO meta
    expect(ctx.api.post).toHaveBeenCalledTimes(2);
    expect(ctx.api.post).toHaveBeenNthCalledWith(
      2,
      "/wp/v2/posts/50",
      expect.objectContaining({
        meta: expect.objectContaining({
          rank_math_title: "SEO Title",
          rank_math_description: "SEO Desc",
          rank_math_focus_keyword: "keyword",
        }),
      })
    );
  });
});
