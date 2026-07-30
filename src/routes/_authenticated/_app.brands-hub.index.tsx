import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listBhBrands,
  upsertBhBrand,
  deleteBhBrand,
  listBhAccess,
  setBhAccess,
  getBhContext,
  BH_SECTIONS,
} from "@/lib/brandhub.functions";
import { uploadBhFile } from "@/lib/bh-upload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/_app/brands-hub/")({
  head: () => ({
    meta: [
      { title: "Brands Hub — e-GURUS" },
      { name: "description", content: "مكتبة البراندات: الهوية، الـ Playbook، المنتجات والملفات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BrandsHubIndex,
});

const SECTION_LABELS: Record<string, string> = {
  design_system: "Design System",
  playbook: "Playbook",
  products_guideline: "Products",
  tutorials: "Tutorials",
  forms_links: "Forms & Links",
  brand_documents: "Documents",
  wiki: "Wiki",
};

function BrandsHubIndex() {
  const qc = useQueryClient();
  const ctxQ = useQuery({ queryKey: ["bh-ctx"], queryFn: useServerFn(getBhContext) });
  const listFn = useServerFn(listBhBrands);
  const upsertFn = useServerFn(upsertBhBrand);
  const delFn = useServerFn(deleteBhBrand);
  const brandsQ = useQuery({ queryKey: ["bh-brands"], queryFn: () => listFn() });
  const isManager = !!ctxQ.data?.isManager;

  const [open, setOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{
    id?: string;
    name: string;
    slug: string;
    tagline: string;
    accent: string;
    bg: string;
    logo_path: string | null;
    sort_order: number;
  }>({ name: "", slug: "", tagline: "", accent: "#3FDBB1", bg: "#0E7C7B", logo_path: null, sort_order: 0 });

  const brands = brandsQ.data ?? [];

  async function save() {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error("الاسم و الـ slug مطلوبين");
      return;
    }
    setBusy(true);
    try {
      await upsertFn({ data: form });
      toast.success("تم الحفظ");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["bh-brands"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold">Brands Hub</h1>
          <p className="text-sm text-muted-foreground">
            كل براند وملفاته: Design System، Playbook، المنتجات، التعليمات، الفورمز والويكي.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/brands-hub/tasks">المهام</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/brands-hub/creative">Creative</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/brands-hub/insights">Insights</Link>
          </Button>
          {isManager && (
            <>
              <Button variant="outline" onClick={() => setAccessOpen(true)}>
                <ShieldCheck className="w-4 h-4 me-1" /> الصلاحيات
              </Button>
              <Button
                onClick={() => {
                  setForm({ name: "", slug: "", tagline: "", accent: "#3FDBB1", bg: "#0E7C7B", logo_path: null, sort_order: brands.length });
                  setOpen(true);
                }}
              >
                <Plus className="w-4 h-4 me-1" /> براند جديد
              </Button>
            </>
          )}
        </div>
      </div>

      {brandsQ.isLoading ? (
        <div className="text-muted-foreground">جاري التحميل...</div>
      ) : brands.length === 0 ? (
        <EmptyState
          icon="empty"
          title="لا توجد براندات بعد"
          description={isManager ? "ابدأ بإضافة أول براند." : "لم يتم منحك أي براند حتى الآن — كلّم الأدمن."}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => (
            <Card key={b.id} className="p-0 overflow-hidden group">
              <Link to="/brands-hub/$slug" params={{ slug: b.slug }} className="block">
                <div
                  className="h-28 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${b.bg}, ${b.accent})` }}
                >
                  {b.logo_url ? (
                    <img src={b.logo_url} alt={`${b.name} logo`} className="h-16 object-contain" />
                  ) : (
                    <span className="text-2xl font-black text-white/90">{b.name}</span>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <div className="font-bold">{b.name}</div>
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">{b.tagline}</p>
                  <div className="flex flex-wrap gap-1">
                    {BH_SECTIONS.filter((s) => (b.counts?.[s] ?? 0) > 0).map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px]">
                        {SECTION_LABELS[s]} {b.counts?.[s]}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Link>
              {isManager && (
                <div className="flex gap-2 px-4 pb-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setForm({
                        id: b.id,
                        name: b.name,
                        slug: b.slug,
                        tagline: b.tagline,
                        accent: b.accent,
                        bg: b.bg,
                        logo_path: b.logo_path,
                        sort_order: b.sort_order,
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!confirm(`حذف ${b.name}؟`)) return;
                      await delFn({ data: { id: b.id } });
                      qc.invalidateQueries({ queryKey: ["bh-brands"] });
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "تعديل براند" : "براند جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم</Label>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    slug: f.id ? f.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                  }));
                }}
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <div>
              <Label>الوصف المختصر</Label>
              <Input value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Accent</Label>
                <Input type="color" value={form.accent} onChange={(e) => setForm((f) => ({ ...f, accent: e.target.value }))} />
              </div>
              <div>
                <Label>Background</Label>
                <Input type="color" value={form.bg} onChange={(e) => setForm((f) => ({ ...f, bg: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>اللوجو</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    const path = await uploadBhFile(file, "logos");
                    setForm((f) => ({ ...f, logo_path: path }));
                    toast.success("تم رفع اللوجو");
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </div>
            <Button onClick={save} disabled={busy} className="w-full">
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isManager && <AccessDialog open={accessOpen} onOpenChange={setAccessOpen} brands={brands} />}
    </div>
  );
}

function AccessDialog({
  open,
  onOpenChange,
  brands,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  brands: any[];
}) {
  const qc = useQueryClient();
  const accessFn = useServerFn(listBhAccess);
  const setFn = useServerFn(setBhAccess);
  const accessQ = useQuery({ queryKey: ["bh-access"], queryFn: () => accessFn(), enabled: open });
  const [userId, setUserId] = useState<string>("");

  const rows = accessQ.data?.access ?? [];
  const current = useMemo(
    () => new Map(rows.filter((r) => r.user_id === userId).map((r) => [r.brand_id, r.sections])),
    [rows, userId],
  );

  async function toggleBrand(brandId: string, enabled: boolean) {
    await setFn({ data: { userId, brandId, sections: enabled ? [...BH_SECTIONS] : null, enabled } });
    qc.invalidateQueries({ queryKey: ["bh-access"] });
  }

  async function toggleSection(brandId: string, section: string, on: boolean) {
    const existing = current.get(brandId) ?? [...BH_SECTIONS];
    const next = on ? Array.from(new Set([...existing, section])) : existing.filter((s) => s !== section);
    await setFn({ data: { userId, brandId, sections: next, enabled: true } });
    qc.invalidateQueries({ queryKey: ["bh-access"] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>صلاحيات Brands Hub لكل مستخدم</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>المستخدم</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">— اختر مستخدم —</option>
              {(accessQ.data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
          </div>
          {userId &&
            brands.map((b) => {
              const enabled = current.has(b.id);
              const sections = current.get(b.id) ?? [];
              return (
                <Card key={b.id} className="p-3 space-y-2">
                  <label className="flex items-center gap-2 font-medium">
                    <Checkbox checked={enabled} onCheckedChange={(v) => toggleBrand(b.id, !!v)} />
                    {b.name}
                  </label>
                  {enabled && (
                    <div className="flex flex-wrap gap-3 ps-6">
                      {BH_SECTIONS.map((s) => (
                        <label key={s} className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={sections === null || sections.includes(s)}
                            onCheckedChange={(v) => toggleSection(b.id, s, !!v)}
                          />
                          {SECTION_LABELS[s]}
                        </label>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
