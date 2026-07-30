import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

const BUCKET = "bh-brand-files";

async function isManager(context: Ctx) {
  const { data } = await context.supabase.rpc("bh_is_manager", { _user_id: context.userId });
  return data === true;
}

export type BhPost = {
  id: string;
  author_id: string | null;
  brand_id: string | null;
  kind: string;
  title: string;
  body: string;
  image_path: string | null;
  file_path: string | null;
  file_name: string | null;
  link_url: string | null;
  mime_type: string | null;
  hidden: boolean;
  created_at: string;
  updated_at: string;
};

export const listBhFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { brandId?: string | null }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("bh_creative_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: posts, error } = await q;
    if (error) throw error;
    const list = (posts ?? []) as BhPost[];
    const ids = list.map((p) => p.id);

    const [likes, comments, usersList] = await Promise.all([
      ids.length
        ? context.supabase.from("bh_creative_likes").select("post_id,user_id").in("post_id", ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? context.supabase
            .from("bh_creative_post_comments")
            .select("*")
            .in("post_id", ids)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
      (async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: u } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
        return (u?.users ?? []).map((x) => ({ id: x.id, email: x.email ?? "" }));
      })(),
    ]);

    const signed: Record<string, string> = {};
    await Promise.all(
      list.flatMap((p) =>
        [p.image_path, p.file_path].filter(Boolean).map(async (path) => {
          const { data: s } = await context.supabase.storage
            .from(BUCKET)
            .createSignedUrl(path as string, 3600);
          if (s?.signedUrl) signed[path as string] = s.signedUrl;
        }),
      ),
    );

    return {
      me: context.userId,
      isManager: await isManager(context),
      users: usersList,
      posts: list.map((p) => ({
        ...p,
        image_url: p.image_path ? (signed[p.image_path] ?? null) : null,
        file_url: p.file_path ? (signed[p.file_path] ?? null) : null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        likes: ((likes.data ?? []) as any[]).filter((l) => l.post_id === p.id).length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        liked_by_me: ((likes.data ?? []) as any[]).some(
          (l) => l.post_id === p.id && l.user_id === context.userId,
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        comments: ((comments.data ?? []) as any[]).filter((c) => c.post_id === p.id),
      })),
    };
  });

export const upsertBhPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      title?: string;
      body?: string;
      brand_id?: string | null;
      kind?: string;
      image_path?: string | null;
      file_path?: string | null;
      file_name?: string | null;
      link_url?: string | null;
      mime_type?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const payload = {
      title: data.title ?? "",
      body: data.body ?? "",
      brand_id: data.brand_id || null,
      kind: data.kind ?? "post",
      image_path: data.image_path ?? null,
      file_path: data.file_path ?? null,
      file_name: data.file_name ?? null,
      link_url: data.link_url || null,
      mime_type: data.mime_type ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("bh_creative_posts")
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("bh_creative_posts")
      .insert({ ...payload, author_id: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const deleteBhPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bh_creative_posts").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const setBhPostHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; hidden: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isManager(context))) throw new Error("Forbidden: managers only");
    const { error } = await context.supabase
      .from("bh_creative_posts")
      .update({ hidden: data.hidden })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const toggleBhLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("bh_creative_likes")
      .select("id")
      .eq("post_id", data.postId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase.from("bh_creative_likes").delete().eq("id", existing.id);
      if (error) throw error;
      return { liked: false };
    }
    const { error } = await context.supabase
      .from("bh_creative_likes")
      .insert({ post_id: data.postId, user_id: context.userId });
    if (error) throw error;
    return { liked: true };
  });

export const addBhPostComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId: string; body: string; parentId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bh_creative_post_comments").insert({
      post_id: data.postId,
      parent_id: data.parentId ?? null,
      body: data.body.trim(),
      author_id: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deleteBhPostComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bh_creative_post_comments")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const reportBhContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId?: string | null; commentId?: string | null; reason: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bh_creative_reports").insert({
      post_id: data.postId ?? null,
      comment_id: data.commentId ?? null,
      reason: data.reason,
      reporter_id: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const listBhReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isManager(context))) return [];
    const { data, error } = await context.supabase
      .from("bh_creative_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const resolveBhReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "open" | "resolved" }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isManager(context))) throw new Error("Forbidden: managers only");
    const { error } = await context.supabase
      .from("bh_creative_reports")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
