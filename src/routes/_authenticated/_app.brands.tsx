import { tr } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listBrands, upsertBrand, deleteBrand } from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
import { useLang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Lock, Pencil, Layers } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/brands")({
  head: () => ({ meta: [{ title: tr("البراندات — e-GURUS") }] }),
  component: BrandsPage,
});

type Brand = {
  id: string;
  name: string;
  slug: string;
  type: "product" | "service" | "offline_branch";
  active: boolean;
  sort_order: number;
  cogs_percent_default?: number | null;
};

function BrandsPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: useServerFn(getMyRole) });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: useServerFn(listBrands) });
  const upsertFn = useServerFn(upsertBrand);
  const delFn = useServerFn(deleteBrand);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["brands"] });
    qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
  };
  const [editing, setEditing] = useState<Brand | null>(null);

  if (!roleQ.data?.isAdmin) {
    return (
      <div className="p-10 max-w-2xl mx-auto">
        <Card className="p-8 text-center card-gradient">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-bold">{T("مقصور على الأدمن", "Admins only")}</h2>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{T("البراندات", "Brands")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "إدارة الفروع والبراندات (منتجات وخدمات).",
              "Manage branches and brands (products and services).",
            )}
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() =>
            setEditing({
              id: "",
              name: "",
              slug: "",
              type: "product",
              active: true,
              sort_order: 0,
              cogs_percent_default: null,
            })
          }
        >
          <Plus className="w-4 h-4" /> {T("إضافة براند", "Add brand")}
        </Button>
      </div>

      <Card className="card-gradient overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-right border-b border-border">
              <th className="p-3">{T("الاسم", "Name")}</th>
              <th className="p-3">{T("النوع", "Type")}</th>
              <th className="p-3">{T("الترتيب", "Order")}</th>
              <th className="p-3">COGS %</th>
              <th className="p-3">{T("الحالة", "Status")}</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(brandsQ.data ?? []).map((b) => (
              <tr key={b.id} className="border-b border-border/50">
                <td className="p-3 font-medium">{b.name}</td>
                <td className="p-3">
                  <Badge variant="outline">
                    {b.type === "service"
                      ? T("خدمات", "Services")
                      : b.type === "offline_branch"
                        ? T("فرع أوفلاين", "Offline branch")
                        : T("منتجات", "Products")}
                  </Badge>
                </td>
                <td className="p-3 num">{b.sort_order}</td>
                <td className="p-3 num">
                  {b.cogs_percent_default != null ? `${b.cogs_percent_default}%` : "—"}
                </td>
                <td className="p-3">
                  {b.active ? (
                    <Badge>{T("مفعّل", "Active")}</Badge>
                  ) : (
                    <Badge variant="secondary">{T("موقوف", "Disabled")}</Badge>
                  )}
                </td>
                <td className="p-3 text-left">
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    title={T("تقارير المخزون", "Inventory reports")}
                  >
                    <Link
                      to="/reports/inventory-valuation"
                      search={{
                        brandId: b.type === "offline_branch" ? "" : b.id,
                        branchId: b.type === "offline_branch" ? b.id : "",
                        year: new Date().getFullYear(),
                      }}
                    >
                      <Layers className="w-4 h-4" />
                    </Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(b)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        confirm(T("حذف البراند وكل بياناته؟", "Delete the brand and all its data?"))
                      )
                        delFn({ data: { id: b.id } }).then(() => {
                          toast.success(T("حُذف", "Deleted"));
                          invalidate();
                        });
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {(brandsQ.data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  {T("لا براندات بعد.", "No brands yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <BrandDialog
        editing={editing}
        onClose={() => setEditing(null)}
        save={upsertFn}
        onSaved={invalidate}
      />
    </div>
  );
}

function BrandDialog({
  editing,
  onClose,
  save,
  onSaved,
}: {
  editing: Brand | null;
  onClose: () => void;
  save: ReturnType<typeof useServerFn>;
  onSaved: () => void;
}) {
  if (!editing) return null;
  return <BrandDialogInner editing={editing} onClose={onClose} save={save} onSaved={onSaved} />;
}

function BrandDialogInner({
  editing,
  onClose,
  save,
  onSaved,
}: {
  editing: Brand;
  onClose: () => void;
  save: ReturnType<typeof useServerFn>;
  onSaved: () => void;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [form, setForm] = useState<Brand>(editing);
  const submit = () => {
    if (!form.name.trim() || !form.slug.trim())
      return toast.error(T("الاسم والرابط المختصر مطلوبان", "Name and slug are required"));
    const payload: Partial<Brand> = {
      name: form.name,
      slug: form.slug,
      type: form.type,
      active: form.active,
      sort_order: form.sort_order,
      cogs_percent_default: form.cogs_percent_default ?? null,
    };
    if (form.id) payload.id = form.id;
    save({ data: payload })
      .then(() => {
        toast.success(T("تم الحفظ", "Saved"));
        onSaved();
        onClose();
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : T("فشل", "Failed")));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogTrigger className="hidden" />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {form.id ? T("تعديل براند", "Edit brand") : T("براند جديد", "New brand")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{T("الاسم", "Name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>{T("الرابط المختصر (slug)", "Slug")}</Label>
            <Input
              value={form.slug}
              dir="ltr"
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </div>
          <div>
            <Label>{T("النوع", "Type")}</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
                setForm({ ...form, type: v as "product" | "service" | "offline_branch" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">
                  {T("منتجات (Confirmation/Delivery)", "Products (Confirmation/Delivery)")}
                </SelectItem>
                <SelectItem value="service">
                  {T("خدمات (عملاء ومشروعات)", "Services (clients and projects)")}
                </SelectItem>
                <SelectItem value="offline_branch">
                  {T("فرع أوفلاين (POS / مخزون فرع)", "Offline branch (POS / branch inventory)")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{T("الترتيب", "Order")}</Label>
            <Input
              type="number"
              dir="ltr"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label>
              {T("نسبة تكلفة البضاعة الافتراضية % (اختياري)", "Default COGS % (optional)")}
            </Label>
            <Input
              type="number"
              dir="ltr"
              step="0.01"
              placeholder={T("مثال: 40", "e.g. 40")}
              value={form.cogs_percent_default ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  cogs_percent_default: e.target.value === "" ? null : parseFloat(e.target.value),
                })
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              {T(
                "تُطبَّق على منتجات البراند إذا لم يكن للمنتج تكلفة أو نسبة خاصة.",
                "Applied to the brand's products when a product has no cost or specific percentage of its own.",
              )}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <Label>{T("مفعّل", "Active")}</Label>
            <Switch
              checked={form.active}
              onCheckedChange={(v) => setForm({ ...form, active: v })}
            />
          </div>
          <Button onClick={submit} className="w-full">
            {T("حفظ", "Save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
