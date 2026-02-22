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
