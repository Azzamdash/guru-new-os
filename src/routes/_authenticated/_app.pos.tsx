import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Trash2, Printer, MessageCircle, Search, Store, CreditCard, Banknote, Layers } from "lucide-react";
import { listMyOfflineBranches, listBranchProducts, createPosSale, getPosInvoice } from "@/lib/pos.functions";

type PosInvoice = Awaited<ReturnType<typeof getPosInvoice>>;

export const Route = createFileRoute("/_authenticated/_app/pos")({
  head: () => ({ meta: [{ title: "نقطة البيع — e-GURUS" }, { name: "description", content: "شاشة بيع الفروع الأوفلاين" }] }),
  component: PosPage,
});

type CartItem = { productId: string; name: string; unitPrice: number; qty: number; stock: number };
type PaymentMethod = "cash" | "visa" | "mixed";

function PosPage() {
  const qc = useQueryClient();
  const branchesFn = useServerFn(listMyOfflineBranches);
  const productsFn = useServerFn(listBranchProducts);
  const createFn = useServerFn(createPosSale);
  const invFn = useServerFn(getPosInvoice);

  const branchesQ = useQuery({ queryKey: ["pos-branches"], queryFn: () => branchesFn() });
  const [branchId, setBranchId] = useState<string>("");
  const activeBranchId = branchId || branchesQ.data?.[0]?.id || "";
  const productsQ = useQuery({
    queryKey: ["pos-products", activeBranchId],
    queryFn: () => productsFn({ data: { brandId: activeBranchId } }),
    enabled: !!activeBranchId,
  });

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [cashAmt, setCashAmt] = useState<number>(0);
  const [cardAmt, setCardAmt] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const branch = branchesQ.data?.find((b) => b.id === activeBranchId);
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (productsQ.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q));
  }, [productsQ.data, search]);

  const total = cart.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const addToCart = (p: { id: string; name: string; sell_price: number; on_hand_qty: number }) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        if (p.on_hand_qty > 0 && existing.qty + 1 > p.on_hand_qty) {
          toast(tr("تخطيت المخزون المسجل — سيتم البيع على المكشوف"));
        }
        return prev.map((i) => i.productId === p.id ? { ...i, qty: i.qty + 1 } : i);
      }
      if (p.on_hand_qty <= 0) {
        toast(tr("المخزون غير مسجل لهذا المنتج — سيتم البيع على المكشوف"));
      }
      return [...prev, { productId: p.id, name: p.name, unitPrice: p.sell_price, qty: 1, stock: Math.max(p.on_hand_qty, 9999) }];
    });
  };
  const changeQty = (id: string, delta: number) => {
    setCart((prev) => prev.flatMap((i) => {
      if (i.productId !== id) return [i];
      const q = i.qty + delta;
      if (q <= 0) return [];
      return [{ ...i, qty: q }];
    }));
  };
  const removeItem = (id: string) => setCart((prev) => prev.filter((i) => i.productId !== id));
  const reset = () => {
    setCart([]); setCustomerName(""); setCustomerPhone("");
    setPayment("cash"); setCashAmt(0); setCardAmt(0);
  };

  const submit = async () => {
    if (!activeBranchId) return toast.error(tr("اختر فرعًا"));
    if (cart.length === 0) return toast.error(tr("السلة فارغة"));
    if (!customerName.trim()) return toast.error(tr("اسم العميل مطلوب"));
    if (!customerPhone.trim()) return toast.error(tr("رقم تليفون العميل مطلوب"));
    if (payment === "mixed" && Math.abs(cashAmt + cardAmt - total) > 0.5) {
      return toast.error(tr("مجموع الكاش والفيزا لازم يساوي الإجمالي"));
    }
    setSaving(true);
    try {
      const res = await createFn({ data: {
        brandId: activeBranchId,
        customerName, customerPhone,
        paymentMethod: payment,
        cashAmount: payment === "cash" ? total : payment === "mixed" ? cashAmt : 0,
        cardAmount: payment === "visa" ? total : payment === "mixed" ? cardAmt : 0,
        items: cart.map((c) => ({ productId: c.productId, qty: c.qty, unitPrice: c.unitPrice })),
      } });
      toast.success(tr("تم إتمام البيع"));
      // Refresh stock
      qc.invalidateQueries({ queryKey: ["pos-products", activeBranchId] });
      qc.invalidateQueries({ queryKey: ["pos-recent", 7] });
      // Fetch full invoice for print/whatsapp (non-fatal)
      try {
        const full = await invFn({ data: { id: res.id } });
        openReceiptModal(full);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذر فتح إيصال الطباعة");
      }
      reset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      console.error("[POS submit] failed:", e);
      toast.error(msg ? `فشل إتمام البيع: ${msg}` : "فشل إتمام البيع");
    } finally {
      setSaving(false);
    }
  };


  const [receipt, setReceipt] = useState<PosInvoice | null>(null);
  const openReceiptModal = (r: PosInvoice) => setReceipt(r);
  const openInvoiceById = async (id: string) => {
    try {
      const full = await invFn({ data: { id } });
      setReceipt(full);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر فتح الفاتورة");
    }
  };

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="relative min-h-[calc(100vh-4rem)] p-4 md:p-6">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed top-[-10%] right-[-10%] w-72 h-72 rounded-full bg-primary/10 blur-[120px] -z-10" />
      <div className="pointer-events-none fixed bottom-[-5%] left-[-10%] w-72 h-72 rounded-full bg-primary/5 blur-[120px] -z-10" />

      {/* Header — matches Tasks/Pipeline "Obsidian Glass" */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between mb-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/0 border border-primary/30 flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl sm:text-2xl font-extrabold leading-tight">{tr("نقطة البيع")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {branch ? branch.name : "اختر الفرع للبدء"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 rounded-full bg-card/60 backdrop-blur-md border border-border/60 px-3 py-1.5">
            <Store className="w-4 h-4 text-primary" />
            <Select value={activeBranchId} onValueChange={setBranchId}>
              <SelectTrigger className="min-w-[180px] h-8 border-0 bg-transparent p-0 focus:ring-0 focus:ring-offset-0 shadow-none">
                <SelectValue placeholder={tr("اختر الفرع")} />
              </SelectTrigger>
              <SelectContent>
                {(branchesQ.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 rtl:right-4 ltr:left-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr("بحث بالمنتج أو SKU")}
          className="h-12 rtl:pr-11 ltr:pl-11 rounded-2xl bg-card/60 backdrop-blur-md border-border/60"
        />
      </div>

      {branchesQ.data && branchesQ.data.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground rounded-3xl border-border/60 bg-card/40 backdrop-blur-md">
          {tr("لا يوجد فرع أوفلاين متاح لك. اطلب من الأدمن إنشاء براند بنوع «فرع أوفلاين» وإتاحة الوصول.")}
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Products grid */}
        <div className="lg:col-span-2">
          <div className="sticky top-16 z-10 mb-3 rounded-2xl border border-border/60 bg-gradient-to-r from-primary/15 to-primary/0 backdrop-blur-xl px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-5 rounded-full bg-primary" />
              <h2 className="text-sm font-bold tracking-wide">{tr("المنتجات")}</h2>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground num">{filteredProducts.length} {tr("صنف")}</span>
          </div>
          {productsQ.isLoading && (
            <p className="text-sm text-muted-foreground p-4">{tr("جاري التحميل...")}</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pb-40 lg:pb-4">
            {filteredProducts.map((p) => {
              const inCart = cart.find((i) => i.productId === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="group relative text-right rounded-3xl border border-border/60 bg-card/40 backdrop-blur-sm p-3 hover:border-primary/60 hover:bg-card/70 transition-all active:scale-[.98] overflow-hidden"
                >
                  {inCart && (
                    <span className="absolute top-2 rtl:left-2 ltr:right-2 z-10 min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center num shadow-lg shadow-primary/30">
                      {inCart.qty}
                    </span>
                  )}
                  <div className="aspect-square rounded-2xl bg-gradient-to-br from-muted/60 to-background/60 mb-3 flex items-center justify-center relative overflow-hidden border border-border/40">
                    <span className="text-2xl font-bold text-muted-foreground/40 num">
                      {p.name.trim().slice(0, 2)}
                    </span>
                    <span className="absolute bottom-2 rtl:right-2 ltr:left-2 text-[11px] font-bold bg-background/70 px-2 py-0.5 rounded-lg backdrop-blur-md text-primary num">
                      {Number(p.sell_price).toLocaleString("en-US")}
                    </span>
                  </div>
                  <div className="text-sm font-bold line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground truncate">{p.sku ?? ""}</span>
                    <Badge
                      variant={p.on_hand_qty > 0 ? "outline" : "secondary"}
                      className="num h-5 px-1.5"
                    >
                      {p.on_hand_qty}
                    </Badge>
                  </div>
                </button>
              );
            })}
            {filteredProducts.length === 0 && !productsQ.isLoading && (
              <div className="col-span-full text-center text-sm text-muted-foreground p-10 rounded-3xl border border-dashed border-border/60">
                {tr("لا منتجات.")}
              </div>
            )}
          </div>
        </div>

        {/* Cart & payment — desktop */}
        <div className="hidden lg:block space-y-4">
          <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">{tr("السلة")}</h2>
              <span className="text-xs text-muted-foreground num">{cartCount} {tr("قطعة")}</span>
            </div>
            {cart.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8 rounded-2xl border border-dashed border-border/60">
                {tr("فارغة — اختر منتجًا لإضافته.")}
              </div>
            )}
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {cart.map((i) => (
                <div key={i.productId} className="flex items-center gap-2 rounded-2xl bg-background/40 border border-border/40 p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{i.name}</div>
                    <div className="text-[11px] text-muted-foreground num">
                      {Number(i.unitPrice).toLocaleString("en-US")} × {i.qty} = {(i.qty * i.unitPrice).toLocaleString("en-US")}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-full bg-muted/50 border border-border/40 p-0.5">
                    <Button size="icon" variant="ghost" className="w-7 h-7 rounded-full" onClick={() => changeQty(i.productId, -1)}><Minus className="w-3.5 h-3.5" /></Button>
                    <span className="w-6 text-center text-sm font-bold num">{i.qty}</span>
                    <Button size="icon" variant="ghost" className="w-7 h-7 rounded-full" onClick={() => changeQty(i.productId, 1)}><Plus className="w-3.5 h-3.5" /></Button>
                  </div>
                  <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => removeItem(i.productId)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{tr("الإجمالي")}</span>
              <span className="text-2xl font-extrabold text-primary num">{total.toLocaleString("en-US")}</span>
            </div>
          </Card>

          <Card className="p-5 space-y-4 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("اسم العميل *")}</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-11 rounded-xl bg-background/40 border-border/50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("رقم تليفون العميل *")}</Label>
                <Input dir="ltr" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="01xxxxxxxxx" className="h-11 rounded-xl bg-background/40 border-border/50" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{tr("طريقة الدفع")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "cash", label: "كاش", Icon: Banknote },
                  { v: "visa", label: "فيزا", Icon: CreditCard },
                  { v: "mixed", label: "مختلط", Icon: Layers },
                ] as const).map(({ v, label, Icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPayment(v)}
                    className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border transition-all ${
                      payment === v
                        ? "bg-primary/15 border-primary/60 text-primary shadow-lg shadow-primary/10"
                        : "bg-background/30 border-border/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            {payment === "mixed" && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs text-muted-foreground">{tr("كاش")}</Label><Input type="number" dir="ltr" value={cashAmt} onChange={(e) => setCashAmt(parseFloat(e.target.value) || 0)} className="h-11 rounded-xl bg-background/40 border-border/50" /></div>
                <div><Label className="text-xs text-muted-foreground">{tr("فيزا")}</Label><Input type="number" dir="ltr" value={cardAmt} onChange={(e) => setCardAmt(parseFloat(e.target.value) || 0)} className="h-11 rounded-xl bg-background/40 border-border/50" /></div>
              </div>
            )}

            <Button
              className="w-full h-12 text-base rounded-2xl shadow-lg shadow-primary/25 active:scale-[.98]"
              disabled={saving || cart.length === 0}
              onClick={submit}
            >
              {saving ? "جارٍ الحفظ..." : `إتمام البيع — ${total.toLocaleString("en-US")}`}
            </Button>
          </Card>
        </div>
      </div>

      {/* Sticky mobile checkout panel */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-30">
        <div className="bg-card/90 backdrop-blur-xl border border-border/60 rounded-[2rem] p-3 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary num">
                {cartCount}
              </span>
              <span className="text-xs text-muted-foreground">{tr("قطعة في السلة")}</span>
            </div>
            <div className="text-left">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{tr("الإجمالي")}</p>
              <p className="text-lg font-extrabold text-primary num leading-none mt-0.5">{total.toLocaleString("en-US")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setMobileSheetOpen(true)}
              disabled={cart.length === 0}
              className="flex-1 h-12 rounded-2xl font-bold shadow-lg shadow-primary/25 active:scale-[.98]"
            >
              {tr("متابعة الدفع")}
            </Button>
            <Button
              variant="outline"
              className="w-12 h-12 rounded-2xl"
              onClick={reset}
              disabled={cart.length === 0}
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile checkout sheet */}
      {mobileSheetOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-end" onClick={() => setMobileSheetOpen(false)}>
          <div className="w-full bg-card border-t border-border/60 rounded-t-[2rem] p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto w-10 h-1 rounded-full bg-border" />
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{tr("إتمام البيع")}</h2>
              <span className="text-xs text-muted-foreground num">{cartCount} {tr("قطعة ·")} {total.toLocaleString("en-US")}</span>
            </div>
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              {cart.map((i) => (
                <div key={i.productId} className="flex items-center gap-2 rounded-xl bg-background/50 border border-border/40 p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{i.name}</div>
                    <div className="text-[11px] text-muted-foreground num">{Number(i.unitPrice).toLocaleString("en-US")} × {i.qty}</div>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-full bg-muted/50 border border-border/40 p-0.5">
                    <Button size="icon" variant="ghost" className="w-7 h-7 rounded-full" onClick={() => changeQty(i.productId, -1)}><Minus className="w-3.5 h-3.5" /></Button>
                    <span className="w-6 text-center text-sm font-bold num">{i.qty}</span>
                    <Button size="icon" variant="ghost" className="w-7 h-7 rounded-full" onClick={() => changeQty(i.productId, 1)}><Plus className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("اسم العميل *")}</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("رقم تليفون العميل *")}</Label>
                <Input dir="ltr" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="01xxxxxxxxx" className="h-11 rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{tr("طريقة الدفع")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "cash", label: "كاش", Icon: Banknote },
                  { v: "visa", label: "فيزا", Icon: CreditCard },
                  { v: "mixed", label: "مختلط", Icon: Layers },
                ] as const).map(({ v, label, Icon }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPayment(v)}
                    className={`flex flex-col items-center justify-center gap-1 py-3 rounded-2xl border transition-all ${
                      payment === v
                        ? "bg-primary/15 border-primary/60 text-primary"
                        : "bg-background/30 border-border/40 text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            {payment === "mixed" && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs text-muted-foreground">{tr("كاش")}</Label><Input type="number" dir="ltr" value={cashAmt} onChange={(e) => setCashAmt(parseFloat(e.target.value) || 0)} className="h-11 rounded-xl" /></div>
                <div><Label className="text-xs text-muted-foreground">{tr("فيزا")}</Label><Input type="number" dir="ltr" value={cardAmt} onChange={(e) => setCardAmt(parseFloat(e.target.value) || 0)} className="h-11 rounded-xl" /></div>
              </div>
            )}
            <Button
              className="w-full h-12 text-base rounded-2xl shadow-lg shadow-primary/25"
              disabled={saving || cart.length === 0}
              onClick={async () => { await submit(); setMobileSheetOpen(false); }}
            >
              {saving ? "جارٍ الحفظ..." : `تأكيد الدفع — ${total.toLocaleString("en-US")}`}
            </Button>
          </div>
        </div>
      )}

      {receipt && <ReceiptDialog inv={receipt} onClose={() => setReceipt(null)} branchName={branch?.name ?? receipt.brand_name} />}
    </div>
  );
}

function ReceiptDialog({ inv, onClose, branchName }: { inv: PosInvoice; onClose: () => void; branchName: string }) {
  const invoiceNo = `POS-${String(inv.id).slice(0, 8).toUpperCase()}`;
  const subtotal = inv.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const totalQty = inv.items.reduce((s, i) => s + Number(i.qty), 0);
  const payLabel = inv.payment_method === "cash" ? "كاش"
    : inv.payment_method === "visa" ? "فيزا"
    : inv.payment_method === "mixed" ? "مختلط (كاش + فيزا)" : "—";
  const dateStr = new Date(inv.created_at).toLocaleString("en-GB");

  const receiptText = useMemo(() => {
    const lines = [
      `فاتورة مبيعات — ${branchName}`,
      `رقم الفاتورة: ${invoiceNo}`,
      `العميل: ${inv.customer_name ?? ""}`,
      `التليفون: ${inv.customer_phone ?? ""}`,
      `التاريخ: ${dateStr}`,
      "----------------",
      ...inv.items.map((i) => `${i.product_name} × ${i.qty} = ${(i.qty * i.unit_price).toLocaleString("en-US")}`),
      "----------------",
      `الإجمالي: ${Number(inv.total_amount).toLocaleString("en-US")}`,
      inv.payment_method === "mixed"
        ? `كاش: ${Number(inv.cash_amount).toLocaleString("en-US")} / فيزا: ${Number(inv.card_amount).toLocaleString("en-US")}`
        : `طريقة الدفع: ${payLabel}`,
      "",
      "شكرًا لتعاملكم معنا.",
    ];
    return lines.join("\n");
  }, [inv, branchName, invoiceNo, dateStr, payLabel]);

  const print = () => {
    const w = window.open("", "_blank", "width=420,height=680");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const money = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = inv.items.map((i) => `
      <tr>
        <td class="prod">${esc(i.product_name)}</td>
        <td class="num">${i.qty}</td>
        <td class="num">${money(i.unit_price)}</td>
        <td class="num">${money(i.qty * i.unit_price)}</td>
      </tr>`).join("");

    const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(invoiceNo)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Tahoma', 'Arial', sans-serif; color:#111; padding: 8px 10px; font-size: 12px; line-height: 1.45; }
  .brand { text-align:center; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
  .brand .name { font-size: 18px; font-weight: 800; letter-spacing: .3px; }
  .brand .sub  { font-size: 11px; color:#555; margin-top: 2px; }
  .meta { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; margin: 4px 0; }
  .meta .label { color:#666; }
  .box { border: 1px dashed #999; border-radius: 4px; padding: 6px 8px; margin: 6px 0; }
  h2.section { font-size: 12px; margin: 8px 0 4px; color:#333; border-bottom: 1px solid #ddd; padding-bottom:2px; }
  table { width:100%; border-collapse: collapse; margin-top: 4px; }
  thead th { font-size: 11px; text-align: right; padding: 4px 2px; border-bottom: 1px solid #333; background:#f4f4f4; }
  tbody td { font-size: 11px; padding: 4px 2px; border-bottom: 1px dashed #ccc; vertical-align: top; }
  .num { font-family: 'Consolas','Menlo',monospace; text-align: left; direction: ltr; white-space: nowrap; }
  .prod { word-break: break-word; }
  .totals { margin-top: 8px; }
  .totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
  .totals .row.grand { border-top: 2px solid #111; margin-top: 4px; padding-top: 6px; font-size: 15px; font-weight: 800; }
  .pay { margin-top: 6px; font-size: 12px; }
  .pay .row { display:flex; justify-content: space-between; padding: 2px 0; }
  .footer { text-align:center; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #999; font-size: 11px; color:#444; }
  .footer .thanks { font-size: 13px; font-weight: 700; color:#111; }
  @media print { body { padding: 2px 4px; } .no-print { display:none; } }
</style></head><body>
  <div class="brand">
    <div class="name">${esc(branchName)}</div>
    <div class="sub">فاتورة مبيعات</div>
  </div>

  <div class="meta"><span class="label">رقم الفاتورة</span><span class="num">${esc(invoiceNo)}</span></div>
  <div class="meta"><span class="label">التاريخ</span><span class="num">${esc(dateStr)}</span></div>

  <h2 class="section">بيانات العميل</h2>
  <div class="box">
    <div class="meta"><span class="label">الاسم</span><span>${esc(inv.customer_name ?? "-")}</span></div>
    <div class="meta"><span class="label">التليفون</span><span class="num">${esc(inv.customer_phone ?? "-")}</span></div>
  </div>

  <h2 class="section">الأصناف</h2>
  <table>
    <thead><tr><th>الصنف</th><th class="num">كمية</th><th class="num">سعر</th><th class="num">إجمالي</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span>عدد الأصناف</span><span class="num">${inv.items.length}</span></div>
    <div class="row"><span>إجمالي القطع</span><span class="num">${totalQty}</span></div>
    <div class="row"><span>الإجمالي الفرعي</span><span class="num">${money(subtotal)}</span></div>
    <div class="row grand"><span>الإجمالي</span><span class="num">${money(inv.total_amount)}</span></div>
  </div>

  <div class="pay">
    <h2 class="section">الدفع</h2>
    <div class="row"><span>الطريقة</span><span>${esc(payLabel)}</span></div>
    ${inv.payment_method === "mixed" ? `
      <div class="row"><span>كاش</span><span class="num">${money(inv.cash_amount)}</span></div>
      <div class="row"><span>فيزا</span><span class="num">${money(inv.card_amount)}</span></div>
    ` : ""}
  </div>

  <div class="footer">
    <div class="thanks">شكرًا لتعاملكم معنا</div>
    <div>e-Gurus • ${esc(invoiceNo)}</div>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body></html>`;
    w.document.write(html);
    w.document.close();
  };

  const whatsapp = () => {
    const digits = (inv.customer_phone ?? "").replace(/\D/g, "");
    if (!digits) { toast.error(tr("رقم عميل غير صالح")); return; }
    const phone = digits.startsWith("2") || digits.startsWith("00") ? digits.replace(/^00/, "") : digits.startsWith("0") ? `2${digits}` : digits;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(receiptText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold mb-2">{tr("تمت الفاتورة")}</h3>
        <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap font-mono max-h-[50vh] overflow-auto">{receiptText}</pre>
        <div className="flex gap-2 mt-4">
          <Button className="flex-1 gap-2" onClick={print}><Printer className="w-4 h-4" />{tr("طباعة")}</Button>
          <Button className="flex-1 gap-2" variant="outline" onClick={whatsapp}><MessageCircle className="w-4 h-4" />{tr("واتساب")}</Button>
          <Button variant="ghost" onClick={onClose}>{tr("إغلاق")}</Button>
        </div>
      </Card>
    </div>
  );
}