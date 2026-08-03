import { tr } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet, Landmark, Smartphone, Plus, ArrowLeftRight, Pencil, Trash2 } from "lucide-react";
import { listWallets, upsertWallet, deleteWallet, getWalletBalances, transferBetweenWallets, type WalletKind } from "@/lib/wallets.functions";

const KIND_LABEL: Record<WalletKind, string> = { cash: "خزنة كاش", bank: "حساب بنكي", ewallet: "محفظة إلكترونية" };
const KIND_ICON: Record<WalletKind, typeof Wallet> = { cash: Wallet, bank: Landmark, ewallet: Smartphone };
function fmt(n: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n); }
function today() { return getTodayInBusinessTimezone(); }

export function WalletsPanel({ canWrite, from, to }: { canWrite: boolean; from: string; to: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWallets);
  const balFn = useServerFn(getWalletBalances);
  const upsertFn = useServerFn(upsertWallet);
  const delFn = useServerFn(deleteWallet);
  const xferFn = useServerFn(transferBetweenWallets);

  const walletsQ = useQuery({ queryKey: ["wallets"], queryFn: () => listFn() });
  const balQ = useQuery({ queryKey: ["wallet-balances", from, to], queryFn: () => balFn({ data: { from, to } }) });

  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; name: string; kind: WalletKind; opening_balance: number; active: boolean; sort_order: number; note?: string | null } | null>(null);

  const openNew = () => { setEditing({ name: "", kind: "cash", opening_balance: 0, active: true, sort_order: 0, note: "" }); setOpenEdit(true); };
  const openEditW = (w: { id: string; name: string; kind: WalletKind; opening_balance: number; active: boolean; sort_order: number; note: string | null }) => {
    setEditing({ id: w.id, name: w.name, kind: w.kind, opening_balance: w.opening_balance, active: w.active, sort_order: w.sort_order, note: w.note ?? "" });
    setOpenEdit(true);
  };

  const saveMut = useMutation({
    mutationFn: () => upsertFn({ data: {
      id: editing?.id,
      name: editing?.name ?? "",
      kind: (editing?.kind ?? "cash") as WalletKind,
      opening_balance: Number(editing?.opening_balance) || 0,
      active: editing?.active ?? true,
      sort_order: Number(editing?.sort_order) || 0,
      note: editing?.note || null,
    } }),
    onSuccess: () => {
      toast.success(tr("تم الحفظ"));
      setOpenEdit(false);
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["wallet-balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success(tr("تم الحذف")); qc.invalidateQueries({ queryKey: ["wallets"] }); qc.invalidateQueries({ queryKey: ["wallet-balances"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [xferOpen, setXferOpen] = useState(false);
  const [xfer, setXfer] = useState({ from_wallet_id: "", to_wallet_id: "", amount: 0, occurred_at: today(), note: "" });
  const xferMut = useMutation({
    mutationFn: () => xferFn({ data: { ...xfer, amount: Number(xfer.amount) || 0 } }),
    onSuccess: () => {
      toast.success(tr("تم التحويل"));
      setXferOpen(false);
      setXfer({ from_wallet_id: "", to_wallet_id: "", amount: 0, occurred_at: today(), note: "" });
      qc.invalidateQueries({ queryKey: ["wallet-balances"] });
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const wallets = walletsQ.data ?? [];
  const bals = balQ.data ?? [];
  const totalBal = useMemo(() => bals.reduce((a, b) => a + Number(b.balance || 0), 0), [bals]);
  const [tab, setTab] = useState<string>("all");

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{tr("المحافظ والخزائن")}</h2>
          <Badge variant="outline">{tr("الإجمالي:")} <span className="num ms-1">{fmt(totalBal)}</span></Badge>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setXferOpen(true)}><ArrowLeftRight className="w-4 h-4 me-1" /> {tr("تحويل")}</Button>
            <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 me-1" /> {tr("محفظة جديدة")}</Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="all">{tr("الكل (")}{fmt(totalBal)})</TabsTrigger>
          {bals.map((w) => {
            const I = KIND_ICON[w.kind];
            return (
              <TabsTrigger key={w.id} value={w.id} className="gap-1">
                <I className="w-3.5 h-3.5" /> {w.name} <span className="num text-xs opacity-70">({fmt(w.balance)})</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="all" className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bals.map((w) => {
              const I = KIND_ICON[w.kind];
              return (
                <Card key={w.id} className="p-3 border-border/60">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center"><I className="w-4 h-4 text-primary" /></div>
                      <div>
                        <div className="font-semibold text-sm">{w.name}</div>
                        <div className="text-[10px] text-muted-foreground">{KIND_LABEL[w.kind]}{w.active ? "" : " • معطلة"}</div>
                      </div>
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEditW(w)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm(tr("تأكيد حذف المحفظة؟"))) delMut.mutate(w.id); }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-[10px] text-muted-foreground">{tr("افتتاحي")}</div><div className="num font-semibold">{fmt(w.opening_balance)}</div></div>
                    <div><div className="text-[10px] text-muted-foreground">{tr("داخل الفترة")}</div><div className="num font-semibold text-emerald-500">{fmt(w.periodIn)}</div></div>
                    <div><div className="text-[10px] text-muted-foreground">{tr("خارج الفترة")}</div><div className="num font-semibold text-rose-500">{fmt(w.periodOut)}</div></div>
                  </div>
                  <div className="mt-2 border-t border-border/40 pt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{tr("الرصيد الحالي")}</span>
                    <span className={`num text-lg font-bold ${w.balance < 0 ? "text-destructive" : "text-primary"}`}>{fmt(w.balance)}</span>
                  </div>
                </Card>
              );
            })}
            {bals.length === 0 && <div className="col-span-full text-sm text-muted-foreground text-center p-8">{tr("أضف محفظتك الأولى للبدء.")}</div>}
          </div>
        </TabsContent>
        {bals.map((w) => (
          <TabsContent key={w.id} value={w.id} className="mt-3">
            <Card className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><div className="text-xs text-muted-foreground">{tr("النوع")}</div><div className="font-semibold">{KIND_LABEL[w.kind]}</div></div>
                <div><div className="text-xs text-muted-foreground">{tr("افتتاحي")}</div><div className="num font-semibold">{fmt(w.opening_balance)}</div></div>
                <div><div className="text-xs text-muted-foreground">{tr("داخل / خارج (الفترة)")}</div><div className="num"><span className="text-emerald-500">{fmt(w.periodIn)}</span> / <span className="text-rose-500">{fmt(w.periodOut)}</span></div></div>
                <div><div className="text-xs text-muted-foreground">{tr("الرصيد الحالي")}</div><div className={`num text-xl font-bold ${w.balance < 0 ? "text-destructive" : "text-primary"}`}>{fmt(w.balance)}</div></div>
              </div>
              {w.note && <p className="text-xs text-muted-foreground mt-2">{w.note}</p>}
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editing?.id ? "تعديل محفظة" : "محفظة جديدة"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>{tr("الاسم")}</Label><Input value={editing?.name ?? ""} onChange={(e) => setEditing((f) => f ? { ...f, name: e.target.value } : f)} /></div>
            <div>
              <Label>{tr("النوع")}</Label>
              <Select value={editing?.kind ?? "cash"} onValueChange={(v) => setEditing((f) => f ? { ...f, kind: v as WalletKind } : f)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{tr("خزنة كاش")}</SelectItem>
                  <SelectItem value="bank">{tr("حساب بنكي")}</SelectItem>
                  <SelectItem value="ewallet">{tr("محفظة إلكترونية")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{tr("الرصيد الافتتاحي (اسمح بالسالب)")}</Label><Input type="number" step="any" value={editing?.opening_balance ?? 0} onChange={(e) => setEditing((f) => f ? { ...f, opening_balance: Number(e.target.value) } : f)} /></div>
            <div><Label>{tr("ملاحظة")}</Label><Input value={editing?.note ?? ""} onChange={(e) => setEditing((f) => f ? { ...f, note: e.target.value } : f)} /></div>
            <div className="flex items-center gap-2"><input id="active" type="checkbox" checked={editing?.active ?? true} onChange={(e) => setEditing((f) => f ? { ...f, active: e.target.checked } : f)} /><Label htmlFor="active">{tr("مفعّلة")}</Label></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenEdit(false)}>{tr("إلغاء")}</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !editing?.name}>{tr("حفظ")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={xferOpen} onOpenChange={setXferOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{tr("تحويل بين المحافظ")}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>{tr("من محفظة")}</Label>
              <Select value={xfer.from_wallet_id} onValueChange={(v) => setXfer((f) => ({ ...f, from_wallet_id: v }))}>
                <SelectTrigger><SelectValue placeholder={tr("اختر المحفظة المصدر")} /></SelectTrigger>
                <SelectContent>{wallets.filter((w) => w.active).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{tr("إلى محفظة")}</Label>
              <Select value={xfer.to_wallet_id} onValueChange={(v) => setXfer((f) => ({ ...f, to_wallet_id: v }))}>
                <SelectTrigger><SelectValue placeholder={tr("اختر المحفظة الهدف")} /></SelectTrigger>
                <SelectContent>{wallets.filter((w) => w.active && w.id !== xfer.from_wallet_id).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{tr("المبلغ")}</Label><Input type="number" step="any" value={xfer.amount} onChange={(e) => setXfer((f) => ({ ...f, amount: Number(e.target.value) }))} /></div>
            <div><Label>{tr("التاريخ")}</Label><Input type="date" value={xfer.occurred_at} onChange={(e) => setXfer((f) => ({ ...f, occurred_at: e.target.value }))} /></div>
            <div><Label>{tr("ملاحظة")}</Label><Input value={xfer.note} onChange={(e) => setXfer((f) => ({ ...f, note: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setXferOpen(false)}>{tr("إلغاء")}</Button>
            <Button onClick={() => xferMut.mutate()} disabled={xferMut.isPending || !xfer.from_wallet_id || !xfer.to_wallet_id || !(xfer.amount > 0)}>{tr("تحويل")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
