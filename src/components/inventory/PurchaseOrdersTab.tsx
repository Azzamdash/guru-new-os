import { tr } from "@/lib/i18n";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, PackageCheck, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { listBrands, listProducts, listMaterials, listSuppliers } from "@/lib/internal.functions";
import {
  listPurchaseOrders, getPurchaseOrder, getPurchaseOrdersSummary,
  upsertPurchaseOrder, deletePurchaseOrder,
  upsertPurchaseOrderItem, deletePurchaseOrderItem,
  markAwaitingDelivery, completePurchaseOrder, cancelPurchaseOrder,
  type PurchaseOrderStatus,
} from "@/lib/purchase-orders.functions";

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "مسودة", awaiting_delivery: "قيد الاستلام", completed: "مكتمل", cancelled: "ملغي",
};
const STATUS_VARIANT: Record<PurchaseOrderStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline", awaiting_delivery: "secondary", completed: "default", cancelled: "destructive",
};

export function PurchaseOrdersTab() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["inventory-mgmt"] });
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: useServerFn(listBrands) });
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: useServerFn(listSuppliers) });

  const [status, setStatus] = useState<PurchaseOrderStatus | "all">("all");
  const [supplierId, setSupplierId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const summaryQ = useQuery({ queryKey: ["purchase-orders", "summary"], queryFn: useServerFn(getPurchaseOrdersSummary) });

  const listFn = useServerFn(listPurchaseOrders);
  const listQ = useQuery({
    queryKey: ["purchase-orders", "list", status, supplierId, from, to],
    queryFn: () => listFn({ data: {
      status: status === "all" ? null : status,
      supplierId: supplierId === "all" ? null : supplierId,
      from: from || null,
      to: to || null,
    } }),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState("");
  const [newBrand, setNewBrand] = useState("");

  const upsertFn = useServerFn(upsertPurchaseOrder);
  const createMut = useMutation({
    mutationFn: () => upsertFn({ data: { supplier_id: newSupplier, brand_id: newBrand || null } }),
    onSuccess: (r) => { setCreateOpen(false); setNewSupplier(""); setNewBrand(""); invalidate(); setEditingId(r.id); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delFn = useServerFn(deletePurchaseOrder);
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success(tr("تم الحذف")); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const awaitFn = useServerFn(markAwaitingDelivery);
  const awaitMut = useMutation({
    mutationFn: (id: string) => awaitFn({ data: { id } }),
    onSuccess: () => { toast.success(tr("تم التحويل لقيد الاستلام")); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeFn = useServerFn(completePurchaseOrder);
  const completeMut = useMutation({
    mutationFn: (id: string) => completeFn({ data: { id } }),
    onSuccess: () => { toast.success(tr("تم الإكمال — أُنشئت فاتورة مورد وحُدِّث المخزون")); setConfirmComplete(null); invalidate(); },
    onError: (e: Error) => { toast.error(e.message); setConfirmComplete(null); },
  });

  const cancelFn = useServerFn(cancelPurchaseOrder);
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => { toast.success(tr("تم الإلغاء")); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const brands = brandsQ.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const summary = summaryQ.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{tr("أوامر الشراء")}</h2>
          <p className="text-muted-foreground text-sm mt-1">{tr("من الطلب للمورد لحد استلام البضاعة — مختلف عن فواتير المشتريات المحاسبية.")}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2"><Plus className="w-4 h-4" /> {tr("أمر شراء جديد")}</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><div className="text-muted-foreground text-sm">{tr("الإجمالي")}</div><div className="text-2xl font-bold tabular-nums">{nf(summary?.total ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-muted-foreground text-sm">{tr("مسودة")}</div><div className="text-2xl font-bold tabular-nums">{nf(summary?.draft ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-muted-foreground text-sm">{tr("قيد الاستلام")}</div><div className="text-2xl font-bold tabular-nums">{nf(summary?.awaiting_delivery ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-muted-foreground text-sm">{tr("مكتمل")}</div><div className="text-2xl font-bold tabular-nums">{nf(summary?.completed ?? 0)}</div></Card>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">{tr("الحالة")}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-40 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("الكل")}</SelectItem>
              <SelectItem value="draft">{tr("مسودة")}</SelectItem>
              <SelectItem value="awaiting_delivery">{tr("قيد الاستلام")}</SelectItem>
              <SelectItem value="completed">{tr("مكتمل")}</SelectItem>
              <SelectItem value="cancelled">{tr("ملغي")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{tr("المورد")}</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="w-48 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("كل الموردين")}</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">{tr("من تاريخ")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" /></div>
        <div><Label className="text-xs">{tr("إلى تاريخ")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" /></div>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-3">{tr("المورد")}</th>
                <th className="p-3">{tr("البراند")}</th>
                <th className="p-3">{tr("الحالة")}</th>
                <th className="p-3 text-left">{tr("الإجمالي")}</th>
                <th className="p-3">{tr("تاريخ الاستلام المتوقع")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(listQ.data ?? []).map((po) => (
                <tr key={po.id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => setEditingId(po.id)}>
                  <td className="p-3 font-medium">{po.supplier_name}</td>
                  <td className="p-3 text-muted-foreground">{po.brand_name}</td>
                  <td className="p-3"><Badge variant={STATUS_VARIANT[po.status]}>{STATUS_LABEL[po.status]}</Badge></td>
                  <td className="p-3 num text-left font-semibold">{nf(po.total)}</td>
                  <td className="p-3 num text-muted-foreground">{po.expected_delivery_at ?? "—"}</td>
                  <td className="p-3 text-left" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      {po.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => awaitMut.mutate(po.id)} className="gap-1">
                          <Truck className="w-3.5 h-3.5" /> {tr("بدء الاستلام")}
                        </Button>
                      )}
                      {(po.status === "draft" || po.status === "awaiting_delivery") && (
                        <Button size="sm" variant="default" onClick={() => setConfirmComplete(po.id)} className="gap-1">
                          <PackageCheck className="w-3.5 h-3.5" /> {tr("إكمال")}
                        </Button>
                      )}
                      {po.status !== "completed" && po.status !== "cancelled" && (
                        <Button size="sm" variant="ghost" onClick={() => cancelMut.mutate(po.id)}>
                          <XCircle className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(listQ.data ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{tr("لا أوامر شراء مطابقة للفلتر.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("أمر شراء جديد")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{tr("المورد")}</Label>
              <Select value={newSupplier} onValueChange={setNewSupplier}>
                <SelectTrigger><SelectValue placeholder={tr("اختر المورد")} /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{tr("البراند (اختياري)")}</Label>
              <Select value={newBrand} onValueChange={setNewBrand}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>{tr("إلغاء")}</Button>
            <Button onClick={() => createMut.mutate()} disabled={!newSupplier || createMut.isPending}>{tr("إنشاء ومتابعة")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PurchaseOrderDetailDialog id={editingId} onClose={() => setEditingId(null)} onChanged={invalidate} onDelete={(id) => { delMut.mutate(id); setEditingId(null); }} />

      <AlertDialog open={!!confirmComplete} onOpenChange={(o) => !o && setConfirmComplete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("إكمال أمر الشراء؟")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("هيتم إنشاء فاتورة مورد جديدة وزيادة رصيد المخزون بكميات البنود فورًا. الإجراء ده لا رجعة فيه.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmComplete && completeMut.mutate(confirmComplete)}>{tr("تأكيد الإكمال")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PurchaseOrderDetailDialog({ id, onClose, onChanged, onDelete }: { id: string | null; onClose: () => void; onChanged: () => void; onDelete: (id: string) => void }) {
  const detailFn = useServerFn(getPurchaseOrder);
  const detailQ = useQuery({ queryKey: ["purchase-orders", "detail", id], queryFn: () => detailFn({ data: { id: id! } }), enabled: !!id });

  const productsQ = useQuery({ queryKey: ["products"], queryFn: useServerFn(listProducts) });
  const materialsQ = useQuery({ queryKey: ["materials"], queryFn: useServerFn(listMaterials) });

  const [kind, setKind] = useState<"product" | "material">("product");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);

  const addFn = useServerFn(upsertPurchaseOrderItem);
  const addMut = useMutation({
    mutationFn: () => addFn({ data: {
      purchase_order_id: id!,
      product_id: kind === "product" ? itemId : null,
      material_id: kind === "material" ? itemId : null,
      qty, unit_cost: unitCost,
    } }),
    onSuccess: () => { setItemId(""); setQty(1); setUnitCost(0); detailQ.refetch(); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delItemFn = useServerFn(deletePurchaseOrderItem);
  const delItemMut = useMutation({
    mutationFn: (itemDbId: string) => delItemFn({ data: { id: itemDbId } }),
    onSuccess: () => { detailQ.refetch(); onChanged(); },
  });

  const po = detailQ.data;
  const locked = po && po.status !== "draft" && po.status !== "awaiting_delivery";
  const candidates = kind === "product" ? (productsQ.data ?? []) : (materialsQ.data ?? []);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{po ? `أمر شراء — ${po.supplier_name}` : "أمر شراء"}</DialogTitle></DialogHeader>
        {po && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{tr("البراند:")} {po.brand_name}</span>
              <span>·</span>
              <span>{tr("الحالة:")} <Badge variant={STATUS_VARIANT[po.status]}>{STATUS_LABEL[po.status]}</Badge></span>
            </div>

            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-2">{tr("الصنف")}</th><th className="p-2 text-left">{tr("الكمية")}</th><th className="p-2 text-left">{tr("تكلفة الوحدة")}</th><th className="p-2 text-left">{tr("الإجمالي")}</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {po.items.map((it) => (
                  <tr key={it.id} className="border-b border-border/50">
                    <td className="p-2">{it.item_name}</td>
                    <td className="p-2 num text-left">{nf(it.qty)}</td>
                    <td className="p-2 num text-left">{nf(it.unit_cost)}</td>
                    <td className="p-2 num text-left">{nf(it.qty * it.unit_cost)}</td>
                    <td className="p-2 text-left">
                      {!locked && <Button size="icon" variant="ghost" onClick={() => delItemMut.mutate(it.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                    </td>
                  </tr>
                ))}
                {po.items.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">{tr("لا بنود بعد.")}</td></tr>}
              </tbody>
              <tfoot>
                <tr className="font-semibold"><td className="p-2" colSpan={3}>{tr("الإجمالي")}</td><td className="p-2 num text-left" colSpan={2}>{nf(po.total)}</td></tr>
              </tfoot>
            </table>

            {!locked && (
              <div className="grid grid-cols-[100px_1fr_100px_100px_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">{tr("النوع")}</Label>
                  <Select value={kind} onValueChange={(v) => { setKind(v as typeof kind); setItemId(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="product">{tr("منتج")}</SelectItem><SelectItem value="material">{tr("خامة")}</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{tr("الصنف")}</Label>
                  <Select value={itemId} onValueChange={setItemId}>
                    <SelectTrigger><SelectValue placeholder={tr("اختر")} /></SelectTrigger>
                    <SelectContent>{candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">{tr("الكمية")}</Label><Input type="number" value={qty} onChange={(e) => setQty(parseFloat(e.target.value) || 0)} /></div>
                <div><Label className="text-xs">{tr("تكلفة الوحدة")}</Label><Input type="number" value={unitCost} onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)} /></div>
                <Button onClick={() => addMut.mutate()} disabled={!itemId || qty <= 0}>{tr("إضافة")}</Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {po && po.status === "draft" && (
            <Button variant="ghost" className="text-destructive" onClick={() => onDelete(po.id)}>{tr("حذف الأمر")}</Button>
          )}
          <Button variant="ghost" onClick={onClose}>{tr("إغلاق")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
