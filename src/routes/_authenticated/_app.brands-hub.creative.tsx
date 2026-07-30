import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listBhFeed,
  upsertBhPost,
  deleteBhPost,
  setBhPostHidden,
  toggleBhLike,
  addBhPostComment,
  deleteBhPostComment,
  reportBhContent,
} from "@/lib/brandhub-creative.functions";
import { listBhBrands } from "@/lib/brandhub.functions";
import { uploadBhFile } from "@/lib/bh-upload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Heart, MessageCircle, Flag, Trash2, EyeOff, Eye, Download } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/_app/brands-hub/creative")({
  head: () => ({
    meta: [
      { title: "Creative Feed — Brands Hub — e-GURUS" },
      { name: "description", content: "فيد الأعمال الإبداعية للبراندات: صور، ملفات، روابط وتفاعل الفريق." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CreativeFeed,
});

function CreativeFeed() {
  const qc = useQueryClient();
  const feedFn = useServerFn(listBhFeed);
  const brandsFn = useServerFn(listBhBrands);
  const postFn = useServerFn(upsertBhPost);
  const delFn = useServerFn(deleteBhPost);
  const hideFn = useServerFn(setBhPostHidden);
  const likeFn = useServerFn(toggleBhLike);
  const commentFn = useServerFn(addBhPostComment);
  const delCommentFn = useServerFn(deleteBhPostComment);
  const reportFn = useServerFn(reportBhContent);

  const [brandId, setBrandId] = useState("");
  const q = useQuery({ queryKey: ["bh-feed", brandId], queryFn: () => feedFn({ data: { brandId: brandId || null } }) });
  const brandsQ = useQuery({ queryKey: ["bh-brands"], queryFn: () => brandsFn() });

  const [draft, setDraft] = useState<{
    title: string;
    body: string;
    brand_id: string;
    link_url: string;
    image_path: string | null;
    file_path: string | null;
    file_name: string | null;
    mime_type: string | null;
  }>({ title: "", body: "", brand_id: "", link_url: "", image_path: null, file_path: null, file_name: null, mime_type: null });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const users = q.data?.users ?? [];
  const emailOf = (id: string | null) => users.find((u) => u.id === id)?.email ?? "مستخدم";
  const refresh = () => qc.invalidateQueries({ queryKey: ["bh-feed"] });

  async function publish() {
    if (!draft.title.trim() && !draft.body.trim() && !draft.image_path && !draft.file_path)
      return toast.error("اكتب محتوى أو ارفع ملف");
    setBusy(true);
    try {
      await postFn({ data: { ...draft, brand_id: draft.brand_id || null, link_url: draft.link_url || null } });
      setDraft({ title: "", body: "", brand_id: "", link_url: "", image_path: null, file_path: null, file_name: null, mime_type: null });
      refresh();
      toast.success("تم النشر");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl mx-auto">
      <Button asChild variant="ghost" size="sm">
        <Link to="/brands-hub">
          <ArrowLeft className="w-4 h-4 me-1" /> Brands Hub
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-extrabold">Creative Feed</h1>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
        >
          <option value="">كل البراندات</option>
          {(brandsQ.data ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="p-4 space-y-3">
        <Input placeholder="عنوان" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        <Textarea rows={3} placeholder="شارك شغلك..." value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">البراند</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={draft.brand_id}
              onChange={(e) => setDraft((d) => ({ ...d, brand_id: e.target.value }))}
            >
              <option value="">— بدون —</option>
              {(brandsQ.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">رابط</Label>
            <Input placeholder="https://..." value={draft.link_url} onChange={(e) => setDraft((d) => ({ ...d, link_url: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">صورة</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const path = await uploadBhFile(file, "feed");
                setDraft((d) => ({ ...d, image_path: path, mime_type: file.type }));
                toast.success("تم رفع الصورة");
              }}
            />
          </div>
          <div>
            <Label className="text-xs">ملف</Label>
            <Input
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const path = await uploadBhFile(file, "feed");
                setDraft((d) => ({ ...d, file_path: path, file_name: file.name, mime_type: file.type }));
                toast.success("تم رفع الملف");
              }}
            />
          </div>
        </div>
        <Button onClick={publish} disabled={busy}>
          نشر
        </Button>
      </Card>

      {q.isLoading ? (
        <EmptyState icon="loading" />
      ) : (q.data?.posts ?? []).length === 0 ? (
        <EmptyState title="لا توجد منشورات بعد" />
      ) : (
        (q.data?.posts ?? []).map((p) => (
          <Card key={p.id} className={`p-4 space-y-3 ${p.hidden ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link to="/brands-hub/profile/$userId" params={{ userId: p.author_id ?? "" }} className="font-medium text-sm hover:underline">
                  {emailOf(p.author_id)}
                </Link>
                <div className="text-[11px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-1">
                {p.hidden && <Badge variant="secondary">مخفي</Badge>}
                {q.data?.isManager && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await hideFn({ data: { id: p.id, hidden: !p.hidden } });
                      refresh();
                    }}
                  >
                    {p.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </Button>
                )}
                {(q.data?.isManager || p.author_id === q.data?.me) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm("حذف المنشور؟")) return;
                      await delFn({ data: { id: p.id } });
                      refresh();
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const reason = prompt("سبب الإبلاغ؟");
                    if (!reason) return;
                    await reportFn({ data: { postId: p.id, reason } });
                    toast.success("تم إرسال البلاغ");
                  }}
                >
                  <Flag className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {p.title && <div className="font-bold">{p.title}</div>}
            {p.body && <p className="text-sm whitespace-pre-wrap">{p.body}</p>}
            {p.image_url && <img src={p.image_url} alt={p.title || "creative post"} className="rounded-lg max-h-[480px] w-full object-contain bg-muted" />}
            {p.file_url && (
              <a href={p.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline">
                <Download className="w-3.5 h-3.5" /> {p.file_name ?? "ملف"}
              </a>
            )}
            {p.link_url && (
              <a href={p.link_url} target="_blank" rel="noreferrer" className="block text-sm text-primary underline break-all">
                {p.link_url}
              </a>
            )}

            <div className="flex items-center gap-4 pt-2 border-t border-border/50">
              <button
                className={`flex items-center gap-1 text-sm ${p.liked_by_me ? "text-destructive" : "text-muted-foreground"}`}
                onClick={async () => {
                  await likeFn({ data: { postId: p.id } });
                  refresh();
                }}
              >
                <Heart className={`w-4 h-4 ${p.liked_by_me ? "fill-current" : ""}`} /> {p.likes}
              </button>
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <MessageCircle className="w-4 h-4" /> {p.comments.length}
              </span>
            </div>

            <div className="space-y-2">
              {p.comments.map((c: { id: string; body: string; author_id: string | null; created_at: string }) => (
                <div key={c.id} className="text-sm bg-muted/40 rounded-md p-2 flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] text-muted-foreground me-2">{emailOf(c.author_id)}</span>
                    {c.body}
                  </div>
                  {(q.data?.isManager || c.author_id === q.data?.me) && (
                    <button
                      onClick={async () => {
                        await delCommentFn({ data: { id: c.id } });
                        refresh();
                      }}
                    >
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="تعليق..."
                  value={commentDrafts[p.id] ?? ""}
                  onChange={(e) => setCommentDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    const body = commentDrafts[p.id];
                    if (!body?.trim()) return;
                    await commentFn({ data: { postId: p.id, body } });
                    setCommentDrafts((d) => ({ ...d, [p.id]: "" }));
                    refresh();
                  }}
                >
                  إرسال
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
