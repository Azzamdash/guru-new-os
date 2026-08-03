import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
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
import { Factory, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  listProductionTasks, upsertProductionTask, deleteProductionTask, updateProductionTaskStatus,
  type ProductionTask,
} from "@/lib/production-tasks.functions";
import { listUsers } from "@/lib/admin.functions";
import { listBrands } from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
import { useLang, tr } from "@/lib/i18n";
import { KanbanBoard } from "@/components/pages/KanbanBoard";

export const Route = createFileRoute("/_authenticated/_app/production-tasks")({
  head: () => ({ meta: [
    { title: tr("مهام الإنتاج — e-GURUS") },
    { name: "description", content: "توزيع مهام الإنتاج على العمال ومتابعتها." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: ProductionTasksPage,
});

const STATUS_KEY: Record<ProductionTask["status"], string> = {
  todo: "status_todo", in_progress: "status_in_progress", done: "status_done",
};
const PRIORITY_KEY: Record<ProductionTask["priority"], string> = {
  low: "priority_low", medium: "priority_medium", high: "priority_high",
};
const PRIORITY_STYLE: Record<ProductionTask["priority"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/15 text-blue-500",
  high: "bg-red-500/15 text-red-500",
};

const COL_ACCENT: Record<ProductionTask["status"], string> = {
  todo: "from-slate-500/20 to-slate-500/0 text-slate-300",
  in_progress: "from-primary/25 to-primary/0 text-primary",
  done: "from-emerald-500/20 to-emerald-500/0 text-emerald-400",
};

function ProductionTasksPage() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const listFn = useServerFn(listProductionTasks);
  const usersFn = useServerFn(listUsers);
  const brandsFn = useServerFn(listBrands);
  const roleFn = useServerFn(getMyRole);
  const statusFn = useServerFn(updateProductionTaskStatus);
  const delFn = useServerFn(deleteProductionTask);

  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => roleFn() });
  const canManage = !!(
    roleQ.data?.isAdmin ||
    roleQ.data?.isManager ||
    roleQ.data?.roles?.includes("production_manager")
  );

  const tasksQ = useQuery({ queryKey: ["production-tasks"], queryFn: () => listFn() });
  const usersQ = useQuery({ queryKey: ["admin-users"], queryFn: () => usersFn(), enabled: canManage });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });

  const userLabel = (id: string | null) => usersQ.data?.find((u) => u.id === id)?.email ?? "—";
  const brandLabel = (id: string | null) => brandsQ.data?.find((b) => b.id === id)?.name ?? "—";

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: ProductionTask["status"] }) => statusFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["production-tasks"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success(t("deleted")); qc.invalidateQueries({ queryKey: ["production-tasks"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <KanbanBoard
      icon={<Factory className="w-6 h-6" />}
      title={lang === "ar" ? "مهام الإنتاج" : "Production Tasks"}
      subtitle={lang === "ar"
        ? "مدير الإنتاج والمشرف يوزّعون مهام الإنتاج على العمال ويتابعون التنفيذ."
        : "The production manager and supervisor assign production tasks to workers and track progress."}
      action={canManage ? <ProdTaskDialog users={usersQ.data ?? []} brands={brandsQ.data ?? []} /> : null}
      columns={(["todo","in_progress","done"] as const).map((col) => ({
        key: col,
        label: t(STATUS_KEY[col]),
        accent: COL_ACCENT[col],
        items: (tasksQ.data ?? []).filter((tk) => tk.status === col),
      }))}
      renderCard={(tk) => (
        <ProdCard
          key={tk.id}
          tk={tk}
          t={t}
          canManage={canManage}
          userLabel={userLabel}
          brandLabel={brandLabel}
          onStatus={(s) => statusMut.mutate({ id: tk.id, status: s })}
          onDelete={() => { if (confirm(t("confirm_delete_task"))) delMut.mutate(tk.id); }}
          editButton={<ProdTaskDialog users={usersQ.data ?? []} brands={brandsQ.data ?? []} task={tk} />}
        />
      )}
      emptyLabel={t("tasks_none")}
    />
  );
}

function ProdCard({ tk, t, canManage, userLabel, brandLabel, onStatus, onDelete, editButton }: {
  tk: ProductionTask;
  t: (k: string) => string;
  canManage: boolean;
  userLabel: (id: string | null) => string;
  brandLabel: (id: string | null) => string;
  onStatus: (s: ProductionTask["status"]) => void;
  onDelete: () => void;
  editButton: ReactNode;
}) {
  return (
    <div className="group rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 space-y-2 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-sm leading-snug min-w-0">{tk.title}</div>
        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_STYLE[tk.priority]}`}>
          {t(PRIORITY_KEY[tk.priority])}
        </span>
      </div>
      {tk.description && <p className="text-xs text-muted-foreground line-clamp-2">{tk.description}</p>}
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {tk.due_date && (
          <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-muted-foreground num">
            {new Date(tk.due_date).toLocaleDateString("en-US")}
          </span>
        )}
        {tk.brand_id && (
          <span className="rounded-md bg-primary/10 text-primary px-1.5 py-0.5 truncate max-w-[100px]">
            {brandLabel(tk.brand_id)}
          </span>
        )}
        {canManage && tk.assignee_id && (
          <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-muted-foreground truncate max-w-[130px]">
            {userLabel(tk.assignee_id)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 justify-between pt-2 border-t border-border/40">
        <Select value={tk.status} onValueChange={(v) => onStatus(v as ProductionTask["status"])}>
          <SelectTrigger className="h-7 text-[11px] w-28 rounded-full bg-muted/30 border-border/40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_KEY) as ProductionTask["status"][]).map((s) => (
              <SelectItem key={s} value={s}>{t(STATUS_KEY[s])}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {editButton}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProdTaskDialog({
  task, users, brands,
}: {
  task?: ProductionTask;
  users: Array<{ id: string; email: string }>;
  brands: Array<{ id: string; name: string }>;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<ProductionTask["status"]>(task?.status ?? "todo");
  const [priority, setPriority] = useState<ProductionTask["priority"]>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(task?.assignee_id ?? "");
  const [brandId, setBrandId] = useState<string>(task?.brand_id ?? "");
  const qc = useQueryClient();
  const upFn = useServerFn(upsertProductionTask);
  const mut = useMutation({
    mutationFn: () => upFn({ data: {
      id: task?.id, title, description: description || null,
      status, priority,
      due_date: dueDate || null,
      assignee_id: assigneeId || null,
      brand_id: brandId || null,
    }}),
    onSuccess: () => { toast.success(t("saved")); qc.invalidateQueries({ queryKey: ["production-tasks"] }); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {task
          ? <Button size="icon" variant="ghost" className="h-7 w-7"><Pencil className="w-3.5 h-3.5" /></Button>
          : <Button><Plus className="w-4 h-4 me-2" />{t("tasks_new")}</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{task ? t("tasks_edit") : t("tasks_new")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t("title_label")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>{t("description")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t("status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProductionTask["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_KEY) as ProductionTask["status"][]).map((s) => (
                    <SelectItem key={s} value={s}>{t(STATUS_KEY[s])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("priority")}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as ProductionTask["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_KEY) as ProductionTask["priority"][]).map((p) => (
                    <SelectItem key={p} value={p}>{t(PRIORITY_KEY[p])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>{t("due_date")}</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          <div>
            <Label>{t("assignee")}</Label>
            <Select value={assigneeId || "__none"} onValueChange={(v) => setAssigneeId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("none")}</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("brand")}</Label>
            <Select value={brandId || "__none"} onValueChange={(v) => setBrandId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">{t("general")}</SelectItem>
                {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button onClick={() => mut.mutate()} disabled={!title || mut.isPending}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}