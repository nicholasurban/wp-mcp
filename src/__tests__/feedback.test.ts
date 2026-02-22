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
