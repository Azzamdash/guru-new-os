import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { KanbanBoard } from "@/components/pages/KanbanBoard";
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
import { CheckSquare, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { listTasks, upsertTask, deleteTask, updateTaskStatus } from "@/lib/tasks.functions";
import { listUsers } from "@/lib/admin.functions";
import { listBrands } from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
import { useLang, tr } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/tasks")({
  head: () => ({ meta: [
    { title: tr("المهام — e-GURUS") },
    { name: "description", content: "إدارة المهام وتعيينها للفريق." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: TasksPage,
});

type Task = {
  id: string; title: string; description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "low" | "medium" | "high";
  due_date: string | null; assignee_id: string | null; created_by: string | null;
  brand_id: string | null; notes: string | null;
};

const STATUS_KEY: Record<Task["status"], string> = { todo: "status_todo", in_progress: "status_in_progress", done: "status_done" };
const PRIORITY_KEY: Record<Task["priority"], string> = { low: "priority_low", medium: "priority_medium", high: "priority_high" };
const PRIORITY_STYLE: Record<Task["priority"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/15 text-blue-500",
  high: "bg-red-500/15 text-red-500",
};

function TasksPage() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const usersFn = useServerFn(listUsers);
  const brandsFn = useServerFn(listBrands);
  const roleFn = useServerFn(getMyRole);
  const statusFn = useServerFn(updateTaskStatus);
  const delFn = useServerFn(deleteTask);

  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => roleFn() });
  const canManage = !!(roleQ.data?.isAdmin || roleQ.data?.isManager);

  const tasksQ = useQuery({ queryKey: ["tasks"], queryFn: () => listFn() });
  const usersQ = useQuery({ queryKey: ["admin-users"], queryFn: () => usersFn(), enabled: canManage });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });

  const userLabel = (id: string | null) => usersQ.data?.find((u) => u.id === id)?.email ?? "—";
  const brandLabel = (id: string | null) => brandsQ.data?.find((b) => b.id === id)?.name ?? "—";

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: Task["status"] }) => statusFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success(t("deleted")); qc.invalidateQueries({ queryKey: ["tasks"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <KanbanBoard
      icon={<CheckSquare className="w-6 h-6" />}
      title={t("tasks_title")}
      subtitle={t("tasks_sub")}
      action={canManage ? <TaskDialog users={usersQ.data ?? []} brands={brandsQ.data ?? []} /> : null}
      columns={(["todo","in_progress","done"] as const).map((col) => ({
        key: col,
        label: t(STATUS_KEY[col]),
        accent: COL_ACCENT[col],
        items: (tasksQ.data ?? []).filter((tk) => tk.status === col),
      }))}
      renderCard={(tk) => (
        <TaskCard
          key={tk.id}
          tk={tk}
          t={t}
          canManage={canManage}
          userLabel={userLabel}
          brandLabel={brandLabel}
          onStatus={(s) => statusMut.mutate({ id: tk.id, status: s })}
          onDelete={() => { if (confirm(t("confirm_delete_task"))) delMut.mutate(tk.id); }}
          editButton={<TaskDialog users={usersQ.data ?? []} brands={brandsQ.data ?? []} task={tk} />}
        />
      )}
      emptyLabel={t("tasks_none")}
    />
  );
}

const COL_ACCENT: Record<Task["status"], string> = {
  todo: "from-slate-500/20 to-slate-500/0 text-slate-300",
  in_progress: "from-primary/25 to-primary/0 text-primary",
  done: "from-emerald-500/20 to-emerald-500/0 text-emerald-400",
};

function TaskCard({ tk, t, canManage, userLabel, brandLabel, onStatus, onDelete, editButton }: {
  tk: Task;
  t: (k: string) => string;
  canManage: boolean;
  userLabel: (id: string | null) => string;
  brandLabel: (id: string | null) => string;
  onStatus: (s: Task["status"]) => void;
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
        <Select value={tk.status} onValueChange={(v) => onStatus(v as Task["status"])}>
          <SelectTrigger className="h-7 text-[11px] w-28 rounded-full bg-muted/30 border-border/40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_KEY) as Task["status"][]).map((s) => (
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

function TaskDialog({
  task, users, brands,
}: {
  task?: Task;
  users: Array<{ id: string; email: string }>;
  brands: Array<{ id: string; name: string }>;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<Task["status"]>(task?.status ?? "todo");
  const [priority, setPriority] = useState<Task["priority"]>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [assigneeId, setAssigneeId] = useState<string>(task?.assignee_id ?? "");
  const [brandId, setBrandId] = useState<string>(task?.brand_id ?? "");
  const qc = useQueryClient();
  const upFn = useServerFn(upsertTask);
  const mut = useMutation({
    mutationFn: () => upFn({ data: {
      id: task?.id, title, description: description || null,
      status, priority,
      due_date: dueDate || null,
      assignee_id: assigneeId || null,
      brand_id: brandId || null,
    }}),
    onSuccess: () => { toast.success(t("saved")); qc.invalidateQueries({ queryKey: ["tasks"] }); setOpen(false); },
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
              <Select value={status} onValueChange={(v) => setStatus(v as Task["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_KEY) as Task["status"][]).map((s) => (
                    <SelectItem key={s} value={s}>{t(STATUS_KEY[s])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("priority")}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Task["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_KEY) as Task["priority"][]).map((p) => (
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
