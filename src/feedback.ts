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
