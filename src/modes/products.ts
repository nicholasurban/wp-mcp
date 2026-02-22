import { ToolContext, ToolParams } from "../tool.js";

export async function handleProducts(ctx: ToolContext, params: ToolParams): Promise<string> {
  const action = params.action ?? "list";
  const basePath = "/wc/v3/products";

  const defaults = ctx.feedback.getDefaults("product");
  const perPage = params.per_page ?? (defaults.default_per_page as number | undefined) ?? 10;

  switch (action) {
    case "list": {
      const queryParams: Record<string, unknown> = {
        per_page: perPage,
        page: params.page ?? 1,
      };
      if (params.status) queryParams.status = params.status;
      if (params.search) queryParams.search = params.search;
      if (params.sku) queryParams.sku = params.sku;
      if (params.stock_status) queryParams.stock_status = params.stock_status;
      if (params.categories) queryParams.category = params.categories;
      if (params.orderby) queryParams.orderby = params.orderby;

      const products = await ctx.api.get<Record<string, unknown>[]>(basePath, queryParams);

      const compact = products.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        price: p.price,
        regular_price: p.regular_price,
        sale_price: p.sale_price,
        stock_quantity: p.stock_quantity,
        stock_status: p.stock_status,
        sku: p.sku,
        permalink: p.permalink,
        type: p.type,
      }));

      return JSON.stringify({ count: compact.length, products: compact });
    }

    case "get": {
      const id = params.product_id ?? params.id;
      let product: Record<string, unknown>;

      if (id) {
        product = await ctx.api.get<Record<string, unknown>>(`${basePath}/${id}`);
      } else if (params.sku) {
        const results = await ctx.api.get<Record<string, unknown>[]>(basePath, { sku: params.sku });
        if (!results.length) return JSON.stringify({ error: `No product with SKU '${params.sku}'` });
        product = results[0];
      } else {
        return JSON.stringify({ error: "Provide product_id, id, or sku" });
      }

      return JSON.stringify(product);
    }

    case "create": {
      if (!params.title) return JSON.stringify({ error: "title (product name) required" });

      const defaultStatus = (defaults.default_status as string | undefined) ?? "draft";

      const body: Record<string, unknown> = {
        name: params.title,
        status: params.status ?? defaultStatus,
        type: params.product_type ?? "simple",
      };
      if (params.regular_price) body.regular_price = params.regular_price;
      if (params.sale_price) body.sale_price = params.sale_price;
      if (params.content) body.description = params.content;
      if (params.short_description) body.short_description = params.short_description;
      if (params.sku) body.sku = params.sku;
      if (params.stock_quantity !== undefined) {
        body.stock_quantity = params.stock_quantity;
        body.manage_stock = true;
      }
      if (params.categories) body.categories = params.categories.map((c) => ({ id: c }));
      if (params.images) body.images = params.images;
      if (params.meta_data) body.meta_data = params.meta_data;

      const created = await ctx.api.post<Record<string, unknown>>(basePath, body);

      return JSON.stringify({
        id: created.id,
        permalink: created.permalink,
        status: created.status,
      });
    }

    case "update": {
      const id = params.product_id ?? params.id;
      if (!id) return JSON.stringify({ error: "product_id or id required" });

      const body: Record<string, unknown> = {};
      const updatedFields: string[] = [];

      if (params.title) { body.name = params.title; updatedFields.push("name"); }
      if (params.content) { body.description = params.content; updatedFields.push("description"); }
      if (params.short_description) { body.short_description = params.short_description; updatedFields.push("short_description"); }
      if (params.status) { body.status = params.status; updatedFields.push("status"); }
      if (params.regular_price) { body.regular_price = params.regular_price; updatedFields.push("regular_price"); }
      if (params.sale_price) { body.sale_price = params.sale_price; updatedFields.push("sale_price"); }
      if (params.sku) { body.sku = params.sku; updatedFields.push("sku"); }
      if (params.stock_quantity !== undefined) {
        body.stock_quantity = params.stock_quantity;
        body.manage_stock = true;
        updatedFields.push("stock_quantity");
      }
      if (params.images) { body.images = params.images; updatedFields.push("images"); }
      if (params.categories) { body.categories = params.categories.map((c) => ({ id: c })); updatedFields.push("categories"); }
      if (params.meta_data) { body.meta_data = params.meta_data; updatedFields.push("meta_data"); }

      if (Object.keys(body).length === 0) {
        return JSON.stringify({ error: "No fields to update" });
      }

      await ctx.api.put<Record<string, unknown>>(`${basePath}/${id}`, body);

      return JSON.stringify({ id, updated_fields: updatedFields });
    }

    case "delete": {
      const id = params.product_id ?? params.id;
      if (!id) return JSON.stringify({ error: "product_id or id required" });

      await ctx.api.delete(`${basePath}/${id}`, { force: params.force ?? false });

      return JSON.stringify({ id, deleted: true });
    }

    default:
      return JSON.stringify({
        error: `Unknown products action: ${action}. Use: list, get, create, update, delete`,
      });
  }
}
