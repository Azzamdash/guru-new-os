import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, PackageCheck, Truck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { listBrands, listProducts, listMaterials, listSuppliers } from "@/lib/internal.functions";
import {
  listPurchaseOrders,
  getPurchaseOrder,
  getPurchaseOrdersSummary,
  upsertPurchaseOrder,
  deletePurchaseOrder,
  upsertPurchaseOrderItem,
  deletePurchaseOrderItem,
  markAwaitingDelivery,
  completePurchaseOrder,
  cancelPurchaseOrder,
  type PurchaseOrderStatus,
} from "@/lib/purchase-orders.functions";

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const STATUS_LABEL_AR: Record<PurchaseOrderStatus, string> = {
  draft: "مسودة",
  awaiting_delivery: "قيد الاستلام",
  completed: "مكتمل",
  cancelled: "ملغي",
};
const STATUS_LABEL_EN: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  awaiting_delivery: "Awaiting Delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};
const statusLabel = (status: PurchaseOrderStatus, lang: "ar" | "en") =>
  (lang === "ar" ? STATUS_LABEL_AR : STATUS_LABEL_EN)[status];
const STATUS_VARIANT: Record<
  PurchaseOrderStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  awaiting_delivery: "secondary",
  completed: "default",
  cancelled: "destructive",
};

export function PurchaseOrdersTab() {
  const { lang } = useLang();
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

  const summaryQ = useQuery({
    queryKey: ["purchase-orders", "summary"],
    queryFn: useServerFn(getPurchaseOrdersSummary),
  });

  const listFn = useServerFn(listPurchaseOrders);
  const listQ = useQuery({
    queryKey: ["purchase-orders", "list", status, supplierId, from, to],
    queryFn: () =>
      listFn({
        data: {
          status: status === "all" ? null : status,
          supplierId: supplierId === "all" ? null : supplierId,
          from: from || null,
          to: to || null,
        },
      }),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
  const [newSupplier, setNewSupplier] = useState("");
  const [newBrand, setNewBrand] = useState("");

  const upsertFn = useServerFn(upsertPurchaseOrder);
  const createMut = useMutation({
    mutationFn: () => upsertFn({ data: { supplier_id: newSupplier, brand_id: newBrand || null } }),
    onSuccess: (r) => {
      setCreateOpen(false);
      setNewSupplier("");
      setNewBrand("");
      invalidate();
      setEditingId(r.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delFn = useServerFn(deletePurchaseOrder);
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم الحذف" : "Deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const awaitFn = useServerFn(markAwaitingDelivery);
  const awaitMut = useMutation({
    mutationFn: (id: string) => awaitFn({ data: { id } }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم التحويل لقيد الاستلام" : "Moved to awaiting delivery");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const completeFn = useServerFn(completePurchaseOrder);
  const completeMut = useMutation({
    mutationFn: (id: string) => completeFn({ data: { id } }),
    onSuccess: () => {
      toast.success(
        lang === "ar"
          ? "تم الإكمال — أُنشئت فاتورة مورد وحُدِّث المخزون"
          : "Completed — a supplier invoice was created and stock was updated",
      );
      setConfirmComplete(null);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirmComplete(null);
    },
  });

  const cancelFn = useServerFn(cancelPurchaseOrder);
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم الإلغاء" : "Cancelled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const brands = brandsQ.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const summary = summaryQ.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">
            {lang === "ar" ? "أوامر الشراء" : "Purchase Orders"}
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "ar"
              ? "من الطلب للمورد لحد استلام البضاعة — مختلف عن فواتير المشتريات المحاسبية."
              : "From ordering the supplier to receiving the goods — distinct from accounting purchase invoices."}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> {lang === "ar" ? "أمر شراء جديد" : "New Purchase Order"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-muted-foreground text-sm">
            {lang === "ar" ? "الإجمالي" : "Total"}
          </div>
          <div className="text-2xl font-bold tabular-nums">{nf(summary?.total ?? 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-sm">{lang === "ar" ? "مسودة" : "Draft"}</div>
          <div className="text-2xl font-bold tabular-nums">{nf(summary?.draft ?? 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-sm">
            {lang === "ar" ? "قيد الاستلام" : "Awaiting Delivery"}
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {nf(summary?.awaiting_delivery ?? 0)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-sm">
            {lang === "ar" ? "مكتمل" : "Completed"}
          </div>
          <div className="text-2xl font-bold tabular-nums">{nf(summary?.completed ?? 0)}</div>
        </Card>
      </div>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">{lang === "ar" ? "الحالة" : "Status"}</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="w-40 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "الكل" : "All"}</SelectItem>
              <SelectItem value="draft">{lang === "ar" ? "مسودة" : "Draft"}</SelectItem>
              <SelectItem value="awaiting_delivery">
                {lang === "ar" ? "قيد الاستلام" : "Awaiting Delivery"}
              </SelectItem>
              <SelectItem value="completed">{lang === "ar" ? "مكتمل" : "Completed"}</SelectItem>
              <SelectItem value="cancelled">{lang === "ar" ? "ملغي" : "Cancelled"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{lang === "ar" ? "المورد" : "Supplier"}</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="w-48 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل الموردين" : "All Suppliers"}</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{lang === "ar" ? "من تاريخ" : "From Date"}</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">{lang === "ar" ? "إلى تاريخ" : "To Date"}</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
        </div>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-3">{lang === "ar" ? "المورد" : "Supplier"}</th>
                <th className="p-3">{lang === "ar" ? "البراند" : "Brand"}</th>
                <th className="p-3">{lang === "ar" ? "الحالة" : "Status"}</th>
                <th className="p-3 text-left">{lang === "ar" ? "الإجمالي" : "Total"}</th>
                <th className="p-3">
                  {lang === "ar" ? "تاريخ الاستلام المتوقع" : "Expected Delivery Date"}
                </th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(listQ.data ?? []).map((po) => (
                <tr
                  key={po.id}
                  className="border-b border-border/50 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setEditingId(po.id)}
                >
                  <td className="p-3 font-medium">{po.supplier_name}</td>
                  <td className="p-3 text-muted-foreground">{po.brand_name}</td>
                  <td className="p-3">
                    <Badge variant={STATUS_VARIANT[po.status]}>
                      {statusLabel(po.status, lang)}
                    </Badge>
                  </td>
                  <td className="p-3 num text-left font-semibold">{nf(po.total)}</td>
                  <td className="p-3 num text-muted-foreground">
                    {po.expected_delivery_at ?? "—"}
                  </td>
                  <td className="p-3 text-left" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      {po.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => awaitMut.mutate(po.id)}
                          className="gap-1"
                        >
                          <Truck className="w-3.5 h-3.5" />{" "}
                          {lang === "ar" ? "بدء الاستلام" : "Start Receiving"}
                        </Button>
                      )}
                      {(po.status === "draft" || po.status === "awaiting_delivery") && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setConfirmComplete(po.id)}
                          className="gap-1"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />{" "}
                          {lang === "ar" ? "إكمال" : "Complete"}
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
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    {lang === "ar"
                      ? "لا أوامر شراء مطابقة للفلتر."
                      : "No purchase orders match the filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "أمر شراء جديد" : "New Purchase Order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{lang === "ar" ? "المورد" : "Supplier"}</Label>
              <Select value={newSupplier} onValueChange={setNewSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder={lang === "ar" ? "اختر المورد" : "Select supplier"} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{lang === "ar" ? "البراند (اختياري)" : "Brand (optional)"}</Label>
              <Select value={newBrand} onValueChange={setNewBrand}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!newSupplier || createMut.isPending}
            >
              {lang === "ar" ? "إنشاء ومتابعة" : "Create & Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PurchaseOrderDetailDialog
        id={editingId}
        onClose={() => setEditingId(null)}
        onChanged={invalidate}
        onDelete={(id) => {
          delMut.mutate(id);
          setEditingId(null);
        }}
      />

      <AlertDialog open={!!confirmComplete} onOpenChange={(o) => !o && setConfirmComplete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lang === "ar" ? "إكمال أمر الشراء؟" : "Complete this purchase order?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? "هيتم إنشاء فاتورة مورد جديدة وزيادة رصيد المخزون بكميات البنود فورًا. الإجراء ده لا رجعة فيه."
                : "A new supplier invoice will be created and stock balances will be increased by the item quantities immediately. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmComplete && completeMut.mutate(confirmComplete)}
            >
              {lang === "ar" ? "تأكيد الإكمال" : "Confirm Completion"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PurchaseOrderDetailDialog({
  id,
  onClose,
  onChanged,
  onDelete,
}: {
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
  onDelete: (id: string) => void;
}) {
  const { lang } = useLang();
  const detailFn = useServerFn(getPurchaseOrder);
  const detailQ = useQuery({
    queryKey: ["purchase-orders", "detail", id],
    queryFn: () => detailFn({ data: { id: id! } }),
    enabled: !!id,
  });

  const productsQ = useQuery({ queryKey: ["products"], queryFn: useServerFn(listProducts) });
  const materialsQ = useQuery({ queryKey: ["materials"], queryFn: useServerFn(listMaterials) });

  const [kind, setKind] = useState<"product" | "material">("product");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);

  const addFn = useServerFn(upsertPurchaseOrderItem);
  const addMut = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          purchase_order_id: id!,
          product_id: kind === "product" ? itemId : null,
          material_id: kind === "material" ? itemId : null,
          qty,
          unit_cost: unitCost,
        },
      }),
    onSuccess: () => {
      setItemId("");
      setQty(1);
      setUnitCost(0);
      detailQ.refetch();
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delItemFn = useServerFn(deletePurchaseOrderItem);
  const delItemMut = useMutation({
    mutationFn: (itemDbId: string) => delItemFn({ data: { id: itemDbId } }),
    onSuccess: () => {
      detailQ.refetch();
      onChanged();
    },
  });

  const po = detailQ.data;
  const locked = po && po.status !== "draft" && po.status !== "awaiting_delivery";
  const candidates = kind === "product" ? (productsQ.data ?? []) : (materialsQ.data ?? []);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {po
              ? lang === "ar"
                ? `أمر شراء — ${po.supplier_name}`
                : `Purchase Order — ${po.supplier_name}`
              : lang === "ar"
                ? "أمر شراء"
                : "Purchase Order"}
          </DialogTitle>
        </DialogHeader>
        {po && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {lang === "ar" ? "البراند:" : "Brand:"} {po.brand_name}
              </span>
              <span>·</span>
              <span>
                {lang === "ar" ? "الحالة:" : "Status:"}{" "}
                <Badge variant={STATUS_VARIANT[po.status]}>{statusLabel(po.status, lang)}</Badge>
              </span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-right border-b border-border">
                  <th className="p-2">{lang === "ar" ? "الصنف" : "Item"}</th>
                  <th className="p-2 text-left">{lang === "ar" ? "الكمية" : "Qty"}</th>
                  <th className="p-2 text-left">{lang === "ar" ? "تكلفة الوحدة" : "Unit Cost"}</th>
                  <th className="p-2 text-left">{lang === "ar" ? "الإجمالي" : "Total"}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((it) => (
                  <tr key={it.id} className="border-b border-border/50">
                    <td className="p-2">{it.item_name}</td>
                    <td className="p-2 num text-left">{nf(it.qty)}</td>
                    <td className="p-2 num text-left">{nf(it.unit_cost)}</td>
                    <td className="p-2 num text-left">{nf(it.qty * it.unit_cost)}</td>
                    <td className="p-2 text-left">
                      {!locked && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => delItemMut.mutate(it.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {po.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      {lang === "ar" ? "لا بنود بعد." : "No items yet."}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="p-2" colSpan={3}>
                    {lang === "ar" ? "الإجمالي" : "Total"}
                  </td>
                  <td className="p-2 num text-left" colSpan={2}>
                    {nf(po.total)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {!locked && (
              <div className="grid grid-cols-[100px_1fr_100px_100px_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">{lang === "ar" ? "النوع" : "Type"}</Label>
                  <Select
                    value={kind}
                    onValueChange={(v) => {
                      setKind(v as typeof kind);
                      setItemId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">{lang === "ar" ? "منتج" : "Product"}</SelectItem>
                      <SelectItem value="material">
                        {lang === "ar" ? "خامة" : "Material"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{lang === "ar" ? "الصنف" : "Item"}</Label>
                  <Select value={itemId} onValueChange={setItemId}>
                    <SelectTrigger>
                      <SelectValue placeholder={lang === "ar" ? "اختر" : "Select"} />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{lang === "ar" ? "الكمية" : "Qty"}</Label>
                  <Input
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label className="text-xs">{lang === "ar" ? "تكلفة الوحدة" : "Unit Cost"}</Label>
                  <Input
                    type="number"
                    value={unitCost}
                    onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <Button onClick={() => addMut.mutate()} disabled={!itemId || qty <= 0}>
                  {lang === "ar" ? "إضافة" : "Add"}
                </Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {po && po.status === "draft" && (
            <Button variant="ghost" className="text-destructive" onClick={() => onDelete(po.id)}>
              {lang === "ar" ? "حذف الأمر" : "Delete Order"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {lang === "ar" ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
