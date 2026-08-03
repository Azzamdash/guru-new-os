import { tr } from "@/lib/i18n";
import { createFileRoute, useSearch, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { SdCard } from "@/components/sd/SdCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, FileText, MessageSquare, GitPullRequest, Lock, ListTodo, Info as InfoIcon, ExternalLink } from "lucide-react";
import {
  getSdProject, upsertSdProject, createInvoiceFromProject,
  listProjectTasks, upsertProjectTask, deleteProjectTask,
  listProjectFiles, attachProjectFile, deleteProjectFile,
  listProjectComments, addProjectComment,
  listProjectRevisions, upsertProjectRevision,
  listPrivateNotes, addPrivateNote, deletePrivateNote,
} from "@/lib/servicesDashboard.functions";

export const Route = createFileRoute("/_authenticated/_app/services-dashboard/projects/$id")({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const s = useSearch({ from: "/_authenticated/_app/services-dashboard" });
  const qc = useQueryClient();
  const getFn = useServerFn(getSdProject);
  const upsertFn = useServerFn(upsertSdProject);
  const invoiceFn = useServerFn(createInvoiceFromProject);
  const [invOpen, setInvOpen] = useState(false);
  const [invTotal, setInvTotal] = useState<number>(0);
  const [invId, setInvId] = useState<string | null>(null);
  const projQ = useQuery({ queryKey: ["sd-project", id], queryFn: () => getFn({ data: { id } }) });
  const p = projQ.data;

  if (!p) return <SdCard>Loading…</SdCard>;

  const updateStatus = async (status: string) => {
    try { await upsertFn({ data: { ...p, status } }); toast.success("Updated"); qc.invalidateQueries({ queryKey: ["sd-project", id] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const updateProgress = async (pct: number) => {
    try { await upsertFn({ data: { ...p, progress_pct: pct } }); qc.invalidateQueries({ queryKey: ["sd-project", id] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/services-dashboard/projects" search={{ brandId: s.brandId, period: s.period, from: s.from, to: s.to }}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Projects
        </Link>
        <Dialog open={invOpen} onOpenChange={(o) => { setInvOpen(o); if (o) { setInvTotal(Number(p.cost) || 0); setInvId(null); } }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">{tr("إنشاء فاتورة من المشروع")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("إنشاء فاتورة من المشروع")}</DialogTitle>
            </DialogHeader>
            {invId ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{tr("تم إنشاء الفاتورة بنجاح.")}</p>
                <a
                  href={`/invoice-print?ids=${invId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-4 h-4" /> {tr("عرض / طباعة الفاتورة")}
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">{tr("البراند")}</Label>
                  <div className="text-sm mt-1">{p.brand_id}</div>
                </div>
                <div>
                  <Label className="text-xs">{tr("العميل")}</Label>
                  <div className="text-sm mt-1">{p.service_clients?.name ?? "—"}</div>
                </div>
                <div>
                  <Label className="text-xs">{tr("إجمالي الفاتورة")}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={invTotal}
                    onChange={(e) => setInvTotal(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              {invId ? (
                <Button onClick={() => setInvOpen(false)}>{tr("إغلاق")}</Button>
              ) : (
                <Button
                  onClick={async () => {
                    try {
                      const res = await invoiceFn({ data: { projectId: id, totalAmount: invTotal } });
                      setInvId(res.invoiceId);
                      qc.invalidateQueries({ queryKey: ["sd-project", id] });
                      toast.success(tr("تم إنشاء الفاتورة"));
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : tr("فشل الإنشاء"));
                    }
                  }}
                >
                  {tr("إنشاء")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <SdCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold">{p.name}</h2>
            <div className="text-sm text-muted-foreground mt-1">Client: {p.service_clients?.name ?? "—"}</div>
            {p.description && <p className="text-sm mt-2 text-muted-foreground max-w-2xl">{p.description}</p>}
          </div>
          <div className="flex flex-col gap-2 min-w-[220px]">
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20">Status</Label>
              <Select value={p.status} onValueChange={updateStatus}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending","in_progress","review","done","cancelled"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs w-20">Progress</Label>
              <Input type="number" min={0} max={100} value={p.progress_pct}
                     onChange={(e) => updateProgress(Number(e.target.value))} className="h-8" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {p.deadline && <Badge variant="outline">⏰ {p.deadline}</Badge>}
              {p.priority && p.priority !== "normal" && <Badge>{p.priority}</Badge>}
            </div>
          </div>
        </div>
      </SdCard>

      <Tabs defaultValue="tasks">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"><InfoIcon className="w-4 h-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="tasks"><ListTodo className="w-4 h-4 mr-1" />Tasks</TabsTrigger>
          <TabsTrigger value="files"><FileText className="w-4 h-4 mr-1" />Files</TabsTrigger>
          <TabsTrigger value="comments"><MessageSquare className="w-4 h-4 mr-1" />Comments</TabsTrigger>
          <TabsTrigger value="revisions"><GitPullRequest className="w-4 h-4 mr-1" />Revisions</TabsTrigger>
          <TabsTrigger value="private"><Lock className="w-4 h-4 mr-1" />Private PM</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab p={p} /></TabsContent>
        <TabsContent value="tasks"><TasksTab projectId={id} /></TabsContent>
        <TabsContent value="files"><FilesTab projectId={id} /></TabsContent>
        <TabsContent value="comments"><CommentsTab projectId={id} /></TabsContent>
        <TabsContent value="revisions"><RevisionsTab projectId={id} /></TabsContent>
        <TabsContent value="private"><PrivateTab projectId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OverviewTab({ p }: { p: any }) {
  return (
    <SdCard>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Field label="Status" value={p.status} />
        <Field label="Priority" value={p.priority ?? "normal"} />
        <Field label="Deadline" value={p.deadline ?? "—"} />
        <Field label="Progress" value={`${p.progress_pct}%`} />
        <Field label="Pricing" value={p.pricing_type} />
        <Field label="Cost" value={String(p.cost)} />
        <Field label="Commission" value={String(p.commission)} />
        <Field label="Started" value={p.started_at ?? "—"} />
      </div>
    </SdCard>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}

function TasksTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectTasks);
  const upFn = useServerFn(upsertProjectTask);
  const delFn = useServerFn(deleteProjectTask);
  const q = useQuery({ queryKey: ["proj-tasks", projectId], queryFn: () => listFn({ data: { projectId } }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["proj-tasks", projectId] });
  const [title, setTitle] = useState("");

  const add = async () => {
    if (!title.trim()) return;
    try { await upFn({ data: { project_id: projectId, title } }); setTitle(""); invalidate(); } catch (e) { toast.error(String(e)); }
  };

  return (
    <SdCard>
      <div className="flex gap-2 mb-3">
        <Input placeholder="New task title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button onClick={add}><Plus className="w-4 h-4" /></Button>
      </div>
      <div className="space-y-2">
        {(q.data ?? []).map((t: { id: string; title: string; status: string; due_date: string | null }) => (
          <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
            <Select value={t.status} onValueChange={async (v) => { await upFn({ data: { ...t, status: v } }); invalidate(); }}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["todo","in_progress","review","done"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex-1 text-sm">{t.title}</div>
            {t.due_date && <Badge variant="outline">{t.due_date}</Badge>}
            <Button size="sm" variant="ghost" onClick={async () => { await delFn({ data: { id: t.id } }); invalidate(); }}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
        {q.data?.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No tasks yet.</div>}
      </div>
    </SdCard>
  );
}

function FilesTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectFiles);
  const attachFn = useServerFn(attachProjectFile);
  const delFn = useServerFn(deleteProjectFile);
  const q = useQuery({ queryKey: ["proj-files", projectId], queryFn: () => listFn({ data: { projectId } }) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["proj-files", projectId] });

  const submit = async () => {
    if (!form.url) return toast.error("URL required");
    try { await attachFn({ data: { project_id: projectId, name: form.name || form.url, url: form.url } }); setOpen(false); setForm({ name: "", url: "" }); invalidate(); toast.success("Attached"); }
    catch (e) { toast.error(String(e)); }
  };

  return (
    <SdCard>
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-muted-foreground">Paste any URL — Google Drive/Docs links are auto-detected.</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Attach</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Attach File / Link</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name (optional)</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>URL *</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://drive.google.com/…" /></div>
            </div>
            <DialogFooter><Button onClick={submit}>Attach</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-2">
        {(q.data ?? []).map((f: { id: string; name: string; url: string; source: string }) => (
          <div key={f.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
            <Badge variant="outline">{f.source}</Badge>
            <a href={f.url} target="_blank" rel="noreferrer" className="flex-1 text-sm truncate hover:underline">{f.name}</a>
            <a href={f.url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
            <Button size="sm" variant="ghost" onClick={async () => { await delFn({ data: { id: f.id } }); invalidate(); }}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        ))}
        {q.data?.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No files attached.</div>}
      </div>
    </SdCard>
  );
}

function CommentsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectComments);
  const addFn = useServerFn(addProjectComment);
  const q = useQuery({ queryKey: ["proj-comments", projectId], queryFn: () => listFn({ data: { projectId } }) });
  const [body, setBody] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["proj-comments", projectId] });

  const submit = async () => {
    if (!body.trim()) return;
    try { await addFn({ data: { project_id: projectId, body } }); setBody(""); invalidate(); }
    catch (e) { toast.error(String(e)); }
  };
  return (
    <SdCard>
      <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto">
        {(q.data ?? []).map((c: { id: string; body: string; author_id: string | null; created_at: string }) => (
          <div key={c.id} className="p-3 rounded-xl bg-muted/40">
            <div className="text-[10px] text-muted-foreground mb-1">{(c.author_id ?? "").slice(0,8)} • {new Date(c.created_at).toLocaleString("en-US")}</div>
            <div className="text-sm whitespace-pre-wrap">{c.body}</div>
          </div>
        ))}
        {q.data?.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">Be the first to comment.</div>}
      </div>
      <div className="flex gap-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" />
        <Button onClick={submit}>Send</Button>
      </div>
    </SdCard>
  );
}

function RevisionsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjectRevisions);
  const upFn = useServerFn(upsertProjectRevision);
  const q = useQuery({ queryKey: ["proj-revs", projectId], queryFn: () => listFn({ data: { projectId } }) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["proj-revs", projectId] });
  const submit = async () => {
    if (!form.title) return toast.error("Title required");
    try { await upFn({ data: { project_id: projectId, ...form } }); setOpen(false); setForm({ title: "", body: "" }); invalidate(); }
    catch (e) { toast.error(String(e)); }
  };

  return (
    <SdCard>
      <div className="flex justify-end mb-3">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-2" />Request Revision</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Revision</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Details</Label><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={submit}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {(q.data ?? []).map((r: { id: string; title: string; body: string | null; status: string; created_at: string }) => (
          <div key={r.id} className="p-3 rounded-xl bg-muted/40">
            <div className="flex items-center justify-between mb-1">
              <div className="font-medium text-sm">{r.title}</div>
              <Select value={r.status} onValueChange={async (v) => { await upFn({ data: { ...r, project_id: projectId, status: v } }); invalidate(); }}>
                <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>{["open","addressed","rejected"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {r.body && <div className="text-sm text-muted-foreground whitespace-pre-wrap">{r.body}</div>}
          </div>
        ))}
        {q.data?.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No revisions.</div>}
      </div>
    </SdCard>
  );
}

function PrivateTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPrivateNotes);
  const addFn = useServerFn(addPrivateNote);
  const delFn = useServerFn(deletePrivateNote);
  const q = useQuery({ queryKey: ["proj-priv", projectId], queryFn: () => listFn({ data: { projectId } }) });
  const [body, setBody] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["proj-priv", projectId] });
  const submit = async () => {
    if (!body.trim()) return;
    try { await addFn({ data: { project_id: projectId, body } }); setBody(""); invalidate(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Forbidden"); }
  };

  return (
    <SdCard className="border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center gap-2 mb-3">
        <Lock className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-sm">Private PM Section</h3>
        <Badge variant="outline" className="text-[10px]">Only PM + Admin/Manager</Badge>
      </div>
      <div className="text-xs text-muted-foreground mb-3">Internal notes, client feedback, blockers, follow-ups — not visible to the team.</div>
      <div className="space-y-2 mb-4 max-h-[350px] overflow-y-auto">
        {(q.data ?? []).map((n: { id: string; body: string; created_at: string; author_id: string | null }) => (
          <div key={n.id} className="p-3 rounded-xl bg-background/60 border border-amber-500/20">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("en-US")}</div>
              <Button size="sm" variant="ghost" onClick={async () => { await delFn({ data: { id: n.id } }); invalidate(); }}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
            <div className="text-sm whitespace-pre-wrap">{n.body}</div>
          </div>
        ))}
        {q.data?.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">No private notes.</div>}
      </div>
      <div className="flex gap-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Private note (only PM + admins see this)…" />
        <Button onClick={submit}>Save</Button>
      </div>
    </SdCard>
  );
}