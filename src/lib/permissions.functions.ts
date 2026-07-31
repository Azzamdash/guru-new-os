import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export const ALL_SECTIONS = [
  "dashboard",
  "data_entry",
  "expenses",
  "sales",
  "production",
  "couriers",
  "fulfillment",
  "suppliers",
  "catalog",
  "marketing",
  "reports_marketing",
  "reports_production",
  "reports_sales",
  "reports_fulfillment",
  "reports_attendance",
  "tasks",
] as const;
export type Section = (typeof ALL_SECTIONS)[number];

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [sections, brands] = await Promise.all([
      context.supabase.from("user_section_access").select("section").eq("user_id", context.userId),
      context.supabase.from("user_brand_access").select("brand_id").eq("user_id", context.userId),
    ]);
    return {
      sections: (sections.data ?? []).map((r: { section: string }) => r.section),
      brandIds: (brands.data ?? []).map((r: { brand_id: string }) => r.brand_id),
    };
  });

export const getUserAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const [sections, brands] = await Promise.all([
      context.supabase.from("user_section_access").select("section").eq("user_id", data.userId),
      context.supabase.from("user_brand_access").select("brand_id").eq("user_id", data.userId),
    ]);
    return {
      sections: (sections.data ?? []).map((r: { section: string }) => r.section),
      brandIds: (brands.data ?? []).map((r: { brand_id: string }) => r.brand_id),
    };
  });

export const setUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; sections: string[]; brandIds: string[] }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // reset
    await supabaseAdmin.from("user_section_access").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_brand_access").delete().eq("user_id", data.userId);

    const validSections = data.sections.filter(
      (s) =>
        (ALL_SECTIONS as readonly string[]).includes(s) ||
        s.startsWith("deny:/") ||
        s.startsWith("page:/") ||
        s.startsWith("write:/"),
    );
    if (validSections.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_section_access")
        .insert(validSections.map((section) => ({ user_id: data.userId, section })));
      if (error) throw error;
    }
    if (data.brandIds.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_brand_access")
        .insert(data.brandIds.map((brand_id) => ({ user_id: data.userId, brand_id })));
      if (error) throw error;
    }
    return { ok: true };
  });
