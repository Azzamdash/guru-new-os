import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sbForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_products",
  title: "List products",
  description: "List products in the user's accessible brands, optionally filtered by brand_id.",
  inputSchema: {
    brand_id: z.string().uuid().optional().describe("Optional brand UUID to filter by."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ brand_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = sbForUser(ctx)
      .from("products")
      .select("id, name, brand_id, sell_price, cogs_override, unit, reorder_point, active")
      .order("name");
    if (brand_id) q = q.eq("brand_id", brand_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
