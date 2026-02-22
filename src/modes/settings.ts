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
