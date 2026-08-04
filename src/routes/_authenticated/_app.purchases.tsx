import { formatBusinessDate } from "@/lib/timezone";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package as PackageIcon } from "lucide-react";
import {
  listInvoices,
  upsertInvoice,
  deleteInvoice,
  listSuppliers,
  listBrands,
  listProducts,
  listMaterials,
  listInvoiceItems,
  upsertInvoiceItem,
  deleteInvoiceItem,
} from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/purchases")({
  head: () => ({
    meta: [
      { title: "فواتير المشتريات — e-GURUS" },
      {
        name: "description",
        content: "إدارة فواتير المشتريات من الموردين مع البنود (منتجات/خامات).",
      },
    ],
  }),
  component: PurchasesPage,
});

type Invoice = {
  id: string;
  supplier_id: string;
  brand_id: string | null;
  amount: number;
  issued_at: string;
  due_at: string | null;
  status: "open" | "paid";
  note: string | null;
  type: "purchase" | "return";
};

function PurchasesPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: useServerFn(getMyRole) });
  const invoicesQ = useQuery({
    queryKey: ["supplier-invoices"],
    queryFn: useServerFn(listInvoices),
  });
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: useServerFn(listSuppliers) });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: useServerFn(listBrands) });

  const upFn = useServerFn(upsertInvoice);
  const delFn = useServerFn(deleteInvoice);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    id?: string;
    supplier_id: string;
    brand_id: string | null;
    issued_at: string;
    due_at: string | null;
    status: "open" | "paid";
    note: string | null;
    type: "purchase" | "return";
  }>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [itemsFor, setItemsFor] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "purchase" | "return">("all");

  const canWrite = !!(roleQ.data?.isAdmin || roleQ.data?.isManager || roleQ.data?.canWrite);

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => upFn({ data: v }),
    onSuccess: () => {
      toast.success(T("تم الحفظ", "Saved"));
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success(T("تم الحذف", "Deleted"));
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      setConfirmDel(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suppliers = suppliersQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const brandName = (id: string | null) =>
    id ? (brands.find((b) => b.id === id)?.name ?? "—") : "—";

  const allRows = (invoicesQ.data ?? []) as Invoice[];
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return formatBusinessDate(d);
  });
  const [dateTo, setDateTo] = useState<string>(getTodayInBusinessTimezone());
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (dateFrom && r.issued_at < dateFrom) return false;
        if (dateTo && r.issued_at > dateTo) return false;
        if (supplierFilter !== "all" && r.supplier_id !== supplierFilter) return false;
        if (typeFilter !== "all" && (r.type ?? "purchase") !== typeFilter) return false;
        return true;
      }),
    [allRows, dateFrom, dateTo, supplierFilter, typeFilter],
  );

  const today = getTodayInBusinessTimezone();

  const report = useMemo(() => {
    // Return invoices are credits: they reduce what we owe/spent, not add to it.
    const signed = (r: Invoice) => (r.type === "return" ? -1 : 1) * Number(r.amount || 0);
    const total = rows.reduce((a, r) => a + signed(r), 0);
    const paid = rows.filter((r) => r.status === "paid").reduce((a, r) => a + signed(r), 0);
    const open = rows.filter((r) => r.status !== "paid").reduce((a, r) => a + signed(r), 0);
    const overdue = rows.filter((r) => r.status !== "paid" && r.due_at && r.due_at < today);
    const overdueTotal = overdue.reduce((a, r) => a + signed(r), 0);
    const bySupplier: Record<string, { total: number; open: number }> = {};
    for (const r of rows) {
      bySupplier[r.supplier_id] = bySupplier[r.supplier_id] || { total: 0, open: 0 };
      bySupplier[r.supplier_id].total += signed(r);
      if (r.status !== "paid") bySupplier[r.supplier_id].open += signed(r);
    }
    const topSuppliers = Object.entries(bySupplier)
      .map(([id, v]) => ({ id, name: supplierName(id), ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const statusSplit = {
      open: rows.filter((r) => r.status === "open").length,
      paid: rows.filter((r) => r.status === "paid").length,
    };
    return {
      total,
      paid,
      open,
      overdueCount: overdue.length,
      overdueTotal,
      topSuppliers,
      statusSplit,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, suppliers]);
  const nf = (n: number) => Number(n || 0).toLocaleString("en-US");

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{T("فواتير المشتريات", "Purchase Invoices")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "فواتير من الموردين بمنتجات أو خامات؛ إجمالي الفاتورة يُحسب من البنود.",
              "Invoices from suppliers for products or materials; the invoice total is calculated from its line items.",
            )}
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setEditing({
                supplier_id: suppliers[0]?.id ?? "",
                brand_id: null,
                issued_at: getTodayInBusinessTimezone(),
                due_at: null,
                status: "open",
                note: "",
                type: "purchase",
              });
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4 me-2" /> {T("فاتورة جديدة", "New invoice")}
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <Label>{T("من", "From")}</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Label>{T("إلى", "To")}</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div>
            <Label>{T("المورد", "Supplier")}</Label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{T("كل الموردين", "All suppliers")}</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{T("النوع", "Type")}</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{T("الكل", "All")}</SelectItem>
                <SelectItem value="purchase">{T("شراء", "Purchase")}</SelectItem>
                <SelectItem value="return">{T("مرتجع لمورد", "Supplier return")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="card-gradient p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{T("تقرير المشتريات", "Purchases report")}</h3>
          <span className="text-xs text-muted-foreground">
            {T(`${rows.length} فاتورة`, `${rows.length} invoices`)}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label={T("إجمالي المشتريات", "Total purchases")} value={nf(report.total)} />
          <MiniStat
            label={T("مدفوعة", "Paid")}
            value={nf(report.paid)}
            sub={T(`${report.statusSplit.paid} فاتورة`, `${report.statusSplit.paid} invoices`)}
            tone="success"
          />
          <MiniStat
            label={T("آجل", "Outstanding")}
            value={nf(report.open)}
            sub={T(`${report.statusSplit.open} فاتورة`, `${report.statusSplit.open} invoices`)}
          />
          <MiniStat
            label={T("متأخرة", "Overdue")}
            value={nf(report.overdueTotal)}
            sub={T(`${report.overdueCount} فاتورة`, `${report.overdueCount} invoices`)}
            tone={report.overdueCount > 0 ? "danger" : undefined}
          />
        </div>
        {report.topSuppliers.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-muted-foreground mb-2">
              {T("أعلى 5 موردين", "Top 5 suppliers")}
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-right border-b border-border">
                  <th className="p-1.5">{T("المورد", "Supplier")}</th>
                  <th className="p-1.5 text-left">{T("الإجمالي", "Total")}</th>
                  <th className="p-1.5 text-left">{T("المفتوح", "Open")}</th>
                </tr>
              </thead>
              <tbody>
                {report.topSuppliers.map((s) => (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="p-1.5 font-medium">{s.name}</td>
                    <td className="p-1.5 num text-left">{nf(s.total)}</td>
                    <td className="p-1.5 num text-left">
                      {s.open > 0 ? (
                        <Badge variant="secondary">{nf(s.open)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-muted-foreground">
                <th className="p-3">{T("التاريخ", "Date")}</th>
                <th className="p-3">{T("المورد", "Supplier")}</th>
                <th className="p-3">{T("البراند", "Brand")}</th>
                <th className="p-3">{T("النوع", "Type")}</th>
                <th className="p-3 text-left">{T("الإجمالي", "Total")}</th>
                <th className="p-3">{T("الاستحقاق", "Due date")}</th>
                <th className="p-3">{T("الحالة", "Status")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-3 num" dir="ltr">
                    {r.issued_at}
                  </td>
                  <td className="p-3 font-medium">{supplierName(r.supplier_id)}</td>
                  <td className="p-3 text-muted-foreground">{brandName(r.brand_id)}</td>
                  <td className="p-3">
                    {r.type === "return" ? (
                      <Badge variant="secondary">{T("مرتجع لمورد", "Supplier return")}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">{T("شراء", "Purchase")}</span>
                    )}
                  </td>
                  <td className="p-3 num text-left">{Number(r.amount).toLocaleString("en-US")}</td>
                  <td className="p-3 num text-muted-foreground" dir="ltr">
                    {r.due_at ?? "—"}
                  </td>
                  <td className="p-3">
                    {r.status === "paid" ? (
                      <Badge>{T("مدفوعة", "Paid")}</Badge>
                    ) : (
                      <Badge variant="outline">{T("آجل", "Outstanding")}</Badge>
                    )}
                  </td>
                  <td className="p-3 flex gap-1 justify-end">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setItemsFor(r.id)}
                      title={T("البنود", "Line items")}
                    >
                      <PackageIcon className="w-4 h-4" />
                    </Button>
                    {canWrite && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditing({
                              id: r.id,
                              supplier_id: r.supplier_id,
                              brand_id: r.brand_id,
                              issued_at: r.issued_at,
                              due_at: r.due_at,
                              status: r.status,
                              note: r.note,
                              type: r.type,
                            });
                            setOpen(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setConfirmDel(r.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    {T("لا فواتير.", "No invoices.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? T("تعديل فاتورة", "Edit invoice") : T("فاتورة جديدة", "New invoice")}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>{T("المورد", "Supplier")}</Label>
                <Select
                  value={editing.supplier_id}
                  onValueChange={(v) => setEditing({ ...editing, supplier_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={T("اختر", "Select")} />
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
                <Label>{T("النوع", "Type")}</Label>
                <Select
                  value={editing.type}
                  onValueChange={(v) => setEditing({ ...editing, type: v as "purchase" | "return" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">{T("فاتورة شراء", "Purchase invoice")}</SelectItem>
                    <SelectItem value="return">{T("مرتجع لمورد", "Supplier return")}</SelectItem>
                  </SelectContent>
                </Select>
                {editing.type === "return" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {T(
                      "البنود اللي هتضيفها هتتخصم من المخزون بدل ما تتضاف، وهتتحسب كخصم من مستحقات المورد.",
                      "Line items you add will decrement stock instead of adding to it, and count as a credit against what's owed to the supplier.",
                    )}
                  </p>
                )}
              </div>
              <div>
                <Label>{T("البراند (اختياري)", "Brand (optional)")}</Label>
                <Select
                  value={editing.brand_id ?? "__none"}
                  onValueChange={(v) =>
                    setEditing({ ...editing, brand_id: v === "__none" ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">{T("— بدون —", "— None —")}</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{T("تاريخ الفاتورة", "Invoice date")}</Label>
                  <Input
                    type="date"
                    value={editing.issued_at}
                    onChange={(e) => setEditing({ ...editing, issued_at: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{T("تاريخ الاستحقاق", "Due date")}</Label>
                  <Input
                    type="date"
                    value={editing.due_at ?? ""}
                    onChange={(e) => setEditing({ ...editing, due_at: e.target.value || null })}
                  />
                </div>
              </div>
              <div>
                <Label>{T("الحالة", "Status")}</Label>
                <Select
                  value={editing.status}
                  onValueChange={(v) => setEditing({ ...editing, status: v as "open" | "paid" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">{T("آجل", "Outstanding")}</SelectItem>
                    <SelectItem value="paid">{T("مدفوعة", "Paid")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{T("ملاحظات", "Notes")}</Label>
                <Input
                  value={editing.note ?? ""}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {T(
                  "الإجمالي يُحسب تلقائياً من البنود بعد الحفظ.",
                  "The total is calculated automatically from the line items after saving.",
                )}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {T("إلغاء", "Cancel")}
            </Button>
            <Button
              onClick={() => editing && save.mutate(editing)}
              disabled={save.isPending || !editing?.supplier_id || !editing?.issued_at}
            >
              {T("حفظ", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{T("تأكيد الحذف", "Confirm deletion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {T(
                "هل تريد حذف الفاتورة وكل بنودها؟ لا يمكن التراجع.",
                "Do you want to delete this invoice and all its line items? This cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{T("إلغاء", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDel && remove.mutate(confirmDel)}>
              {T("حذف", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ItemsDialog invoiceId={itemsFor} onClose={() => setItemsFor(null)} canWrite={canWrite} />
    </div>
  );
}

function ItemsDialog({
  invoiceId,
  onClose,
  canWrite,
}: {
  invoiceId: string | null;
  onClose: () => void;
  canWrite: boolean;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const listFn = useServerFn(listInvoiceItems);
  const upFn = useServerFn(upsertInvoiceItem);
  const delFn = useServerFn(deleteInvoiceItem);
  const productsQ = useQuery({ queryKey: ["products"], queryFn: useServerFn(listProducts) });
  const materialsQ = useQuery({ queryKey: ["materials"], queryFn: useServerFn(listMaterials) });
  const itemsQ = useQuery({
    queryKey: ["invoice-items", invoiceId],
    queryFn: () => listFn({ data: { invoice_id: invoiceId! } }),
    enabled: !!invoiceId,
  });

  const [kind, setKind] = useState<"product" | "material" | "other">("product");
  const [refId, setRefId] = useState("");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const products = productsQ.data ?? [];
  const materials = materialsQ.data ?? [];

  const add = useMutation({
    mutationFn: () =>
      upFn({
        data: {
          invoice_id: invoiceId!,
          kind,
          product_id: kind === "product" ? refId : null,
          material_id: kind === "material" ? refId : null,
          description: kind === "other" ? desc : null,
          qty,
          unit_cost: unitCost,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-items", invoiceId] });
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      setRefId("");
      setDesc("");
      setQty(1);
      setUnitCost(0);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, invoice_id: invoiceId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-items", invoiceId] });
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      setConfirmDel(null);
    },
  });

  const rows = itemsQ.data ?? [];
  const total = useMemo(() => rows.reduce((a, r) => a + Number(r.subtotal || 0), 0), [rows]);
  const labelFor = (r: {
    kind: string;
    product_id: string | null;
    material_id: string | null;
    description: string | null;
  }) => {
    if (r.kind === "product")
      return (
        products.find((p) => p.id === r.product_id)?.name ?? T("منتج محذوف", "Deleted product")
      );
    if (r.kind === "material")
      return (
        materials.find((m) => m.id === r.material_id)?.name ?? T("خامة محذوفة", "Deleted material")
      );
    return r.description ?? "—";
  };

  const validAdd = kind === "other" ? !!desc.trim() : !!refId;

  return (
    <Dialog open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{T("بنود الفاتورة", "Invoice line items")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {canWrite && (
            <div className="grid grid-cols-[120px_1fr_100px_120px_auto] gap-2 items-end">
              <div>
                <Label>{T("النوع", "Type")}</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => {
                    setKind(v as "product" | "material" | "other");
                    setRefId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">{T("منتج", "Product")}</SelectItem>
                    <SelectItem value="material">{T("خامة", "Material")}</SelectItem>
                    <SelectItem value="other">{T("أخرى", "Other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{kind === "other" ? T("وصف", "Description") : T("اختر", "Select")}</Label>
                {kind === "other" ? (
                  <Input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder={T("وصف البند", "Item description")}
                  />
                ) : (
                  <Select value={refId} onValueChange={setRefId}>
                    <SelectTrigger>
                      <SelectValue placeholder={T("اختر", "Select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(kind === "product" ? products : materials).map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>{T("الكمية", "Quantity")}</Label>
                <Input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>{T("سعر الوحدة", "Unit price")}</Label>
                <Input
                  type="number"
                  value={unitCost}
                  onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                />
              </div>
              <Button onClick={() => add.mutate()} disabled={!validAdd || qty <= 0}>
                {T("إضافة", "Add")}
              </Button>
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-2">{T("النوع", "Type")}</th>
                <th className="p-2">{T("البند", "Item")}</th>
                <th className="p-2 text-left">{T("الكمية", "Quantity")}</th>
                <th className="p-2 text-left">{T("سعر الوحدة", "Unit price")}</th>
                <th className="p-2 text-left">{T("الإجمالي", "Total")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-2 text-muted-foreground">
                    {r.kind === "product"
                      ? T("منتج", "Product")
                      : r.kind === "material"
                        ? T("خامة", "Material")
                        : T("أخرى", "Other")}
                  </td>
                  <td className="p-2 font-medium">{labelFor(r)}</td>
                  <td className="p-2 num text-left">{Number(r.qty).toLocaleString("en-US")}</td>
                  <td className="p-2 num text-left">
                    {Number(r.unit_cost).toLocaleString("en-US")}
                  </td>
                  <td className="p-2 num text-left">
                    {Number(r.subtotal).toLocaleString("en-US")}
                  </td>
                  <td className="p-2 text-left">
                    {canWrite && (
                      <Button size="icon" variant="ghost" onClick={() => setConfirmDel(r.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-muted-foreground">
                    {T("لا بنود.", "No line items.")}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="p-2" colSpan={4}>
                  {T("الإجمالي", "Total")}
                </td>
                <td className="p-2 num text-left" colSpan={2}>
                  {total.toLocaleString("en-US")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{T("تأكيد الحذف", "Confirm deletion")}</AlertDialogTitle>
              <AlertDialogDescription>
                {T("هل تريد حذف هذا البند؟", "Do you want to delete this line item?")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{T("إلغاء", "Cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmDel && remove.mutate(confirmDel)}>
                {T("حذف", "Delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "danger";
}) {
  const color =
    tone === "success" ? "text-emerald-500" : tone === "danger" ? "text-destructive" : "";
  return (
    <div className="rounded border border-border/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold num mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
