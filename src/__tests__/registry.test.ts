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
