import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  listCouriers, upsertCourier, deleteCourier,
  listBrands,
} from "@/lib/internal.functions";

export const Route = createFileRoute("/_authenticated/_app/couriers")({
  head: () => ({ meta: [
    { title: "المناديب وشركات الشحن — e-GURUS" },
    { name: "description", content: "إدارة المناديب وشركات الشحن ومتابعة أدائها لكل براند." },
  ]}),
  component: CouriersPage,
});

const TYPE_LABEL: Record<string, string> = { courier_company: "شركة شحن", rep: "مندوب", offline_branch: "فرع أوفلاين" };

function CouriersPage() {
  const qc = useQueryClient();
  const listC = useServerFn(listCouriers);
  const listB = useServerFn(listBrands);
  const upC = useServerFn(upsertCourier);
  const delC = useServerFn(deleteCourier);
  const couriersQ = useQuery({ queryKey: ["couriers"], queryFn: () => listC() });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listB() });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<null | { id?: string; name: string; type: "courier_company"|"rep"|"offline_branch"; contact: string; brand_id: string | null; active: boolean; opening_balance: number }>(null);

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => upC({ data: { ...v, contact: v.contact || null } }),
    onSuccess: () => { toast.success("تم"); qc.invalidateQueries({ queryKey: ["couriers"] }); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delC({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couriers"] }),
  });

  const brands = brandsQ.data ?? [];
  const brandName = (id: string | null) => id ? brands.find((b) => b.id === id)?.name ?? "—" : "—";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">المناديب وشركات الشحن</h1>
          <p className="text-muted-foreground text-sm mt-1">إضافة وإدارة المناديب وشركات الشحن. للتقارير والأداء راجع «لوحة شركات الشحن».</p>
        </div>
        <Button onClick={() => { setEditing({ name: "", type: "courier_company", contact: "", brand_id: null, active: true, opening_balance: 0 }); setOpen(true); }}>
          <Plus className="w-4 h-4 me-2" /> إضافة
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(couriersQ.data ?? []).map((c) => (
            <Card key={c.id} className="card-gradient p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{c.name}</h3>
                    <Badge variant="outline">{TYPE_LABEL[c.type]}</Badge>
                    {!c.active && <Badge variant="secondary">معطّل</Badge>}
                  </div>
                  {c.contact && <p className="text-xs text-muted-foreground mt-1" dir="ltr">{c.contact}</p>}
                  {c.brand_id && <p className="text-xs text-muted-foreground">مخصّص لـ: {brandName(c.brand_id)}</p>}
                  {Number(c.opening_balance ?? 0) !== 0 && (
                    <p className="text-xs mt-1">
                      رصيد افتتاحي: <span className={`num font-semibold ${Number(c.opening_balance) > 0 ? "text-emerald-600" : "text-destructive"}`}>{Number(c.opening_balance).toLocaleString()}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing({ id: c.id, name: c.name, type: c.type, contact: c.contact ?? "", brand_id: c.brand_id, active: c.active, opening_balance: Number(c.opening_balance ?? 0) }); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("حذف؟")) remove.mutate(c.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </div>
            </Card>
        ))}
        {(couriersQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground col-span-full">لا يوجد. اضغط "إضافة".</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "تعديل" : "إضافة"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>الاسم</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div>
                <Label>النوع</Label>
                <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v as typeof editing.type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="courier_company">شركة شحن</SelectItem>
                    <SelectItem value="rep">مندوب</SelectItem>
                    <SelectItem value="offline_branch">فرع أوفلاين</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>وسيلة التواصل</Label><Input value={editing.contact} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} /></div>
              <div>
                <Label>مخصّص لبراند (اختياري)</Label>
                <Select value={editing.brand_id ?? "none"} onValueChange={(v) => setEditing({ ...editing, brand_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— كل البراندات —</SelectItem>
                    {brands.filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الرصيد الافتتاحي (موجب = مستحق لنا عنده، سالب = له عندنا)</Label>
                <Input type="number" dir="ltr" className="text-left" value={editing.opening_balance}
                  onChange={(e) => setEditing({ ...editing, opening_balance: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.name}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
