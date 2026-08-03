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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, Download } from "lucide-react";
import {
  listProducts,
  upsertProduct,
  deleteProduct,
  listBrands,
  listMaterials,
  getProductBOM,
  upsertBOMLine,
  deleteBOMLine,
  runShopifyProductsSync,
} from "@/lib/internal.functions";
import { PaginationBar, usePagination } from "@/components/PaginationBar";
import { TableSkeleton } from "@/components/TableSkeleton";
import { useLang } from "@/lib/i18n";

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

export function ProductCatalogTab() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const listP = useServerFn(listProducts);
  const listB = useServerFn(listBrands);
  const listM = useServerFn(listMaterials);
  const upP = useServerFn(upsertProduct);
  const delP = useServerFn(deleteProduct);
  const syncShopP = useServerFn(runShopifyProductsSync);
  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => listP() });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listB() });
  const materialsQ = useQuery({ queryKey: ["materials"], queryFn: () => listM() });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    id?: string;
    brand_id: string;
    name: string;
    sku: string;
    unit: string;
    sell_price: number;
    cogs_override: number | null;
    cogs_percent: number | null;
    reorder_point: number;
    active: boolean;
  }>(null);
  const [bomProduct, setBomProduct] = useState<string | null>(null);
  const [shopDlg, setShopDlg] = useState<{ open: boolean; brandId: string }>({
    open: false,
    brandId: "",
  });

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => upP({ data: { ...v, sku: v.sku || null } }),
    onSuccess: () => {
      toast.success(T("تم الحفظ", "Saved"));
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delP({ data: { id } }),
    onSuccess: () => {
      toast.success(T("تم الحذف", "Deleted"));
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const syncShop = useMutation({
    mutationFn: (brandId: string) => syncShopP({ data: { brandId } }),
    onSuccess: (res: {
      fetched: number;
      inserted: number;
      updated: number;
      variants: number;
      withCost?: number;
    }) => {
      const costNote =
        typeof res.withCost === "number"
          ? T(
              ` — تم جلب COGS لـ ${res.withCost} variant`,
              ` — fetched COGS for ${res.withCost} variant(s)`,
            )
          : "";
      toast.success(
        T(
          `تمت المزامنة: ${res.inserted} جديد، ${res.updated} محدَّث (${res.variants} variant من ${res.fetched} منتج)${costNote}`,
          `Synced: ${res.inserted} new, ${res.updated} updated (${res.variants} variant(s) from ${res.fetched} product(s))${costNote}`,
        ),
      );
      qc.invalidateQueries({ queryKey: ["products"] });
      setShopDlg({ open: false, brandId: "" });
    },
    onError: (e: Error) => {
      const isScopeError =
        e.message.includes("missing required scope") ||
        e.message.includes("token missing required scope");
      const message = isScopeError
        ? T(
            "Shopify ناقص صلاحية read_products. التوكن الحالي صُدِر قبل إضافة الـ Scopes.\nالحل: اذهب إلى التكاملات، احذف اتصال Shopify للبراند، ثم اضغط Connect مرة أخرى لتصريح جديد.",
            "Shopify is missing the read_products permission. The current token was issued before the scopes were added.\nFix: go to Integrations, remove the brand's Shopify connection, then click Connect again to authorize a new token.",
          )
        : T(`فشل: ${e.message}`, `Failed: ${e.message}`);
      toast.error(message, { duration: 8000 });
    },
  });

  const brands = brandsQ.data ?? [];
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";
  const productBrands = brands.filter((b) => b.active);
  const productsPg = usePagination(productsQ.data ?? [], 25);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{T("المنتجات", "Products")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "تعريف المنتج والوحدة وسعر البيع وقائمة الخامات.",
              "Define the product, unit, sell price, and bill of materials.",
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShopDlg({ open: true, brandId: productBrands[0]?.id ?? "" })}
          >
            <Download className="w-4 h-4 me-2" /> {T("استيراد من Shopify", "Import from Shopify")}
          </Button>
          <Button
            onClick={() => {
              setEditing({
                brand_id: productBrands[0]?.id ?? "",
                name: "",
                sku: "",
                unit: "piece",
                sell_price: 0,
                cogs_override: null,
                cogs_percent: null,
                reorder_point: 0,
                active: true,
              });
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4 me-2" /> {T("منتج جديد", "New Product")}
          </Button>
        </div>
      </div>

      <Card className="card-gradient overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-muted-foreground">
                <th className="p-3">{T("الاسم", "Name")}</th>
                <th className="p-3">{T("البراند", "Brand")}</th>
                <th className="p-3">{T("الوحدة", "Unit")}</th>
                <th className="p-3">SKU</th>
                <th className="p-3 text-left">{T("سعر البيع", "Sell Price")}</th>
                <th className="p-3 text-left">{T("التكلفة", "Cost")}</th>
                <th className="p-3 text-left">COGS %</th>
                <th className="p-3">{T("الحالة", "Status")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {productsQ.isLoading && (
                <tr>
                  <td colSpan={9} className="p-4">
                    <TableSkeleton rows={6} cols={9} />
                  </td>
                </tr>
              )}
              {!productsQ.isLoading &&
                productsPg.slice.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3">{brandName(p.brand_id)}</td>
                    <td className="p-3 text-muted-foreground">{unitLabel(p.unit, lang)}</td>
                    <td className="p-3 num text-muted-foreground">{p.sku ?? "—"}</td>
                    <td className="p-3 num text-left">{p.sell_price.toLocaleString("en-US")}</td>
                    <td className="p-3 num text-left">
                      {p.cogs_override != null ? p.cogs_override.toLocaleString("en-US") : "—"}
                    </td>
                    <td className="p-3 num text-left">
                      {p.cogs_percent != null ? `${p.cogs_percent}%` : "—"}
                    </td>
                    <td className="p-3">
                      {p.active ? (
                        <Badge>{T("مفعّل", "Active")}</Badge>
                      ) : (
                        <Badge variant="secondary">{T("معطّل", "Disabled")}</Badge>
                      )}
                    </td>
                    <td className="p-3 flex gap-2 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => setBomProduct(p.id)}>
                        <Layers className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing({
                            id: p.id,
                            brand_id: p.brand_id,
                            name: p.name,
                            sku: p.sku ?? "",
                            unit: p.unit,
                            sell_price: p.sell_price,
                            cogs_override: p.cogs_override,
                            cogs_percent: p.cogs_percent,
                            reorder_point: (p as { reorder_point?: number }).reorder_point ?? 0,
                            active: p.active,
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
                          if (confirm(T("حذف المنتج؟", "Delete the product?"))) remove.mutate(p.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              {!productsQ.isLoading && (productsQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    {T('لا منتجات. اضغط "منتج جديد".', 'No products. Click "New Product".')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar {...productsPg} />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? T("تعديل منتج", "Edit Product") : T("منتج جديد", "New Product")}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>{T("البراند", "Brand")}</Label>
                <Select
                  value={editing.brand_id}
                  onValueChange={(v) => setEditing({ ...editing, brand_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={T("اختر", "Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {productBrands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{T("الاسم", "Name")}</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>SKU</Label>
                  <Input
                    value={editing.sku}
                    onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                  />
                </div>
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{T("سعر البيع", "Sell Price")}</Label>
                  <Input
                    type="number"
                    value={editing.sell_price}
                    onChange={(e) =>
                      setEditing({ ...editing, sell_price: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label>{T("تكلفة يدوية (اختياري)", "Manual Cost (optional)")}</Label>
                  <Input
                    type="number"
                    value={editing.cogs_override ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        cogs_override: e.target.value === "" ? null : parseFloat(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>
                  {T("نسبة التكلفة % من سعر البيع (اختياري)", "Cost % of Sell Price (optional)")}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder={T("مثال: 40", "e.g. 40")}
                  value={editing.cogs_percent ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      cogs_percent: e.target.value === "" ? null : parseFloat(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {T(
                    "الأولوية: تكلفة يدوية ← نسبة المنتج ← نسبة البراند ← مجموع الخامات.",
                    "Priority: manual cost ← product % ← brand % ← sum of materials.",
                  )}
                </p>
              </div>
              <div>
                <Label>
                  {T(
                    "نقطة إعادة الطلب (تنبيه عند الوصول لها)",
                    "Reorder Point (alert when reached)",
                  )}
                </Label>
                <Input
                  type="number"
                  value={editing.reorder_point}
                  onChange={(e) =>
                    setEditing({ ...editing, reorder_point: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {T("إلغاء", "Cancel")}
            </Button>
            <Button
              onClick={() => editing && save.mutate(editing)}
              disabled={save.isPending || !editing?.brand_id || !editing?.name}
            >
              {T("حفظ", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BOMDialog
        productId={bomProduct}
        onClose={() => setBomProduct(null)}
        materials={materialsQ.data ?? []}
      />

      <Dialog
        open={shopDlg.open}
        onOpenChange={(o) => !o && setShopDlg({ open: false, brandId: "" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {T("استيراد المنتجات من Shopify", "Import Products from Shopify")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{T("البراند", "Brand")}</Label>
              <Select
                value={shopDlg.brandId}
                onValueChange={(v) => setShopDlg({ ...shopDlg, brandId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={T("اختر البراند", "Select brand")} />
                </SelectTrigger>
                <SelectContent>
                  {productBrands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {T(
                "هيتم سحب كل المنتجات و variants من متجر Shopify المربوط بالبراند ده. المنتجات الموجودة (بنفس الـ SKU) هتتحدَّث، والجديدة هتضاف.",
                "This will pull all products and variants from the Shopify store connected to this brand. Existing products (matching SKU) will be updated, and new ones will be added.",
              )}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShopDlg({ open: false, brandId: "" })}>
              {T("إلغاء", "Cancel")}
            </Button>
            <Button
              onClick={() => syncShop.mutate(shopDlg.brandId)}
              disabled={!shopDlg.brandId || syncShop.isPending}
            >
              {syncShop.isPending ? T("جاري السحب…", "Fetching…") : "Call all Products"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BOMDialog({
  productId,
  onClose,
  materials,
}: {
  productId: string | null;
  onClose: () => void;
  materials: Array<{ id: string; name: string; unit: string; unit_cost: number }>;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const getBOM = useServerFn(getProductBOM);
  const upBOM = useServerFn(upsertBOMLine);
  const delBOM = useServerFn(deleteBOMLine);
  const bomQ = useQuery({
    queryKey: ["bom", productId],
    queryFn: () => getBOM({ data: { productId: productId! } }),
    enabled: !!productId,
  });
  const [matId, setMatId] = useState("");
  const [qty, setQty] = useState(1);
  const add = useMutation({
    mutationFn: () =>
      upBOM({ data: { product_id: productId!, material_id: matId, qty_per_unit: qty } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bom", productId] });
      setMatId("");
      setQty(1);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delBOM({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bom", productId] }),
  });
  const rows = (bomQ.data ?? []) as Array<{
    id: string;
    material_id: string;
    qty_per_unit: number;
    materials: { name: string; unit: string; unit_cost: number };
  }>;
  const totalCogs = rows.reduce((a, r) => a + r.qty_per_unit * (r.materials?.unit_cost ?? 0), 0);
  return (
    <Dialog open={!!productId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{T("قائمة الخامات (BOM)", "Bill of Materials (BOM)")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_120px_auto] gap-2 items-end">
            <div>
              <Label>{T("الخامة", "Material")}</Label>
              <Select value={matId} onValueChange={setMatId}>
                <SelectTrigger>
                  <SelectValue placeholder={T("اختر", "Select")} />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({unitLabel(m.unit, lang)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{T("الكمية/وحدة", "Qty/Unit")}</Label>
              <Input
                type="number"
                value={qty}
                onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
              />
            </div>
            <Button onClick={() => add.mutate()} disabled={!matId || qty <= 0}>
              {T("إضافة", "Add")}
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-2">{T("الخامة", "Material")}</th>
                <th className="p-2 text-left">{T("كمية/وحدة", "Qty/Unit")}</th>
                <th className="p-2 text-left">{T("التكلفة", "Cost")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-2">{r.materials?.name}</td>
                  <td className="p-2 num text-left">{r.qty_per_unit}</td>
                  <td className="p-2 num text-left">
                    {(r.qty_per_unit * (r.materials?.unit_cost ?? 0)).toLocaleString("en-US")}
                  </td>
                  <td className="p-2 text-left">
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-center text-muted-foreground">
                    {T("لا خامات مضافة.", "No materials added.")}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="p-2" colSpan={2}>
                  {T("إجمالي تكلفة الوحدة", "Total Unit Cost")}
                </td>
                <td className="p-2 num text-left" colSpan={2}>
                  {totalCogs.toLocaleString("en-US")}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
