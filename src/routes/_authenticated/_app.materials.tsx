import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  listMaterials,
  upsertMaterial,
  deleteMaterial,
  listBrands,
} from "@/lib/internal.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/materials")({
  head: () => ({
    meta: [
      { title: "الخامات — e-GURUS" },
      { name: "description", content: "إدارة الخامات ووحداتها." },
    ],
  }),
  component: MaterialsPage,
});

const UNITS = [
  { v: "piece", l_ar: "قطعة", l_en: "Piece" },
  { v: "kg", l_ar: "كيلوجرام", l_en: "Kilogram" },
  { v: "gram", l_ar: "جرام", l_en: "Gram" },
  { v: "liter", l_ar: "لتر", l_en: "Liter" },
  { v: "meter", l_ar: "متر", l_en: "Meter" },
];
const unitLabel = (v: string, lang: "ar" | "en") => {
  const u = UNITS.find((u) => u.v === v);
  if (!u) return v;
  return lang === "ar" ? u.l_ar : u.l_en;
};

function MaterialsPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const listFn = useServerFn(listMaterials);
  const upFn = useServerFn(upsertMaterial);
  const delFn = useServerFn(deleteMaterial);
  const listB = useServerFn(listBrands);
  const q = useQuery({ queryKey: ["materials"], queryFn: () => listFn() });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listB() });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    id?: string;
    name: string;
    unit: string;
    unit_cost: number;
    active: boolean;
    brand_ids: string[];
  }>(null);
  const save = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => upFn({ data: v }),
    onSuccess: () => {
      toast.success(T("تم الحفظ", "Saved"));
      qc.invalidateQueries({ queryKey: ["materials"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materials"] }),
  });
  const brands = brandsQ.data ?? [];
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";
  const toggleBrand = (bid: string) => {
    if (!editing) return;
    const has = editing.brand_ids.includes(bid);
    setEditing({
      ...editing,
      brand_ids: has ? editing.brand_ids.filter((x) => x !== bid) : [...editing.brand_ids, bid],
    });
  };
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{T("الخامات", "Materials")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T("قائمة الخامات، الوحدة، وسعر الوحدة.", "List of materials, unit, and unit price.")}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing({ name: "", unit: "piece", unit_cost: 0, active: true, brand_ids: [] });
            setOpen(true);
          }}
        >
          <Plus className="w-4 h-4 me-2" /> {T("خامة جديدة", "New Material")}
        </Button>
      </div>
      <Card className="card-gradient overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-muted-foreground">
              <th className="p-3">{T("الاسم", "Name")}</th>
              <th className="p-3">{T("الوحدة", "Unit")}</th>
              <th className="p-3 text-left">{T("سعر الوحدة", "Unit Price")}</th>
              <th className="p-3">{T("البراندات", "Brands")}</th>
              <th className="p-3">{T("الحالة", "Status")}</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((m) => (
              <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30">
                <td className="p-3 font-medium">{m.name}</td>
                <td className="p-3 text-muted-foreground">{unitLabel(m.unit, lang)}</td>
                <td className="p-3 num text-left">{m.unit_cost.toLocaleString("en-US")}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {(m.brand_ids ?? []).length === 0 && (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                    {(m.brand_ids ?? []).map((bid) => (
                      <Badge key={bid} variant="outline">
                        {brandName(bid)}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="p-3">
                  {m.active ? (
                    <Badge>{T("مفعّل", "Active")}</Badge>
                  ) : (
                    <Badge variant="secondary">{T("معطّل", "Inactive")}</Badge>
                  )}
                </td>
                <td className="p-3 flex gap-2 justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditing({
                        id: m.id,
                        name: m.name,
                        unit: m.unit,
                        unit_cost: m.unit_cost,
                        active: m.active,
                        brand_ids: m.brand_ids ?? [],
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(T("حذف؟", "Delete?"))) remove.mutate(m.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {(q.data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  {T("لا خامات.", "No materials.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? T("تعديل خامة", "Edit Material") : T("خامة جديدة", "New Material")}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>{T("الاسم", "Name")}</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{T("الوحدة", "Unit")}</Label>
                  <Select
                    value={editing.unit}
                    onValueChange={(v) => setEditing({ ...editing, unit: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => (
                        <SelectItem key={u.v} value={u.v}>
                          {lang === "ar" ? u.l_ar : u.l_en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{T("سعر الوحدة", "Unit Price")}</Label>
                  <Input
                    type="number"
                    value={editing.unit_cost}
                    onChange={(e) =>
                      setEditing({ ...editing, unit_cost: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>{T("البراندات المرتبطة", "Linked Brands")}</Label>
                <div className="flex flex-wrap gap-2 mt-2 border rounded-md p-2 max-h-48 overflow-y-auto">
                  {brands
                    .filter((b) => b.active)
                    .map((b) => {
                      const on = editing.brand_ids.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBrand(b.id)}
                          className={`px-2 py-1 rounded-md text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                        >
                          {b.name}
                        </button>
                      );
                    })}
                  {brands.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      {T("لا براندات.", "No brands.")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {T(
                    "يمكن ربط الخامة بأكثر من براند (منتج / خدمي / فرع أوفلاين).",
                    "A material can be linked to more than one brand (product / service / offline branch).",
                  )}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {T("إلغاء", "Cancel")}
            </Button>
            <Button
              onClick={() => editing && save.mutate(editing)}
              disabled={save.isPending || !editing?.name}
            >
              {T("حفظ", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
