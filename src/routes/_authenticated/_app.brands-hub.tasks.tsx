import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listBhTasks,
  upsertBhTask,
  setBhTaskStatus,
  deleteBhTask,
  listBhTaskDetail,
  addBhTaskComment,
  addBhTaskAttachment,
  type BhTask,
} from "@/lib/brandhub-tasks.functions";
import { listBhBrands } from "@/lib/brandhub.functions";
import { uploadBhFile } from "@/lib/bh-upload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Paperclip, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/brands-hub/tasks")({
  head: () => ({
    meta: [
      { title: "مهام البراندات — Brands Hub — e-GURUS" },
      { name: "description", content: "لوحة مهام البراندات: تكليفات، أولويات، مرفقات وتعليقات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BhTasksPage,
});

const COLUMNS: { key: BhTask["status"]; label: string }[] = [
  { key: "todo", label: "قيد الانتظار" },
  { key: "in_progress", label: "جاري التنفيذ" },
  { key: "review", label: "مراجعة" },
  { key: "done", label: "مكتملة" },
];

const PRIORITY_TONE: Record<string, string> = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-amber-500/15 text-amber-600",
  low: "bg-muted text-muted-foreground",
};

function BhTasksPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBhTasks);
  const brandsFn = useServerFn(listBhBrands);
  const upsertFn = useServerFn(upsertBhTask);
  const statusFn = useServerFn(setBhTaskStatus);
  const delFn = useServerFn(deleteBhTask);

  const q = useQuery({ queryKey: ["bh-tasks"], queryFn: () => listFn() });
  const brandsQ = useQuery({ queryKey: ["bh-brands"], queryFn: () => brandsFn() });

  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [form, setForm] = useState<Partial<BhTask> & { title: string }>({
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    cadence: "once",
    due_date: null,
    assignee_id: null,
    brand_id: null,
  });

  const tasks = q.data?.tasks ?? [];
  const users = q.data?.users ?? [];
  const brands = brandsQ.data ?? [];
  const emailOf = (id: string | null) => users.find((u) => u.id === id)?.email ?? "غير مُسند";
  const brandOf = (id: string | null) => brands.find((b) => b.id === id)?.name ?? null;

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!filterAssignee || t.assignee_id === filterAssignee) && (!filterBrand || t.brand_id === filterBrand),
      ),
    [tasks, filterAssignee, filterBrand],
  );

  async function save() {
    if (!form.title.trim()) return toast.error("العنوان مطلوب");
    try {
      await upsertFn({
        data: {
          id: form.id,
          title: form.title,
          description: form.description ?? "",
          status: form.status ?? "todo",
          priority: form.priority ?? "medium",
          cadence: form.cadence ?? "once",
          due_date: form.due_date ?? null,
          assignee_id: form.assignee_id ?? null,
          brand_id: form.brand_id ?? null,
        },
      });
      toast.success("تم الحفظ");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["bh-tasks"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/brands-hub">
          <ArrowLeft className="w-4 h-4 me-1" /> Brands Hub
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-extrabold">مهام البراندات</h1>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filterBrand}
            onChange={(e) => setFilterBrand(e.target.value)}
          >
            <option value="">كل البراندات</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
          >
            <option value="">كل المسؤولين</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              setForm({ title: "", description: "", status: "todo", priority: "medium", cadence: "once", due_date: null, assignee_id: null, brand_id: null });
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4 me-1" /> مهمة جديدة
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className="space-y-3">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>{col.label}</span>
              <Badge variant="secondary">{filtered.filter((t) => t.status === col.key).length}</Badge>
            </div>
            {filtered
              .filter((t) => t.status === col.key)
              .map((t) => (
                <Card key={t.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button className="text-start font-medium text-sm" onClick={() => { setForm(t); setOpen(true); }}>
                      {t.title}
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("حذف المهمة؟")) return;
                        await delFn({ data: { id: t.id } });
                        qc.invalidateQueries({ queryKey: ["bh-tasks"] });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <span className={`px-2 py-0.5 rounded-full ${PRIORITY_TONE[t.priority]}`}>{t.priority}</span>
                    {brandOf(t.brand_id) && <Badge variant="outline">{brandOf(t.brand_id)}</Badge>}
                    {t.due_date && <Badge variant="outline">{t.due_date}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{emailOf(t.assignee_id)}</div>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                      value={t.status}
                      onChange={async (e) => {
                        await statusFn({ data: { id: t.id, status: e.target.value as BhTask["status"] } });
                        qc.invalidateQueries({ queryKey: ["bh-tasks"] });
                      }}
                    >
                      {COLUMNS.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="outline" onClick={() => setDetailId(t.id)}>
                      <MessageSquare className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "تعديل مهمة" : "مهمة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>العنوان</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>الوصف</Label>
              <Textarea rows={4} value={form.description ?? ""} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الأولوية</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.priority ?? "medium"}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as BhTask["priority"] }))}
                >
                  <option value="low">منخفضة</option>
                  <option value="medium">متوسطة</option>
                  <option value="high">عالية</option>
                </select>
              </div>
              <div>
                <Label>التكرار</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.cadence ?? "once"}
                  onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value as BhTask["cadence"] }))}
                >
                  <option value="once">مرة واحدة</option>
                  <option value="daily">يومي</option>
                  <option value="weekly">أسبوعي</option>
                  <option value="monthly">شهري</option>
                </select>
              </div>
              <div>
                <Label>تاريخ التسليم</Label>
                <Input type="date" value={form.due_date ?? ""} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value || null }))} />
              </div>
              <div>
                <Label>الحالة</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status ?? "todo"}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as BhTask["status"] }))}
                >
                  {COLUMNS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>البراند</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.brand_id ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, brand_id: e.target.value || null }))}
                >
                  <option value="">— بدون —</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>المسؤول</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.assignee_id ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value || null }))}
                >
                  <option value="">— بدون —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button onClick={save} className="w-full">
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <TaskDetailDialog taskId={detailId} onClose={() => setDetailId(null)} users={users} />
    </div>
  );
}

function TaskDetailDialog({
  taskId,
  onClose,
  users,
}: {
  taskId: string | null;
  onClose: () => void;
  users: { id: string; email: string }[];
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(listBhTaskDetail);
  const commentFn = useServerFn(addBhTaskComment);
  const attachFn = useServerFn(addBhTaskAttachment);
  const [body, setBody] = useState("");
  const q = useQuery({
    queryKey: ["bh-task-detail", taskId],
    queryFn: () => detailFn({ data: { taskId: taskId! } }),
    enabled: !!taskId,
  });

  return (
    <Dialog open={!!taskId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تفاصيل المهمة</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Paperclip className="w-3.5 h-3.5" /> المرفقات
            </Label>
            {(q.data?.attachments ?? []).map((a: { id: string; title: string; signed_url?: string | null; url?: string | null }) => (
              <a
                key={a.id}
                href={a.signed_url ?? a.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-primary underline"
              >
                {a.title}
              </a>
            ))}
            <Input
              type="file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !taskId) return;
                try {
                  const path = await uploadBhFile(file, `tasks/${taskId}`);
                  await attachFn({ data: { taskId, title: file.name, storage_path: path, mime_type: file.type || null } });
                  qc.invalidateQueries({ queryKey: ["bh-task-detail", taskId] });
                  toast.success("تم رفع المرفق");
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>التعليقات</Label>
            {(q.data?.comments ?? []).map((c: { id: string; body: string; author_id: string | null; created_at: string }) => (
              <Card key={c.id} className="p-2 text-sm">
                <div className="text-[11px] text-muted-foreground">
                  {users.find((u) => u.id === c.author_id)?.email ?? "مستخدم"} · {new Date(c.created_at).toLocaleString()}
                </div>
                {c.body}
              </Card>
            ))}
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="اكتب تعليق..." />
            <Button
              size="sm"
              onClick={async () => {
                if (!body.trim() || !taskId) return;
                await commentFn({ data: { taskId, body } });
                setBody("");
                qc.invalidateQueries({ queryKey: ["bh-task-detail", taskId] });
              }}
            >
              إضافة تعليق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
