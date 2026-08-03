import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listSuppliers,
  upsertSupplier,
  deleteSupplier,
  listBrands,
  listInvoices,
  listPayments,
  upsertInvoice,
  deleteInvoice,
  upsertPayment,
  deletePayment,
} from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, AlertTriangle, X } from "lucide-react";
import { SupplierDebtAnalytics } from "@/components/SupplierDebtAnalytics";
import { useLang } from "@/lib/i18n";

export function SuppliersTab() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: useServerFn(getMyRole) });
  const roles = roleQ.data?.roles ?? [];
  const isAdmin = roles.some((r: string) =>
    ["admin", "manager", "data_entry", "accountant"].includes(r),
  );

  const supsQ = useQuery({ queryKey: ["suppliers"], queryFn: useServerFn(listSuppliers) });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: useServerFn(listBrands) });
  const invsQ = useQuery({ queryKey: ["invoices"], queryFn: useServerFn(listInvoices) });
  const paysQ = useQuery({ queryKey: ["payments"], queryFn: useServerFn(listPayments) });

  const upsertSupFn = useServerFn(upsertSupplier);
  const delSupFn = useServerFn(deleteSupplier);
  const upsertInvFn = useServerFn(upsertInvoice);
  const delInvFn = useServerFn(deleteInvoice);
  const upsertPayFn = useServerFn(upsertPayment);
  const delPayFn = useServerFn(deletePayment);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
  };

  const today = getTodayInBusinessTimezone();
  const [asOfDate, setAsOfDate] = useState<string>(today);
  const paidByInv = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of paysQ.data ?? []) {
      if (p.paid_at && p.paid_at > asOfDate) continue;
      if (p.invoice_id) m.set(p.invoice_id, (m.get(p.invoice_id) ?? 0) + Number(p.amount));
    }
    return m;
  }, [paysQ.data, asOfDate]);
  const paidStandaloneBySup = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of paysQ.data ?? []) {
      if (p.paid_at && p.paid_at > asOfDate) continue;
      if (!p.invoice_id && p.supplier_id)
        m.set(p.supplier_id, (m.get(p.supplier_id) ?? 0) + Number(p.amount));
    }
    return m;
  }, [paysQ.data, asOfDate]);

  const supplierRows = useMemo(() => {
    return (supsQ.data ?? []).map((s) => {
      const invs = (invsQ.data ?? []).filter(
        (i) => i.supplier_id === s.id && i.issued_at <= asOfDate,
      );
      const opening = Number((s as { opening_balance?: number }).opening_balance ?? 0);
      const standalone = paidStandaloneBySup.get(s.id) ?? 0;
      let outstanding = opening - standalone,
        overdue = 0;
      for (const inv of invs) {
        const remaining = Math.max(0, Number(inv.amount) - (paidByInv.get(inv.id) ?? 0));
        outstanding += remaining;
        if (remaining > 0 && inv.due_at && inv.due_at < asOfDate && inv.status !== "paid")
          overdue += remaining;
      }
      return { ...s, invoiceCount: invs.length, outstanding, overdue, opening_balance: opening };
    });
  }, [supsQ.data, invsQ.data, paidByInv, paidStandaloneBySup, asOfDate]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");

  const brandNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brandsQ.data ?? []) m.set(b.id, b.name);
    return m;
  }, [brandsQ.data]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return supplierRows;
    return supplierRows.filter((s) => {
      if (s.name.toLowerCase().includes(q)) return true;
      const ids = (
        s.brand_ids && s.brand_ids.length > 0 ? s.brand_ids : [s.brand_id].filter(Boolean)
      ) as string[];
      return ids.some((id) => (brandNameById.get(id) ?? "").toLowerCase().includes(q));
    });
  }, [supplierRows, search, brandNameById]);

  const productBrands = (brandsQ.data ?? []).filter((b) =>
    ["product", "service", "offline_branch"].includes(b.type),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{T("الموردين والمديونيات", "Suppliers & Debts")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "إدارة الموردين والفواتير المستحقة والمدفوعات مع تحليلات المديونيات.",
              "Manage suppliers, outstanding invoices, and payments with debt analytics.",
            )}
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <Label className="text-xs">{T("تاريخ العرض", "As-of date")}</Label>
            <Input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="mt-1 w-40"
            />
          </div>
          <div>
            <Label className="text-xs">
              {T("بحث باسم المورد أو البراند", "Search by supplier or brand name")}
            </Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={T("اكتب اسم مورد أو براند...", "Type a supplier or brand name...")}
              className="mt-1 w-64"
            />
          </div>
          {isAdmin && (
            <SupplierDialog onSaved={invalidateAll} save={upsertSupFn} brands={productBrands} />
          )}
        </div>
      </div>

      <SupplierDebtAnalytics supplierIds={filteredRows.map((s) => s.id)} asOfDate={asOfDate} />

      <Card className="card-gradient overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-right border-b border-border">
              <th className="p-3">{T("المورد", "Supplier")}</th>
              <th className="p-3">{T("التواصل", "Contact")}</th>
              <th className="p-3 text-left">{T("فواتير", "Invoices")}</th>
              <th className="p-3 text-left">{T("الرصيد المستحق", "Outstanding balance")}</th>
              <th className="p-3 text-left">{T("متأخر", "Overdue")}</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((s) => (
              <tr
                key={s.id}
                className={`border-b border-border/50 cursor-pointer hover:bg-muted/30 ${selectedId === s.id ? "bg-muted/40" : ""}`}
                onClick={() => setSelectedId(s.id)}
              >
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 text-muted-foreground">{s.contact ?? "—"}</td>
                <td className="p-3 num text-left">{s.invoiceCount}</td>
                <td className="p-3 num text-left font-semibold">
                  {s.outstanding.toLocaleString("en-US")}
                </td>
                <td className="p-3 text-left">
                  {s.overdue > 0 ? (
                    <Badge variant="destructive">{s.overdue.toLocaleString("en-US")}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3 text-left">
                  {isAdmin && (
                    <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                      <SupplierDialog
                        save={upsertSupFn}
                        brands={productBrands}
                        onSaved={invalidateAll}
                        supplier={s}
                        trigger={
                          <Button size="sm" variant="secondary">
                            {T("تعديل", "Edit")}
                          </Button>
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            confirm(
                              T(
                                "حذف المورد وكل فواتيره؟",
                                "Delete the supplier and all their invoices?",
                              ),
                            )
                          )
                            delSupFn({ data: { id: s.id } }).then(invalidateAll);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  {supplierRows.length === 0
                    ? T(
                        "لا موردين. أضف مورد للبدء.",
                        "No suppliers. Add a supplier to get started.",
                      )
                    : T("لا نتائج مطابقة للفلتر.", "No results match the filter.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {selectedId && (
        <SupplierDetail
          supplierId={selectedId}
          isAdmin={isAdmin}
          brands={(brandsQ.data ?? []).filter((b) =>
            ["product", "service", "offline_branch"].includes(b.type),
          )}
          invoices={(invsQ.data ?? []).filter((i) => i.supplier_id === selectedId)}
          payments={paysQ.data ?? []}
          paidByInv={paidByInv}
          today={today}
          onChanged={invalidateAll}
          upsertInv={upsertInvFn}
          delInv={delInvFn}
          upsertPay={upsertPayFn}
          delPay={delPayFn}
        />
      )}
    </div>
  );
}

function SupplierDialog({
  save,
  onSaved,
  brands,
  supplier,
  trigger,
}: {
  save: ReturnType<typeof useServerFn>;
  onSaved: () => void;
  brands: BrandRow[];
  supplier?: {
    id: string;
    name: string;
    contact: string | null;
    notes: string | null;
    active: boolean;
    brand_id: string | null;
    brand_ids?: string[];
    opening_balance?: number;
  };
  trigger?: React.ReactNode;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const isEdit = !!supplier;
  const [open, setOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const initialBrands =
    supplier?.brand_ids && supplier.brand_ids.length > 0
      ? supplier.brand_ids
      : supplier?.brand_id
        ? [supplier.brand_id]
        : [];
  const [form, setForm] = useState({
    name: supplier?.name ?? "",
    contact: supplier?.contact ?? "",
    notes: supplier?.notes ?? "",
    brand_ids: initialBrands as string[],
    active: supplier?.active ?? true,
    opening_balance: Number(supplier?.opening_balance ?? 0),
  });

  const toggleBrand = (brandId: string, checked: boolean) => {
    const next = checked
      ? [...form.brand_ids, brandId]
      : form.brand_ids.filter((id) => id !== brandId);
    setForm({ ...form, brand_ids: next });
  };

  const removeBrand = (brandId: string) => {
    setForm({ ...form, brand_ids: form.brand_ids.filter((id) => id !== brandId) });
  };

  const selectedBrands = useMemo(
    () => brands.filter((b) => form.brand_ids.includes(b.id)),
    [brands, form.brand_ids],
  );
  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase();
    return brands.filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [brands, brandSearch]);

  const submit = () => {
    if (!form.name.trim()) return toast.error(T("الاسم مطلوب", "Name is required"));
    save({
      data: {
        ...(isEdit ? { id: supplier!.id } : {}),
        name: form.name,
        contact: form.contact,
        notes: form.notes,
        brand_ids: form.brand_ids,
        brand_id: form.brand_ids[0] ?? null,
        active: form.active,
        opening_balance: Number(form.opening_balance) || 0,
      },
    })
      .then(() => {
        toast.success(isEdit ? T("تم التعديل", "Updated") : T("تم الحفظ", "Saved"));
        setOpen(false);
        if (!isEdit)
          setForm({
            name: "",
            contact: "",
            notes: "",
            brand_ids: [],
            active: true,
            opening_balance: 0,
          });
        onSaved();
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : T("فشل", "Failed")));
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> {T("إضافة مورد", "Add supplier")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? T("تعديل مورد", "Edit supplier") : T("مورد جديد", "New supplier")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{T("الاسم", "Name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">{T("البراندات", "Brands")}</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {selectedBrands.map((b) => (
                <Badge key={b.id} variant="secondary" className="gap-1 pl-1">
                  {b.name}
                  <button
                    type="button"
                    onClick={() => removeBrand(b.id)}
                    className="rounded-full hover:bg-muted p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {selectedBrands.length === 0 && (
                <span className="text-sm text-muted-foreground">
                  {T("لم يتم اختيار براند", "No brand selected")}
                </span>
              )}
            </div>
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1">
                  <Plus className="w-4 h-4" /> {T("إضافة براند", "Add brand")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <Input
                  placeholder={T("بحث...", "Search...")}
                  value={brandSearch}
                  onChange={(e) => setBrandSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {filteredBrands.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-3">
                      {T("لا يوجد براندات", "No brands")}
                    </div>
                  )}
                  {filteredBrands.map((b) => (
                    <label
                      key={b.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={form.brand_ids.includes(b.id)}
                        onCheckedChange={(v) => toggleBrand(b.id, !!v)}
                      />
                      <span>{b.name}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>{T("التواصل", "Contact")}</Label>
            <Input
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
            />
          </div>
          <div>
            <Label>{T("ملاحظات", "Notes")}</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div>
            <Label>
              {T(
                "الرصيد الافتتاحي (موجب = مستحق للمورد، سالب = له عندنا رصيد)",
                "Opening balance (positive = owed to supplier, negative = they owe us)",
              )}
            </Label>
            <Input
              type="number"
              dir="ltr"
              className="text-left"
              value={form.opening_balance}
              onChange={(e) =>
                setForm({ ...form, opening_balance: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <Button onClick={submit} className="w-full">
            {isEdit ? T("حفظ التعديل", "Save changes") : T("حفظ", "Save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type InvoiceRow = {
  id: string;
  supplier_id: string;
  brand_id: string | null;
  amount: number;
  issued_at: string;
  due_at: string | null;
  status: "open" | "paid";
  note: string | null;
};
type PaymentRow = {
  id: string;
  invoice_id: string | null;
  amount: number;
  paid_at: string;
  note: string | null;
};
type BrandRow = {
  id: string;
  name: string;
  slug: string;
  type: "product" | "service" | "offline_branch";
  active: boolean;
  sort_order: number;
};

function SupplierDetail({
  supplierId,
  isAdmin,
  brands,
  invoices,
  payments,
  paidByInv,
  today,
  onChanged,
  upsertInv,
  delInv,
  upsertPay,
  delPay,
}: {
  supplierId: string;
  isAdmin: boolean;
  brands: BrandRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  paidByInv: Map<string, number>;
  today: string;
  onChanged: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertInv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delInv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertPay: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delPay: any;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [invForm, setInvForm] = useState({
    id: "" as string,
    supplier_id: supplierId,
    brand_id: "" as string,
    amount: 0,
    issued_at: today,
    due_at: "",
    status: "open" as "open" | "paid",
    note: "",
  });
  const resetInvForm = () =>
    setInvForm({
      id: "",
      supplier_id: supplierId,
      brand_id: "",
      amount: 0,
      issued_at: today,
      due_at: "",
      status: "open",
      note: "",
    });
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: 0, paid_at: today, note: "" });

  const submitInv = () => {
    if (invForm.amount <= 0) return toast.error(T("المبلغ مطلوب", "Amount is required"));
    upsertInv({
      data: {
        ...(invForm.id ? { id: invForm.id } : {}),
        supplier_id: supplierId,
        brand_id: invForm.brand_id || null,
        amount: invForm.amount,
        issued_at: invForm.issued_at,
        due_at: invForm.due_at || null,
        status: invForm.status,
        note: invForm.note || null,
      },
    })
      .then(() => {
        toast.success(
          invForm.id ? T("تم التعديل", "Updated") : T("أضيفت الفاتورة", "Invoice added"),
        );
        resetInvForm();
        onChanged();
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : T("فشل", "Failed")));
  };

  const submitPay = () => {
    if (!payFor || payForm.amount <= 0) return;
    upsertPay({
      data: {
        invoice_id: payFor,
        amount: payForm.amount,
        paid_at: payForm.paid_at,
        note: payForm.note || null,
      },
    })
      .then(() => {
        toast.success(T("سُجّلت الدفعة", "Payment recorded"));
        setPayFor(null);
        setPayForm({ amount: 0, paid_at: today, note: "" });
        onChanged();
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : T("فشل", "Failed")));
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {isAdmin && (
        <Card className="card-gradient p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {invForm.id ? T("تعديل فاتورة", "Edit invoice") : T("إضافة فاتورة", "Add invoice")}
            </h3>
            {invForm.id && (
              <Button size="sm" variant="ghost" onClick={resetInvForm}>
                {T("إلغاء التعديل", "Cancel edit")}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{T("البراند (اختياري)", "Brand (optional)")}</Label>
              <Select
                value={invForm.brand_id}
                onValueChange={(v) => setInvForm({ ...invForm, brand_id: v })}
              >
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
            <div>
              <Label>{T("المبلغ", "Amount")}</Label>
              <Input
                type="number"
                dir="ltr"
                className="text-left"
                value={invForm.amount}
                onChange={(e) =>
                  setInvForm({ ...invForm, amount: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <Label>{T("تاريخ الإصدار", "Issue date")}</Label>
              <Input
                type="date"
                value={invForm.issued_at}
                onChange={(e) => setInvForm({ ...invForm, issued_at: e.target.value })}
              />
            </div>
            <div>
              <Label>{T("تاريخ الاستحقاق", "Due date")}</Label>
              <Input
                type="date"
                value={invForm.due_at}
                onChange={(e) => setInvForm({ ...invForm, due_at: e.target.value })}
              />
            </div>
            <div>
              <Label>{T("الحالة", "Status")}</Label>
              <Select
                value={invForm.status}
                onValueChange={(v) =>
                  setInvForm({ ...invForm, status: v as typeof invForm.status })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{T("آجل", "Open")}</SelectItem>
                  <SelectItem value="paid">{T("مدفوعة", "Paid")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{T("ملاحظة", "Note")}</Label>
              <Input
                value={invForm.note}
                onChange={(e) => setInvForm({ ...invForm, note: e.target.value })}
              />
            </div>
          </div>
          <Button onClick={submitInv} className="w-full gap-2">
            <Plus className="w-4 h-4" />{" "}
            {invForm.id ? T("حفظ التعديل", "Save changes") : T("حفظ الفاتورة", "Save invoice")}
          </Button>
        </Card>
      )}

      <Card className="card-gradient p-5 space-y-3">
        <h3 className="font-semibold">{T("فواتير المورد", "Supplier invoices")}</h3>
        <div className="space-y-2">
          {invoices.map((inv) => {
            const paid = paidByInv.get(inv.id) ?? 0;
            const remaining = Math.max(0, Number(inv.amount) - paid);
            const overdue =
              !!inv.due_at && inv.due_at < today && inv.status !== "paid" && remaining > 0;
            return (
              <div key={inv.id} className="p-3 rounded-md bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="num font-semibold">
                      {Number(inv.amount).toLocaleString("en-US")}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{inv.issued_at}</span>
                    {inv.due_at && (
                      <span
                        className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        ← {inv.due_at}
                      </span>
                    )}
                    {overdue && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {T("متأخرة", "Overdue")}
                      </Badge>
                    )}
                    <Badge variant={inv.status === "paid" ? "default" : "outline"}>
                      {inv.status === "paid" ? T("مدفوعة", "Paid") : T("آجل", "Open")}
                    </Badge>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setInvForm({
                            id: inv.id,
                            supplier_id: supplierId,
                            brand_id: inv.brand_id ?? "",
                            amount: Number(inv.amount) || 0,
                            issued_at: inv.issued_at,
                            due_at: inv.due_at ?? "",
                            status: inv.status,
                            note: inv.note ?? "",
                          })
                        }
                      >
                        {T("تعديل", "Edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPayFor(inv.id);
                          setPayForm({ amount: remaining, paid_at: today, note: "" });
                        }}
                      >
                        {T("دفعة", "Payment")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(T("حذف الفاتورة؟", "Delete the invoice?")))
                            delInv({ data: { id: inv.id } }).then(onChanged);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {T("مدفوع", "Paid")}: <span className="num">{paid.toLocaleString("en-US")}</span>{" "}
                  · {T("متبقي", "Remaining")}:{" "}
                  <span className="num font-semibold">{remaining.toLocaleString("en-US")}</span>
                  {inv.note && <> · {inv.note}</>}
                </div>
                {payments
                  .filter((p) => p.invoice_id === inv.id)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between mt-1 pl-3 text-xs text-muted-foreground border-r-2 border-primary/30 pr-2"
                    >
                      <span>
                        {T("دفعة", "Payment")} {Number(p.amount).toLocaleString("en-US")} ·{" "}
                        {p.paid_at} {p.note ? `· ${p.note}` : ""}
                      </span>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => delPay({ data: { id: p.id } }).then(onChanged)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            );
          })}
          {invoices.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {T("لا فواتير لهذا المورد.", "No invoices for this supplier.")}
            </p>
          )}
        </div>

        {payFor && (
          <div className="p-3 rounded-md border border-primary/30 bg-primary/5 space-y-2">
            <div className="text-sm font-semibold">{T("تسجيل دفعة", "Record a payment")}</div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                dir="ltr"
                className="text-left"
                placeholder={T("المبلغ", "Amount")}
                value={payForm.amount}
                onChange={(e) =>
                  setPayForm({ ...payForm, amount: parseFloat(e.target.value) || 0 })
                }
              />
              <Input
                type="date"
                value={payForm.paid_at}
                onChange={(e) => setPayForm({ ...payForm, paid_at: e.target.value })}
              />
              <Input
                placeholder={T("ملاحظة", "Note")}
                value={payForm.note}
                onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                className="col-span-2"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submitPay}>
                {T("حفظ", "Save")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPayFor(null)}>
                {T("إلغاء", "Cancel")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
