import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listInvestors,
  upsertInvestor,
  deleteInvestor,
  setInvestorShares,
} from "@/lib/investors.functions";
import { listBrands } from "@/lib/internal.functions";
import { listUsers, getMyRole } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Percent, Plus, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/_app/investors")({
  component: InvestorsPage,
  head: () => ({
    meta: [
      { title: "المستثمرون | e-GURUS" },
      { name: "description", content: "إدارة المستثمرين ونسبهم في البراندات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function InvestorsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInvestors);
  const brandsFn = useServerFn(listBrands);
  const usersFn = useServerFn(listUsers);
  const upsertFn = useServerFn(upsertInvestor);
  const deleteFn = useServerFn(deleteInvestor);
  const sharesFn = useServerFn(setInvestorShares);
  const roleFn = useServerFn(getMyRole);

  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => roleFn() });
  const isAdmin = !!roleQ.data?.isAdmin;

  const invQ = useQuery({ queryKey: ["investors"], queryFn: () => listFn(), enabled: isAdmin });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn(), enabled: isAdmin });
  const usersQ = useQuery({ queryKey: ["admin-users"], queryFn: () => usersFn(), enabled: isAdmin });

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    email: string;
    phone: string;
    notes: string;
    user_id: string;
  }>({ name: "", email: "", phone: "", notes: "", user_id: "" });

  const [sharesOpen, setSharesOpen] = useState(false);
  const [sharesInvId, setSharesInvId] = useState<string | null>(null);
  const [sharesDraft, setSharesDraft] = useState<Array<{ brand_id: string; share_percentage: number }>>([]);

  const saveMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: editing.id,
          name: editing.name,
          email: editing.email || null,
          phone: editing.phone || null,
          notes: editing.notes || null,
          user_id: editing.user_id || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["investors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["investors"] });
    },
  });

  const sharesMut = useMutation({
    mutationFn: () =>
      sharesFn({ data: { investor_id: sharesInvId!, shares: sharesDraft.filter((s) => s.brand_id) } }),
    onSuccess: () => {
      toast.success("تم حفظ النسب");
      setSharesOpen(false);
      qc.invalidateQueries({ queryKey: ["investors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sharesByInv = useMemo(() => {
    const map = new Map<string, Array<{ id: string; brand_id: string; share_percentage: number }>>();
    for (const s of invQ.data?.shares ?? []) {
      const arr = map.get(s.investor_id) ?? [];
      arr.push({ id: s.id, brand_id: s.brand_id, share_percentage: Number(s.share_percentage) });
      map.set(s.investor_id, arr);
    }
    return map;
  }, [invQ.data]);

  const brandName = (id: string) => brandsQ.data?.find((b) => b.id === id)?.name ?? id;

  if (!roleQ.isLoading && !isAdmin) {
    return (
      <div className="p-6">
        <EmptyState title="غير مسموح" description="هذه الصفحة للمشرفين فقط" />
      </div>
    );
  }

  const openEdit = (inv?: { id: string; name: string; email: string | null; phone: string | null; notes: string | null; user_id: string | null }) => {
    if (inv) {
      setEditing({
        id: inv.id,
        name: inv.name,
        email: inv.email ?? "",
        phone: inv.phone ?? "",
        notes: inv.notes ?? "",
        user_id: inv.user_id ?? "",
      });
    } else {
      setEditing({ name: "", email: "", phone: "", notes: "", user_id: "" });
    }
    setEditOpen(true);
  };

  const openShares = (investorId: string) => {
    setSharesInvId(investorId);
    const existing = sharesByInv.get(investorId) ?? [];
    setSharesDraft(existing.map((s) => ({ brand_id: s.brand_id, share_percentage: s.share_percentage })));
    setSharesOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" /> المستثمرون
          </h1>
          <p className="text-sm text-muted-foreground">أدر بيانات المستثمرين ونسبهم في البراندات</p>
        </div>
        <Button onClick={() => openEdit()} className="gap-2">
          <Plus className="w-4 h-4" /> مستثمر جديد
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>البريد / الهاتف</TableHead>
              <TableHead>البراندات ونسبها</TableHead>
              <TableHead>حساب مرتبط</TableHead>
              <TableHead className="text-left">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(invQ.data?.investors ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState title="لا يوجد مستثمرون" description="ابدأ بإضافة مستثمر جديد" />
                </TableCell>
              </TableRow>
            )}
            {(invQ.data?.investors ?? []).map((inv) => {
              const shares = sharesByInv.get(inv.id) ?? [];
              const linked = usersQ.data?.find((u) => u.id === inv.user_id);
              return (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div>{inv.email || "—"}</div>
                    <div>{inv.phone || "—"}</div>
                  </TableCell>
                  <TableCell>
                    {shares.length === 0 ? (
                      <span className="text-xs text-muted-foreground">لا يوجد</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {shares.map((s) => (
                          <Badge key={s.brand_id} variant="secondary">
                            {brandName(s.brand_id)} · {s.share_percentage}%
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs" dir="ltr">
                    {linked?.email ?? (inv.user_id ? inv.user_id.slice(0, 8) : "—")}
                  </TableCell>
                  <TableCell className="text-left">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openShares(inv.id)} className="gap-1">
                        <Percent className="w-3 h-3" /> النسب
                      </Button>
                      <Link to="/investors/$id" params={{ id: inv.id }}>
                        <Button size="sm" variant="outline" className="gap-1">
                          <TrendingUp className="w-3 h-3" /> عرض
                        </Button>
                      </Link>
                      <Button size="sm" variant="outline" onClick={() => openEdit(inv)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm("حذف المستثمر؟")) delMut.mutate(inv.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing.id ? "تعديل المستثمر" : "مستثمر جديد"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم *</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>البريد</Label>
                <Input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div>
                <Label>الهاتف</Label>
                <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>الحساب المرتبط (اختياري)</Label>
              <Select
                value={editing.user_id || "none"}
                onValueChange={(v) => setEditing({ ...editing, user_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="لا يوجد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون حساب —</SelectItem>
                  {usersQ.data?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                اربط الحساب بيوزر بدور "مستثمر" حتى يستطيع رؤية داش بورده الخاص.
              </p>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button onClick={() => saveMut.mutate()} disabled={!editing.name.trim() || saveMut.isPending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shares dialog */}
      <Dialog open={sharesOpen} onOpenChange={setSharesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>نسب المستثمر في البراندات</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {sharesDraft.map((s, idx) => (
              <div key={idx} className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">البراند</Label>
                  <Select
                    value={s.brand_id}
                    onValueChange={(v) => {
                      const copy = [...sharesDraft];
                      copy[idx] = { ...copy[idx], brand_id: v };
                      setSharesDraft(copy);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر" />
                    </SelectTrigger>
                    <SelectContent>
                      {brandsQ.data?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Label className="text-xs">النسبة %</Label>
                  <Input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={s.share_percentage}
                    onChange={(e) => {
                      const copy = [...sharesDraft];
                      copy[idx] = { ...copy[idx], share_percentage: Number(e.target.value) };
                      setSharesDraft(copy);
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setSharesDraft(sharesDraft.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSharesDraft([...sharesDraft, { brand_id: "", share_percentage: 10 }])}
              className="gap-1"
            >
              <Plus className="w-4 h-4" /> إضافة براند
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSharesOpen(false)}>إلغاء</Button>
            <Button onClick={() => sharesMut.mutate()} disabled={sharesMut.isPending}>حفظ النسب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
