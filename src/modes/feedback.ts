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
