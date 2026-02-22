import { ToolContext, ToolParams } from "../tool.js";

export async function handleMedia(ctx: ToolContext, params: ToolParams): Promise<string> {
  const action = params.action ?? "list";

  switch (action) {
    case "list": {
      const queryParams: Record<string, unknown> = {
        per_page: params.per_page ?? 10,
        page: params.page ?? 1,
      };
      if (params.search) queryParams.search = params.search;
      if (params.mime_type) queryParams.mime_type = params.mime_type;

      const media = await ctx.api.get<Record<string, unknown>[]>("/wp/v2/media", queryParams);

      const compact = media.map((m) => ({
        id: m.id,
        title: (m.title as Record<string, unknown>)?.rendered ?? m.title,
        url: (m.source_url as string) ?? (m.guid as Record<string, unknown>)?.rendered,
        mime_type: m.mime_type,
        width: (m.media_details as Record<string, unknown>)?.width,
        height: (m.media_details as Record<string, unknown>)?.height,
        filesize: (m.media_details as Record<string, unknown>)?.filesize,
        alt_text: m.alt_text,
        date: m.date,
      }));

      return JSON.stringify({ count: compact.length, media: compact });
    }

    case "upload_url": {
      if (!params.url) return JSON.stringify({ error: "url required" });

      const { data, mimeType, filename } = await ctx.api.downloadUrl(params.url);

      const result = await ctx.api.uploadMedia(
        data,
        params.filename ?? filename,
        mimeType,
        {
          alt_text: params.alt_text ?? "",
          title: params.title ?? "",
          ...(params.post_id ? { post: String(params.post_id) } : {}),
        }
      );

      return JSON.stringify({
        id: result.id,
        url: result.source_url ?? (result.guid as Record<string, unknown>)?.rendered,
        mime_type: result.mime_type,
      });
    }

    case "upload_base64": {
      if (!params.data) return JSON.stringify({ error: "data (base64) required" });
      if (!params.filename) return JSON.stringify({ error: "filename required" });

      const buffer = Buffer.from(params.data, "base64");
      const mimeType = params.mime_type ?? guessMimeType(params.filename);

      const result = await ctx.api.uploadMedia(
        buffer,
        params.filename,
        mimeType,
        {
          alt_text: params.alt_text ?? "",
          title: params.title ?? "",
          ...(params.post_id ? { post: String(params.post_id) } : {}),
        }
      );

      return JSON.stringify({
        id: result.id,
        url: result.source_url ?? (result.guid as Record<string, unknown>)?.rendered,
        mime_type: result.mime_type,
      });
    }

    case "delete": {
      const id = params.media_id ?? params.id;
      if (!id) return JSON.stringify({ error: "media_id or id required" });

      await ctx.api.delete(`/wp/v2/media/${id}`, { force: params.force ?? true });

      return JSON.stringify({ id, deleted: true });
    }

    default:
      return JSON.stringify({
        error: `Unknown media action: ${action}. Use: list, upload_url, upload_base64, delete`,
      });
  }
}

function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    pdf: "application/pdf", mp4: "video/mp4", mp3: "audio/mpeg",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
