import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Plus, Check, X as XIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listMyRequests, listAllRequests, createRequest, cancelMyRequest, reviewRequest,
  minRequestDate, type EmployeeRequest,
} from "@/lib/hr.functions";
import { getMyRole, listUsers } from "@/lib/admin.functions";
import { useLang, tr } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/hr/requests")({
  head: () => ({ meta: [
    { title: tr("طلبات الموظفين — e-GURUS") },
    { name: "description", content: "طلبات الإجازة والسلفة ومراجعتها من HR." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: RequestsPage,
});

function RequestsPage() {
  const { lang } = useLang();
  const qc = useQueryClient();
  const roleFn = useServerFn(getMyRole);
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => roleFn() });
  const isHR = !!(roleQ.data?.isAdmin || roleQ.data?.isManager || roleQ.data?.roles?.includes("hr"));

  const mineFn = useServerFn(listMyRequests);
  const allFn = useServerFn(listAllRequests);
  const cancelFn = useServerFn(cancelMyRequest);
  const usersFn = useServerFn(listUsers);

  const mineQ = useQuery({ queryKey: ["hr-my-requests"], queryFn: () => mineFn() });
  const allQ = useQuery({ queryKey: ["hr-all-requests"], queryFn: () => allFn(), enabled: isHR });
  const usersQ = useQuery({ queryKey: ["admin-users"], queryFn: () => usersFn(), enabled: isHR });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => { toast.success(lang === "ar" ? "تم الإلغاء" : "Cancelled"); qc.invalidateQueries({ queryKey: ["hr-my-requests"] }); qc.invalidateQueries({ queryKey: ["hr-all-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const userEmail = (id: string | null) => usersQ.data?.find((u) => u.id === id)?.email ?? id ?? "—";

  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const typeLabel = (t: EmployeeRequest["type"]) =>
    t === "leave" ? T("إجازة", "Leave") : T("سلفة", "Salary advance");
  const statusLabel = (s: EmployeeRequest["status"]) =>
    s === "pending" ? T("قيد المراجعة", "Pending")
      : s === "approved" ? T("مقبولة", "Approved")
      : T("مرفوضة", "Rejected");
  const statusColor = (s: EmployeeRequest["status"]) =>
    s === "pending" ? "bg-amber-500/15 text-amber-500"
      : s === "approved" ? "bg-emerald-500/15 text-emerald-500"
      : "bg-red-500/15 text-red-500";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="w-7 h-7 text-primary" />
            {T(tr("طلبات الإجازة والسلفة"), "Leave & Advance Requests")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              tr("قدّم طلب إجازة أو سلفة. لازم التاريخ بعد يومين على الأقل من تاريخ اليوم."),
              "Submit a leave or salary-advance request. Date must be at least 2 days from today.",
            )}
          </p>
        </div>
        <RequestDialog />
      </div>

      <Card className="card-gradient p-4 md:p-5 space-y-3">
        <h3 className="font-semibold">{T(tr("طلباتي"), "My requests")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-muted-foreground">
                <th className="p-2">{T(tr("النوع"), "Type")}</th>
                <th className="p-2">{T(tr("التاريخ"), "Date")}</th>
                <th className="p-2">{T(tr("المبلغ"), "Amount")}</th>
                <th className="p-2">{T(tr("ملاحظة"), "Note")}</th>
                <th className="p-2">{T(tr("الحالة"), "Status")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(mineQ.data ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="p-2">{typeLabel(r.type)}</td>
                  <td className="p-2">{r.requested_date}</td>
                  <td className="p-2">{r.amount != null ? r.amount : "—"}</td>
                  <td className="p-2 max-w-[220px] truncate">{r.note ?? "—"}</td>
                  <td className="p-2"><Badge className={statusColor(r.status)} variant="secondary">{statusLabel(r.status)}</Badge></td>
                  <td className="p-2 text-end">
                    {r.status === "pending" && (
                      <Button size="icon" variant="ghost" onClick={() => { if (confirm(T(tr("إلغاء الطلب؟"),"Cancel this request?"))) cancelMut.mutate(r.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {(mineQ.data ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{T(tr("لا توجد طلبات."), "No requests.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isHR && (
        <Card className="card-gradient p-4 md:p-5 space-y-3">
          <h3 className="font-semibold">{T(tr("جميع الطلبات (HR/المدير)"), "All requests (HR / Manager)")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-right text-muted-foreground">
                  <th className="p-2">{T(tr("الموظف"), "Employee")}</th>
                  <th className="p-2">{T(tr("النوع"), "Type")}</th>
                  <th className="p-2">{T(tr("التاريخ"), "Date")}</th>
                  <th className="p-2">{T(tr("المبلغ"), "Amount")}</th>
                  <th className="p-2">{T(tr("ملاحظة"), "Note")}</th>
                  <th className="p-2">{T(tr("الحالة"), "Status")}</th>
                  <th className="p-2 text-end"></th>
                </tr>
              </thead>
              <tbody>
                {(allQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="p-2">{userEmail(r.user_id)}</td>
                    <td className="p-2">{typeLabel(r.type)}</td>
                    <td className="p-2">{r.requested_date}</td>
                    <td className="p-2">{r.amount != null ? r.amount : "—"}</td>
                    <td className="p-2 max-w-[200px] truncate">{r.note ?? "—"}</td>
                    <td className="p-2"><Badge className={statusColor(r.status)} variant="secondary">{statusLabel(r.status)}</Badge></td>
                    <td className="p-2 text-end">
                      {r.status === "pending" ? (
                        <ReviewDialog req={r} />
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString("en-US") : ""}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {(allQ.data ?? []).length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{T(tr("لا توجد طلبات."), "No requests.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function RequestDialog() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"leave" | "advance">("leave");
  const min = minRequestDate();
  const [date, setDate] = useState(min);
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const createFn = useServerFn(createRequest);
  const mut = useMutation({
    mutationFn: () => createFn({ data: {
      type, requested_date: date,
      amount: type === "advance" ? Number(amount || 0) : null,
      note: note || null,
    }}),
    onSuccess: () => { toast.success(T(tr("تم إرسال الطلب"),"Request submitted")); qc.invalidateQueries({ queryKey: ["hr-my-requests"] }); qc.invalidateQueries({ queryKey: ["hr-all-requests"] }); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 me-2" />{T(tr("طلب جديد"),"New request")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{T(tr("طلب إجازة أو سلفة"),"Leave or advance request")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{T(tr("النوع"),"Type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as "leave" | "advance")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="leave">{T(tr("إجازة"),"Leave")}</SelectItem>
                <SelectItem value="advance">{T(tr("سلفة"),"Salary advance")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{T(tr("التاريخ (يومين على الأقل من اليوم)"),"Date (min 2 days from today)")}</Label>
            <Input type="date" min={min} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {type === "advance" && (
            <div>
              <Label>{T(tr("المبلغ"),"Amount")}</Label>
              <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          )}
          <div>
            <Label>{T(tr("ملاحظة"),"Note")}</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{T(tr("إلغاء"),"Cancel")}</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !date || (type === "advance" && !amount)}
          >
            {T(tr("إرسال"),"Submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ req }: { req: EmployeeRequest }) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<"approved" | "rejected">("approved");
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewRequest);
  const mut = useMutation({
    mutationFn: () => reviewFn({ data: { id: req.id, status: action, proof_url: null, review_note: note || null } }),
    onSuccess: () => { toast.success(T(tr("تم"),"Done")); qc.invalidateQueries({ queryKey: ["hr-all-requests"] }); qc.invalidateQueries({ queryKey: ["hr-my-requests"] }); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">{T(tr("مراجعة"),"Review")}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{T(tr("مراجعة الطلب"),"Review request")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button variant={action === "approved" ? "default" : "outline"} onClick={() => setAction("approved")} className="flex-1"><Check className="w-4 h-4 me-1" />{T(tr("قبول"),"Approve")}</Button>
            <Button variant={action === "rejected" ? "default" : "outline"} onClick={() => setAction("rejected")} className="flex-1"><XIcon className="w-4 h-4 me-1" />{T(tr("رفض"),"Reject")}</Button>
          </div>
          <div>
            <Label>{T(tr("ملاحظة المراجعة"),"Review note")}</Label>
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{T(tr("إلغاء"),"Cancel")}</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {T(tr("حفظ"),"Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}