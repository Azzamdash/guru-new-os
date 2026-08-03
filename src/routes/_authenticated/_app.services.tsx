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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Briefcase,
  Users,
  CheckCircle2,
  DollarSign,
  TrendingDown,
  PiggyBank,
  Megaphone,
} from "lucide-react";
import { listBrands } from "@/lib/internal.functions";
import {
  listServiceClients,
  upsertServiceClient,
  deleteServiceClient,
  listServiceProjects,
  upsertServiceProject,
  deleteServiceProject,
  getServiceBrandOverview,
  type ServiceClient,
  type ServiceProject,
} from "@/lib/services.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/services")({
  head: () => ({
    meta: [
      { title: "براندات الخدمات — e-GURUS" },
      {
        name: "description",
        content: "إدارة عملاء ومشاريع براندات الخدمات مع تقارير الإيرادات والأرباح.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ServicesPage,
});

const STATUS_LABEL: Record<string, { ar: string; en: string }> = {
  pending: { ar: "قيد الانتظار", en: "Pending" },
  in_progress: { ar: "جارٍ", en: "In Progress" },
  done: { ar: "تم", en: "Done" },
  cancelled: { ar: "ملغي", en: "Cancelled" },
};
const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

function ServicesPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const listBrandsFn = useServerFn(listBrands);
  const listClientsFn = useServerFn(listServiceClients);
  const listProjectsFn = useServerFn(listServiceProjects);
  const overviewFn = useServerFn(getServiceBrandOverview);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const serviceBrands = useMemo(
    () => (brandsQ.data ?? []).filter((b) => b.type === "service" && b.active),
    [brandsQ.data],
  );

  const [brandId, setBrandId] = useState<string>("");
  const currentBrand = brandId || serviceBrands[0]?.id || "";

  const clientsQ = useQuery({
    queryKey: ["service-clients", currentBrand],
    queryFn: () => listClientsFn({ data: { brandId: currentBrand } }),
    enabled: !!currentBrand,
  });
  const projectsQ = useQuery({
    queryKey: ["service-projects", currentBrand],
    queryFn: () => listProjectsFn({ data: { brandId: currentBrand } }),
    enabled: !!currentBrand,
  });
  const overviewQ = useQuery({
    queryKey: ["service-overview", currentBrand],
    queryFn: () => overviewFn({ data: { brandId: currentBrand } }),
    enabled: !!currentBrand,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["service-clients", currentBrand] });
    qc.invalidateQueries({ queryKey: ["service-projects", currentBrand] });
    qc.invalidateQueries({ queryKey: ["service-overview", currentBrand] });
  };

  if (serviceBrands.length === 0) {
    return (
      <div className="p-6 md:p-8">
        <Card className="p-8 text-center card-gradient">
          <Briefcase className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-bold mb-2">
            {T("لا توجد براندات خدمات", "No service brands")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {T(
              'أضف براندًا من نوع "خدمات" من صفحة البراندات أولاً.',
              'Add a brand of type "Services" from the Brands page first.',
            )}
          </p>
        </Card>
      </div>
    );
  }

  const kpis = overviewQ.data?.kpis;
  const perClient = overviewQ.data?.perClient ?? {};

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Briefcase className="w-7 h-7 text-primary" /> {T("براندات الخدمات", "Service Brands")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "عملاء ومشاريع، بدون موردين أو مخزون.",
              "Clients and projects, no suppliers or inventory.",
            )}
          </p>
        </div>
        <Select value={currentBrand} onValueChange={setBrandId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder={T("اختر البراند", "Select brand")} />
          </SelectTrigger>
          <SelectContent>
            {serviceBrands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={DollarSign}
          label={T("الإيرادات", "Revenue")}
          value={fmt(kpis?.totalRevenue ?? 0)}
          sub={T(
            `مشاريع: ${fmt(kpis?.projectsRevenue ?? 0)}`,
            `Projects: ${fmt(kpis?.projectsRevenue ?? 0)}`,
          )}
        />
        <KpiCard
          icon={TrendingDown}
          label={T("المصروفات", "Expenses")}
          value={fmt(kpis?.totalExpenses ?? 0)}
          tone="danger"
        />
        <KpiCard
          icon={Megaphone}
          label={T("التسويق", "Marketing")}
          value={fmt(kpis?.marketing ?? 0)}
        />
        <KpiCard icon={Users} label={T("الرواتب", "Salaries")} value={fmt(kpis?.salaries ?? 0)} />
        <KpiCard
          icon={PiggyBank}
          label={T("الأرباح", "Profit")}
          value={fmt(kpis?.profit ?? 0)}
          tone={(kpis?.profit ?? 0) >= 0 ? "success" : "danger"}
        />
        <KpiCard
          icon={CheckCircle2}
          label={T("عملاء نشطون", "Active Clients")}
          value={fmt(kpis?.activeClients ?? 0)}
          sub={T(
            `غير نشط: ${fmt(kpis?.inactiveClients ?? 0)}`,
            `Inactive: ${fmt(kpis?.inactiveClients ?? 0)}`,
          )}
          tone="success"
        />
        <KpiCard
          icon={Briefcase}
          label={T("إجمالي المشاريع", "Total Projects")}
          value={fmt(kpis?.totalProjects ?? 0)}
          sub={T(
            `مكتمل: ${fmt(kpis?.doneProjects ?? 0)}`,
            `Completed: ${fmt(kpis?.doneProjects ?? 0)}`,
          )}
        />
        <KpiCard
          icon={Users}
          label={T("إجمالي العملاء", "Total Clients")}
          value={fmt(kpis?.totalClients ?? 0)}
        />
      </div>

      {/* Clients */}
      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4" /> {T("العملاء", "Clients")}
          </div>
          <ClientDialog brandId={currentBrand} onSaved={invalidate} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-right text-muted-foreground border-b border-border">
                <th className="p-3">{T("الاسم", "Name")}</th>
                <th className="p-3">{T("جهة الاتصال", "Contact")}</th>
                <th className="p-3">{T("الحالة", "Status")}</th>
                <th className="p-3">{T("المشاريع", "Projects")}</th>
                <th className="p-3">{T("القيمة", "Value")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(clientsQ.data ?? []).map((c) => {
                const s = perClient[c.id];
                return (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 text-muted-foreground" dir="ltr">
                      {c.contact ?? "—"}
                    </td>
                    <td className="p-3">
                      {c.status === "active" ? (
                        <Badge>{T("نشط", "Active")}</Badge>
                      ) : (
                        <Badge variant="secondary">{T("غير نشط", "Inactive")}</Badge>
                      )}
                    </td>
                    <td className="p-3 num">
                      {s
                        ? T(
                            `${s.total} (تم ${s.done}${s.in_progress ? ` / جارٍ ${s.in_progress}` : ""})`,
                            `${s.total} (Done ${s.done}${s.in_progress ? ` / In Progress ${s.in_progress}` : ""})`,
                          )
                        : "0"}
                    </td>
                    <td className="p-3 num">{s ? fmt(s.value) : "0"}</td>
                    <td className="p-3 text-left whitespace-nowrap">
                      <ClientDialog brandId={currentBrand} onSaved={invalidate} existing={c} />
                      <DeleteBtn
                        label={T("حذف العميل؟", "Delete client?")}
                        onConfirm={async () => {
                          try {
                            await useServerFnWrap(deleteServiceClient)({ data: { id: c.id } });
                            toast.success(T("حُذف", "Deleted"));
                            invalidate();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : T("فشل", "Failed"));
                          }
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
              {(clientsQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                    {T("لا عملاء بعد.", "No clients yet.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Projects */}
      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="font-semibold flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> {T("المشاريع", "Projects")}
          </div>
          <ProjectDialog
            brandId={currentBrand}
            clients={clientsQ.data ?? []}
            onSaved={invalidate}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-right text-muted-foreground border-b border-border">
                <th className="p-3">{T("المشروع", "Project")}</th>
                <th className="p-3">{T("العميل", "Client")}</th>
                <th className="p-3">{T("الحالة", "Status")}</th>
                <th className="p-3">{T("التسعير", "Pricing")}</th>
                <th className="p-3">{T("القيمة", "Value")}</th>
                <th className="p-3">{T("التاريخ", "Date")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(projectsQ.data ?? []).map((p) => {
                const client = (clientsQ.data ?? []).find((c) => c.id === p.client_id);
                const value = p.pricing_type === "commission" ? p.commission : p.cost;
                return (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3">{client?.name ?? "—"}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          p.status === "done"
                            ? "default"
                            : p.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {lang === "ar" ? STATUS_LABEL[p.status]?.ar : STATUS_LABEL[p.status]?.en}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {p.pricing_type === "commission"
                        ? T("عمولة", "Commission")
                        : T("ثابت", "Fixed")}
                    </td>
                    <td className="p-3 num">{fmt(Number(value ?? 0))}</td>
                    <td className="p-3 text-muted-foreground text-xs" dir="ltr">
                      {p.started_at ?? "—"}
                      {p.finished_at ? ` → ${p.finished_at}` : ""}
                    </td>
                    <td className="p-3 text-left whitespace-nowrap">
                      <ProjectDialog
                        brandId={currentBrand}
                        clients={clientsQ.data ?? []}
                        onSaved={invalidate}
                        existing={p}
                      />
                      <DeleteBtn
                        label={T("حذف المشروع؟", "Delete project?")}
                        onConfirm={async () => {
                          try {
                            await useServerFnWrap(deleteServiceProject)({ data: { id: p.id } });
                            toast.success(T("حُذف", "Deleted"));
                            invalidate();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : T("فشل", "Failed"));
                          }
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
              {(projectsQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                    {T("لا مشاريع بعد.", "No projects yet.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// helper to invoke server fn imperatively inside handlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useServerFnWrap<T extends (...args: any[]) => any>(fn: T): T {
  return fn;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "danger";
}) {
  const color =
    tone === "success" ? "text-emerald-500" : tone === "danger" ? "text-red-500" : "text-primary";
  return (
    <Card className="card-gradient p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`w-4 h-4 ${color}`} /> {label}
      </div>
      <div className={`text-2xl font-bold mt-1 num ${tone === "danger" ? "text-red-500" : ""}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function DeleteBtn({ label, onConfirm }: { label: string; onConfirm: () => void | Promise<void> }) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>
            {T("لا يمكن التراجع عن هذا الإجراء.", "This action cannot be undone.")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{T("إلغاء", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {T("تأكيد الحذف", "Confirm Delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ClientDialog({
  brandId,
  onSaved,
  existing,
}: {
  brandId: string;
  onSaved: () => void;
  existing?: ServiceClient;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [open, setOpen] = useState(false);
  const save = useServerFn(upsertServiceClient);
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    contact: existing?.contact ?? "",
    status: (existing?.status ?? "active") as "active" | "inactive",
    notes: existing?.notes ?? "",
  });
  const submit = async () => {
    if (!form.name.trim()) return toast.error(T("الاسم مطلوب", "Name is required"));
    try {
      await save({
        data: {
          id: existing?.id,
          brand_id: brandId,
          name: form.name,
          contact: form.contact || null,
          status: form.status,
          notes: form.notes || null,
        },
      });
      toast.success(T("تم الحفظ", "Saved"));
      onSaved();
      setOpen(false);
      if (!existing) setForm({ name: "", contact: "", status: "active", notes: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : T("فشل", "Failed"));
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant={existing ? "ghost" : "default"}
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        {existing ? (
          <Pencil className="w-4 h-4" />
        ) : (
          <>
            <Plus className="w-4 h-4" /> {T("عميل جديد", "New Client")}
          </>
        )}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? T("تعديل عميل", "Edit Client") : T("عميل جديد", "New Client")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{T("الاسم", "Name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>{T("جهة اتصال (تليفون/إيميل)", "Contact (phone/email)")}</Label>
            <Input
              dir="ltr"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
            />
          </div>
          <div>
            <Label>{T("الحالة", "Status")}</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{T("نشط", "Active")}</SelectItem>
                <SelectItem value="inactive">{T("غير نشط", "Inactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{T("ملاحظات", "Notes")}</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>{T("حفظ", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDialog({
  brandId,
  clients,
  onSaved,
  existing,
}: {
  brandId: string;
  clients: ServiceClient[];
  onSaved: () => void;
  existing?: ServiceProject;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [open, setOpen] = useState(false);
  const save = useServerFn(upsertServiceProject);
  const [form, setForm] = useState({
    client_id: existing?.client_id ?? "",
    name: existing?.name ?? "",
    status: (existing?.status ?? "in_progress") as ServiceProject["status"],
    pricing_type: (existing?.pricing_type ?? "fixed") as ServiceProject["pricing_type"],
    cost: existing?.cost ?? 0,
    commission: existing?.commission ?? 0,
    started_at: existing?.started_at ?? "",
    finished_at: existing?.finished_at ?? "",
    note: existing?.note ?? "",
  });
  const submit = async () => {
    if (!form.client_id) return toast.error(T("اختر العميل", "Select the client"));
    if (!form.name.trim()) return toast.error(T("اسم المشروع مطلوب", "Project name is required"));
    try {
      await save({
        data: {
          id: existing?.id,
          brand_id: brandId,
          client_id: form.client_id,
          name: form.name,
          status: form.status,
          pricing_type: form.pricing_type,
          cost: Number(form.cost) || 0,
          commission: Number(form.commission) || 0,
          started_at: form.started_at || null,
          finished_at: form.finished_at || null,
          note: form.note || null,
        },
      });
      toast.success(T("تم الحفظ", "Saved"));
      onSaved();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : T("فشل", "Failed"));
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant={existing ? "ghost" : "default"}
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        {existing ? (
          <Pencil className="w-4 h-4" />
        ) : (
          <>
            <Plus className="w-4 h-4" /> {T("مشروع جديد", "New Project")}
          </>
        )}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? T("تعديل مشروع", "Edit Project") : T("مشروع جديد", "New Project")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{T("العميل", "Client")}</Label>
            <Select
              value={form.client_id}
              onValueChange={(v) => setForm({ ...form, client_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={T("اختر العميل", "Select client")} />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{T("اسم المشروع", "Project Name")}</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{T("الحالة", "Status")}</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as ServiceProject["status"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{T("قيد الانتظار", "Pending")}</SelectItem>
                  <SelectItem value="in_progress">{T("جارٍ", "In Progress")}</SelectItem>
                  <SelectItem value="done">{T("تم", "Done")}</SelectItem>
                  <SelectItem value="cancelled">{T("ملغي", "Cancelled")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{T("نوع التسعير", "Pricing Type")}</Label>
              <Select
                value={form.pricing_type}
                onValueChange={(v) =>
                  setForm({ ...form, pricing_type: v as ServiceProject["pricing_type"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">{T("تكلفة ثابتة", "Fixed Cost")}</SelectItem>
                  <SelectItem value="commission">{T("عمولة", "Commission")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{T("التكلفة", "Cost")}</Label>
              <Input
                type="number"
                dir="ltr"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>{T("العمولة", "Commission")}</Label>
              <Input
                type="number"
                dir="ltr"
                value={form.commission}
                onChange={(e) => setForm({ ...form, commission: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{T("البدء", "Start")}</Label>
              <Input
                type="date"
                dir="ltr"
                value={form.started_at ?? ""}
                onChange={(e) => setForm({ ...form, started_at: e.target.value })}
              />
            </div>
            <div>
              <Label>{T("الانتهاء", "Finish")}</Label>
              <Input
                type="date"
                dir="ltr"
                value={form.finished_at ?? ""}
                onChange={(e) => setForm({ ...form, finished_at: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>{T("ملاحظة", "Note")}</Label>
            <Input
              value={form.note ?? ""}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit}>{T("حفظ", "Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
