import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  getBhBrand,
  upsertBhResource,
  deleteBhResource,
  upsertBhWiki,
  deleteBhWiki,
  BH_SECTIONS,
  type BhSection,
} from "@/lib/brandhub.functions";
import { uploadBhFile } from "@/lib/bh-upload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Pencil, ExternalLink, Download, FileText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/_app/brands-hub/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Brands Hub — e-GURUS` },
      { name: "description", content: "ملفات وهوية البراند داخل e-GURUS Brands Hub." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BrandDetail,
});

const SECTION_LABELS: Record<BhSection, string> = {
  design_system: "Design System",
  playbook: "Playbook",
  products_guideline: "Products",
  tutorials: "Tutorials",
  forms_links: "Forms & Links",
  brand_documents: "Documents",
  wiki: "Wiki",
};

function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v"))
      return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    if (u.hostname === "youtu.be") return `https://www.youtube.com/embed${u.pathname}`;
    if (u.hostname.includes("docs.google.com") || u.hostname.includes("drive.google.com")) return url;
    if (u.hostname.includes("loom.com")) return url.replace("/share/", "/embed/");
    if (u.hostname.includes("figma.com")) return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;
    return null;
  } catch {
    return null;
  }
}

type ResForm = {
  id?: string;
  kind: BhSection;
  title: string;
  file_type: string;
  html_content: string;
  storage_path: string | null;
  url: string;
  mime_type: string | null;
  sort_order: number;
};

function BrandDetail() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getBhBrand);
  const upsertResFn = useServerFn(upsertBhResource);
  const delResFn = useServerFn(deleteBhResource);
  const upsertWikiFn = useServerFn(upsertBhWiki);
  const delWikiFn = useServerFn(deleteBhWiki);

  const q = useQuery({ queryKey: ["bh-brand", slug], queryFn: () => getFn({ data: { slug } }) });
  const [resOpen, setResOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resForm, setResForm] = useState<ResForm>({
    kind: "design_system",
    title: "",
    file_type: "html",
    html_content: "",
    storage_path: null,
    url: "",
    mime_type: null,
    sort_order: 0,
  });
  const [wikiForm, setWikiForm] = useState<{ id?: string; title: string; content: string }>({ title: "", content: "" });
  const [viewing, setViewing] = useState<{ title: string; html: string } | null>(null);

  if (q.isLoading) return <div className="p-8 text-muted-foreground">جاري التحميل...</div>;
  if (!q.data)
    return (
      <div className="p-8">
        <EmptyState icon="warn" title="البراند غير موجود أو ليس لديك صلاحية عليه" />
      </div>
    );

  const { brand, resources, wiki, allowedSections, isManager } = q.data;

  async function saveResource() {
    if (!resForm.title.trim()) return toast.error("العنوان مطلوب");
    setBusy(true);
    try {
      await upsertResFn({
        data: {
          id: resForm.id,
          brand_id: brand.id,
          kind: resForm.kind,
          title: resForm.title,
          file_type: resForm.file_type,
          html_content: resForm.html_content || null,
          storage_path: resForm.storage_path,
          url: resForm.url || null,
          mime_type: resForm.mime_type,
          sort_order: resForm.sort_order,
        },
      });
      toast.success("تم الحفظ");
      setResOpen(false);
      qc.invalidateQueries({ queryKey: ["bh-brand", slug] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveWiki() {
    if (!wikiForm.title.trim()) return toast.error("العنوان مطلوب");
    setBusy(true);
    try {
      await upsertWikiFn({ data: { id: wikiForm.id, brand_id: brand.id, title: wikiForm.title, content: wikiForm.content } });
      toast.success("تم الحفظ");
      setWikiOpen(false);
      qc.invalidateQueries({ queryKey: ["bh-brand", slug] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sections = BH_SECTIONS.filter((s) => allowedSections.includes(s));

  return (
    <div className="p-4 md:p-8 space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/brands-hub">
          <ArrowLeft className="w-4 h-4 me-1" /> كل البراندات
        </Link>
      </Button>

      <div
        className="rounded-3xl p-6 flex items-center gap-4"
        style={{ background: `linear-gradient(135deg, ${brand.bg}, ${brand.accent})` }}
      >
        {brand.logo_url && <img src={brand.logo_url} alt={`${brand.name} logo`} className="h-16 object-contain" />}
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">{brand.name}</h1>
          <p className="text-white/80 text-sm">{brand.tagline}</p>
        </div>
      </div>

      <Tabs defaultValue={sections[0] ?? "design_system"}>
        <TabsList className="flex-wrap h-auto">
          {sections.map((s) => (
            <TabsTrigger key={s} value={s}>
              {SECTION_LABELS[s]}
            </TabsTrigger>
          ))}
        </TabsList>

        {sections.map((s) => (
          <TabsContent key={s} value={s} className="space-y-3 pt-4">
            {isManager && (
              <Button
                size="sm"
                onClick={() => {
                  if (s === "wiki") {
                    setWikiForm({ title: "", content: "" });
                    setWikiOpen(true);
                  } else {
                    setResForm({
                      kind: s,
                      title: "",
                      file_type: "html",
                      html_content: "",
                      storage_path: null,
                      url: "",
                      mime_type: null,
                      sort_order: 0,
                    });
                    setResOpen(true);
                  }
                }}
              >
                <Plus className="w-4 h-4 me-1" /> إضافة
              </Button>
            )}

            {s === "wiki" ? (
              wiki.length === 0 ? (
                <EmptyState title="لا توجد مقالات ويكي" />
              ) : (
                wiki.map((w) => (
                  <Card key={w.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold">{w.title}</div>
                      {isManager && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setWikiForm({ id: w.id, title: w.title, content: w.content });
                              setWikiOpen(true);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              if (!confirm("حذف؟")) return;
                              await delWikiFn({ data: { id: w.id } });
                              qc.invalidateQueries({ queryKey: ["bh-brand", slug] });
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{w.content}</p>
                  </Card>
                ))
              )
            ) : resources.filter((r) => r.kind === s).length === 0 ? (
              <EmptyState title="لا يوجد محتوى في هذا القسم بعد" />
            ) : (
              resources
                .filter((r) => r.kind === s)
                .map((r) => {
                  const embed = r.url ? embedUrl(r.url) : null;
                  return (
                    <Card key={r.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 font-medium">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          {r.title}
                        </div>
                        <div className="flex gap-1">
                          {r.html_content && (
                            <Button size="sm" variant="outline" onClick={() => setViewing({ title: r.title, html: r.html_content! })}>
                              فتح
                            </Button>
                          )}
                          {r.file_url && (
                            <Button asChild size="sm" variant="outline">
                              <a href={r.file_url} target="_blank" rel="noreferrer">
                                <Download className="w-3.5 h-3.5 me-1" /> تحميل
                              </a>
                            </Button>
                          )}
                          {r.url && !embed && (
                            <Button asChild size="sm" variant="outline">
                              <a href={r.url} target="_blank" rel="noreferrer">
                                <ExternalLink className="w-3.5 h-3.5 me-1" /> فتح الرابط
                              </a>
                            </Button>
                          )}
                          {isManager && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setResForm({
                                    id: r.id,
                                    kind: r.kind,
                                    title: r.title,
                                    file_type: r.file_type,
                                    html_content: r.html_content ?? "",
                                    storage_path: r.storage_path,
                                    url: r.url ?? "",
                                    mime_type: r.mime_type,
                                    sort_order: r.sort_order,
                                  });
                                  setResOpen(true);
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  if (!confirm("حذف؟")) return;
                                  await delResFn({ data: { id: r.id } });
                                  qc.invalidateQueries({ queryKey: ["bh-brand", slug] });
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {embed && (
                        <iframe
                          src={embed}
                          title={r.title}
                          className="w-full h-[420px] rounded-lg border border-border"
                          allowFullScreen
                        />
                      )}
                      {r.file_url && r.mime_type?.startsWith("image/") && (
                        <img src={r.file_url} alt={r.title} className="rounded-lg max-h-[420px] object-contain" />
                      )}
                      {r.file_url && r.mime_type === "application/pdf" && (
                        <iframe src={r.file_url} title={r.title} className="w-full h-[520px] rounded-lg border border-border" />
                      )}
                    </Card>
                  );
                })
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-5xl h-[85vh] p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>{viewing?.title}</DialogTitle>
          </DialogHeader>
          <iframe srcDoc={viewing?.html ?? ""} title={viewing?.title ?? ""} className="w-full h-full rounded-b-lg" sandbox="allow-same-origin allow-popups" />
        </DialogContent>
      </Dialog>

      <Dialog open={resOpen} onOpenChange={setResOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{resForm.id ? "تعديل عنصر" : "عنصر جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>العنوان</Label>
              <Input value={resForm.title} onChange={(e) => setResForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>رابط خارجي (اختياري)</Label>
              <Input placeholder="https://..." value={resForm.url} onChange={(e) => setResForm((f) => ({ ...f, url: e.target.value }))} />
            </div>
            <div>
              <Label>ملف (اختياري)</Label>
              <Input
                type="file"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    const path = await uploadBhFile(file, `brands/${brand.id}`);
                    setResForm((f) => ({ ...f, storage_path: path, mime_type: file.type || null, file_type: "file" }));
                    toast.success("تم رفع الملف");
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
            <div>
              <Label>محتوى HTML (اختياري)</Label>
              <Textarea
                rows={8}
                value={resForm.html_content}
                onChange={(e) => setResForm((f) => ({ ...f, html_content: e.target.value, file_type: "html" }))}
              />
            </div>
            <Button onClick={saveResource} disabled={busy} className="w-full">
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={wikiOpen} onOpenChange={setWikiOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{wikiForm.id ? "تعديل مقال" : "مقال ويكي جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>العنوان</Label>
              <Input value={wikiForm.title} onChange={(e) => setWikiForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>المحتوى</Label>
              <Textarea rows={10} value={wikiForm.content} onChange={(e) => setWikiForm((f) => ({ ...f, content: e.target.value }))} />
            </div>
            <Button onClick={saveWiki} disabled={busy} className="w-full">
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
