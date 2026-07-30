import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export const BH_SECTIONS = [
  "design_system",
  "playbook",
  "products_guideline",
  "tutorials",
  "forms_links",
  "brand_documents",
  "wiki",
] as const;
export type BhSection = (typeof BH_SECTIONS)[number];

export type BhBrand = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  accent: string;
  bg: string;
  logo_path: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BhResource = {
  id: string;
  brand_id: string;
  kind: BhSection;
  title: string;
  file_type: string;
  html_content: string | null;
  storage_path: string | null;
  url: string | null;
  mime_type: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BhWikiEntry = {
  id: string;
  brand_id: string;
  title: string;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const BUCKET = "bh-brand-files";

async function isManager(context: Ctx) {
  const { data } = await context.supabase.rpc("bh_is_manager", { _user_id: context.userId });
  return data === true;
}

async function assertManager(context: Ctx) {
  if (!(await isManager(context))) throw new Error("Forbidden: managers only");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function signPaths(context: Ctx, paths: Array<string | null | undefined>) {
  const out: Record<string, string> = {};
  const unique = Array.from(new Set(paths.filter(Boolean) as string[]));
  await Promise.all(
    unique.map(async (p) => {
      const { data } = await context.supabase.storage.from(BUCKET).createSignedUrl(p, 3600);
      if (data?.signedUrl) out[p] = data.signedUrl;
    }),
  );
  return out;
}

export const getBhContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    userId: context.userId,
    isManager: await isManager(context),
  }));

export const listBhBrands = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("bh_brands")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    const brands = (data ?? []) as BhBrand[];

    const [resCount, wikiCount, logoUrls] = await Promise.all([
      context.supabase.from("bh_resources").select("brand_id,kind"),
      context.supabase.from("bh_wiki_entries").select("brand_id"),
      signPaths(context, brands.map((b) => b.logo_path)),
    ]);

    const counts: Record<string, Record<string, number>> = {};
    brands.forEach((b) => {
      counts[b.id] = Object.fromEntries(BH_SECTIONS.map((s) => [s, 0]));
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (resCount.data ?? []).forEach((r: any) => {
      const c = counts[r.brand_id];
      if (c && r.kind in c) c[r.kind] += 1;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wikiCount.data ?? []).forEach((w: any) => {
      const c = counts[w.brand_id];
      if (c) c.wiki += 1;
    });

    return brands.map((b) => ({
      ...b,
      logo_url: b.logo_path ? (logoUrls[b.logo_path] ?? null) : null,
      counts: counts[b.id],
    }));
  });

export const upsertBhBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      name: string;
      slug: string;
      tagline?: string;
      accent?: string;
      bg?: string;
      logo_path?: string | null;
      sort_order?: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const payload = {
      name: data.name.trim(),
      slug: data.slug.trim().toLowerCase(),
      tagline: data.tagline ?? "",
      accent: data.accent ?? "#3FDBB1",
      bg: data.bg ?? "#0E7C7B",
      logo_path: data.logo_path ?? null,
      sort_order: data.sort_order ?? 0,
    };
    if (data.id) {
      const { error } = await context.supabase.from("bh_brands").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("bh_brands")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const deleteBhBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("bh_brands").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getBhBrand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: brand, error } = await context.supabase
      .from("bh_brands")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw error;
    if (!brand) return null;

    const [resources, wiki, access] = await Promise.all([
      context.supabase
        .from("bh_resources")
        .select("*")
        .eq("brand_id", brand.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      context.supabase
        .from("bh_wiki_entries")
        .select("*")
        .eq("brand_id", brand.id)
        .order("sort_order", { ascending: true }),
      context.supabase
        .from("bh_brand_access")
        .select("sections,hidden_resource_ids,hidden_wiki_ids")
        .eq("brand_id", brand.id)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);

    const manager = await isManager(context);
    const hiddenRes: string[] = manager ? [] : (access.data?.hidden_resource_ids ?? []);
    const hiddenWiki: string[] = manager ? [] : (access.data?.hidden_wiki_ids ?? []);
    const allowedSections: BhSection[] =
      manager || !access.data?.sections
        ? [...BH_SECTIONS]
        : (access.data.sections as BhSection[]);

    const resList = ((resources.data ?? []) as BhResource[]).filter(
      (r) => !hiddenRes.includes(r.id) && allowedSections.includes(r.kind),
    );
    const wikiList = ((wiki.data ?? []) as BhWikiEntry[]).filter((w) => !hiddenWiki.includes(w.id));

    const signed = await signPaths(context, [
      brand.logo_path,
      ...resList.map((r) => r.storage_path),
    ]);

    return {
      brand: { ...(brand as BhBrand), logo_url: brand.logo_path ? (signed[brand.logo_path] ?? null) : null },
      resources: resList.map((r) => ({
        ...r,
        file_url: r.storage_path ? (signed[r.storage_path] ?? null) : null,
      })),
      wiki: allowedSections.includes("wiki") ? wikiList : [],
      allowedSections,
      isManager: manager,
    };
  });

export const upsertBhResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      brand_id: string;
      kind: BhSection;
      title: string;
      file_type?: string;
      html_content?: string | null;
      storage_path?: string | null;
      url?: string | null;
      mime_type?: string | null;
      sort_order?: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const payload = {
      brand_id: data.brand_id,
      kind: data.kind,
      title: data.title.trim(),
      file_type: data.file_type ?? "html",
      html_content: data.html_content ?? null,
      storage_path: data.storage_path ?? null,
      url: data.url ?? null,
      mime_type: data.mime_type ?? null,
      sort_order: data.sort_order ?? 0,
    };
    if (data.id) {
      const { error } = await context.supabase.from("bh_resources").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("bh_resources")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const deleteBhResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("bh_resources").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const upsertBhWiki = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { id?: string; brand_id: string; title: string; content?: string; sort_order?: number }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const payload = {
      brand_id: data.brand_id,
      title: data.title.trim(),
      content: data.content ?? "",
      sort_order: data.sort_order ?? 0,
    };
    if (data.id) {
      const { error } = await context.supabase.from("bh_wiki_entries").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("bh_wiki_entries")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const deleteBhWiki = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const { error } = await context.supabase.from("bh_wiki_entries").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Admin/manager: list every system user with their Brands Hub access rows. */
export const listBhAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const { data: rows, error: aErr } = await context.supabase
      .from("bh_brand_access")
      .select("user_id,brand_id,sections");
    if (aErr) throw aErr;
    return {
      users: users.users.map((u) => ({ id: u.id, email: u.email ?? "" })),
      access: (rows ?? []) as Array<{ user_id: string; brand_id: string; sections: string[] | null }>,
    };
  });

export const setBhAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; brandId: string; sections: string[] | null; enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertManager(context);
    if (!data.enabled) {
      const { error } = await context.supabase
        .from("bh_brand_access")
        .delete()
        .eq("user_id", data.userId)
        .eq("brand_id", data.brandId);
      if (error) throw error;
      return { ok: true };
    }
    const { error } = await context.supabase
      .from("bh_brand_access")
      .upsert(
        { user_id: data.userId, brand_id: data.brandId, sections: data.sections },
        { onConflict: "user_id,brand_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const getBhInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [brands, resources, wiki, tasks, posts, comments] = await Promise.all([
      context.supabase.from("bh_brands").select("id,name,slug"),
      context.supabase.from("bh_resources").select("brand_id,kind"),
      context.supabase.from("bh_wiki_entries").select("brand_id"),
      context.supabase.from("bh_tasks").select("id,status,assignee_id,brand_id"),
      context.supabase.from("bh_creative_posts").select("id,brand_id,author_id,created_at"),
      context.supabase.from("bh_creative_post_comments").select("id,post_id"),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (tasks.data ?? []) as any[];
    return {
      brands: (brands.data ?? []).length,
      resources: (resources.data ?? []).length,
      wiki: (wiki.data ?? []).length,
      tasks: t.length,
      tasksDone: t.filter((x) => x.status === "done").length,
      posts: (posts.data ?? []).length,
      comments: (comments.data ?? []).length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      perBrand: ((brands.data ?? []) as any[]).map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resources: ((resources.data ?? []) as any[]).filter((r) => r.brand_id === b.id).length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wiki: ((wiki.data ?? []) as any[]).filter((w) => w.brand_id === b.id).length,
        tasks: t.filter((x) => x.brand_id === b.id).length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        posts: ((posts.data ?? []) as any[]).filter((p) => p.brand_id === b.id).length,
      })),
    };
  });

export const getBhProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const [tasks, posts, brandsRes] = await Promise.all([
      context.supabase
        .from("bh_tasks")
        .select("id,title,status,priority,due_date,brand_id")
        .eq("assignee_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("bh_creative_posts")
        .select("id,title,body,created_at,brand_id")
        .eq("author_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase.from("bh_brands").select("id,name,slug"),
    ]);
    return {
      user: { id: data.userId, email: u?.user?.email ?? "" },
      tasks: tasks.data ?? [],
      posts: posts.data ?? [],
      brands: brandsRes.data ?? [],
    };
  });
