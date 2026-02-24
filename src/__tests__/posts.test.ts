import { describe, it, expect, vi } from "vitest";
import { handlePosts } from "../modes/posts.js";

// Create a mock context matching ToolContext shape
function createMockContext() {
  return {
    api: {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({ id: 1, link: "https://example.com/test", status: "draft" }),
      delete: vi.fn().mockResolvedValue({ status: "publish" }),
      downloadUrl: vi.fn(),
      uploadMedia: vi.fn(),
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

describe("category name resolution", () => {
  it("resolves category names to IDs", async () => {
    const ctx = createMockContext();
    // Mock: category search returns match, slug check returns empty (no idempotent hit)
    ctx.api.get.mockImplementation(async (path: string, params?: any) => {
      if (path === "/wp/v2/categories") {
        return [{ id: 5, name: "Biohacking" }];
      }
      return []; // slug check returns empty
    });
    ctx.api.post.mockResolvedValue({ id: 1, link: "https://example.com/test", status: "draft" });

    await handlePosts(ctx as any, {
      mode: "posts",
      action: "create",
      title: "Test",
      slug: "test",
      categories: ["Biohacking"],
    } as any);

    // Verify create was called with resolved ID
    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts",
      expect.objectContaining({ categories: [5] })
    );
  });

  it("errors on unknown category name", async () => {
    const ctx = createMockContext();
    ctx.api.get.mockImplementation(async (path: string) => {
      if (path === "/wp/v2/categories") return [];
      return []; // slug check
    });

    const result = JSON.parse(
      await handlePosts(ctx as any, {
        mode: "posts",
        action: "create",
        title: "Test",
        slug: "test",
        categories: ["NonExistent"],
      } as any)
    );

    expect(result.error).toContain("not found");
    // Should NOT have called post (no create)
    expect(ctx.api.post).not.toHaveBeenCalled();
  });

  it("passes numeric IDs through unchanged", async () => {
    const ctx = createMockContext();
    ctx.api.get.mockResolvedValue([]); // slug check returns empty
    ctx.api.post.mockResolvedValue({ id: 1, link: "https://example.com/test", status: "draft" });

    await handlePosts(ctx as any, {
      mode: "posts",
      action: "create",
      title: "Test",
      slug: "test",
      categories: [5, 12],
    } as any);

    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts",
      expect.objectContaining({ categories: [5, 12] })
    );
  });

  it("resolves category names in update action", async () => {
    const ctx = createMockContext();
    ctx.api.get.mockImplementation(async (path: string) => {
      if (path === "/wp/v2/categories") {
        return [{ id: 8, name: "Supplements" }];
      }
      return [];
    });
    ctx.api.post.mockResolvedValue({ id: 10, link: "https://example.com/test", status: "publish" });

    await handlePosts(ctx as any, {
      mode: "posts",
      action: "update",
      id: 10,
      categories: ["Supplements"],
    } as any);

    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts/10",
      expect.objectContaining({ categories: [8] })
    );
  });

  it("resolves tag names to IDs", async () => {
    const ctx = createMockContext();
    ctx.api.get.mockImplementation(async (path: string) => {
      if (path === "/wp/v2/tags") {
        return [{ id: 42, name: "nootropics" }];
      }
      return []; // slug check returns empty
    });
    ctx.api.post.mockResolvedValue({ id: 1, link: "https://example.com/test", status: "draft" });

    await handlePosts(ctx as any, {
      mode: "posts",
      action: "create",
      title: "Test",
      slug: "test",
      tags: ["nootropics"],
    } as any);

    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts",
      expect.objectContaining({ tags: [42] })
    );
  });

  it("resolves categories in idempotent update path", async () => {
    const ctx = createMockContext();
    // First call: slug check returns existing post; subsequent: category resolution
    let callCount = 0;
    ctx.api.get.mockImplementation(async (path: string, params?: any) => {
      if (path === "/wp/v2/categories") {
        return [{ id: 3, name: "Sleep" }];
      }
      // slug check: return existing post
      return [{ id: 99, link: "https://example.com/existing", status: "draft" }];
    });
    ctx.api.post.mockResolvedValue({ id: 99, link: "https://example.com/existing", status: "draft" });

    const result = JSON.parse(
      await handlePosts(ctx as any, {
        mode: "posts",
        action: "create",
        title: "Test",
        slug: "existing-slug",
        categories: ["Sleep"],
      } as any)
    );

    expect(result.idempotent_hit).toBe(true);
    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts/99",
      expect.objectContaining({ categories: [3] })
    );
  });
});

describe("featured image URL sideloading", () => {
  it("downloads and uploads image from URL on create", async () => {
    const ctx = createMockContext();
    ctx.api.get.mockResolvedValue([]); // slug check returns empty
    ctx.api.downloadUrl.mockResolvedValue({
      data: Buffer.from("fake-image"),
      mimeType: "image/jpeg",
      filename: "hero.jpg",
    });
    ctx.api.uploadMedia.mockResolvedValue({ id: 456 });
    ctx.api.post.mockResolvedValue({ id: 1, link: "https://example.com/test", status: "draft" });

    await handlePosts(ctx as any, {
      mode: "posts",
      action: "create",
      title: "Test",
      slug: "test",
      featured_image_url: "https://example.com/hero.jpg",
    } as any);

    // Should have downloaded the image
    expect(ctx.api.downloadUrl).toHaveBeenCalledWith("https://example.com/hero.jpg");
    // Should have uploaded it
    expect(ctx.api.uploadMedia).toHaveBeenCalled();
    // Should have set featured_media on the post
    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts",
      expect.objectContaining({ featured_media: 456 })
    );
  });

  it("sideloads image in idempotent update path", async () => {
    const ctx = createMockContext();
    // slug check returns existing post
    ctx.api.get.mockResolvedValue([{ id: 50, link: "https://example.com/existing", status: "draft" }]);
    ctx.api.downloadUrl.mockResolvedValue({
      data: Buffer.from("fake-image"),
      mimeType: "image/png",
      filename: "cover.png",
    });
    ctx.api.uploadMedia.mockResolvedValue({ id: 789 });
    ctx.api.post.mockResolvedValue({ id: 50, link: "https://example.com/existing", status: "draft" });

    const result = JSON.parse(
      await handlePosts(ctx as any, {
        mode: "posts",
        action: "create",
        title: "Test",
        slug: "existing-slug",
        featured_image_url: "https://example.com/cover.png",
      } as any)
    );

    expect(result.idempotent_hit).toBe(true);
    expect(ctx.api.downloadUrl).toHaveBeenCalledWith("https://example.com/cover.png");
    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts/50",
      expect.objectContaining({ featured_media: 789 })
    );
  });

  it("sideloads image in update action", async () => {
    const ctx = createMockContext();
    ctx.api.downloadUrl.mockResolvedValue({
      data: Buffer.from("fake-image"),
      mimeType: "image/webp",
      filename: "banner.webp",
    });
    ctx.api.uploadMedia.mockResolvedValue({ id: 321 });
    ctx.api.post.mockResolvedValue({ id: 10, link: "https://example.com/test", status: "publish" });

    await handlePosts(ctx as any, {
      mode: "posts",
      action: "update",
      id: 10,
      featured_image_url: "https://example.com/banner.webp",
    } as any);

    expect(ctx.api.downloadUrl).toHaveBeenCalledWith("https://example.com/banner.webp");
    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts/10",
      expect.objectContaining({ featured_media: 321 })
    );
  });

  it("prefers featured_image_url over featured_media ID", async () => {
    const ctx = createMockContext();
    ctx.api.get.mockResolvedValue([]); // slug check returns empty
    ctx.api.downloadUrl.mockResolvedValue({
      data: Buffer.from("fake-image"),
      mimeType: "image/jpeg",
      filename: "hero.jpg",
    });
    ctx.api.uploadMedia.mockResolvedValue({ id: 999 });
    ctx.api.post.mockResolvedValue({ id: 1, link: "https://example.com/test", status: "draft" });

    await handlePosts(ctx as any, {
      mode: "posts",
      action: "create",
      title: "Test",
      slug: "test",
      featured_image_url: "https://example.com/hero.jpg",
      featured_media: 100,  // This should be ignored
    } as any);

    // featured_media should come from the uploaded image, not the passed-in value
    expect(ctx.api.post).toHaveBeenCalledWith(
      "/wp/v2/posts",
      expect.objectContaining({ featured_media: 999 })
    );
  });
});
