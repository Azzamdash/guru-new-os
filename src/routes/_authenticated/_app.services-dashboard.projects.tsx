import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { SdCard, periodToRange } from "@/components/sd/SdCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ExternalLink } from "lucide-react";
import { listSdProjects, upsertSdProject } from "@/lib/servicesDashboard.functions";
import { listServiceClients, upsertServiceClient } from "@/lib/services.functions";
import { listBrands } from "@/lib/internal.functions";

export const Route = createFileRoute("/_authenticated/_app/services-dashboard/projects")({
  component: ProjectsPage,
});

const STATUSES = ["pending", "in_progress", "review", "done", "cancelled"] as const;
const STATUS_LABEL: Record<string, string> = { pending: "Pending", in_progress: "In Progress", review: "Review", done: "Done", cancelled: "Cancelled" };
const STATUS_TONE: Record<string, string> = {
  pending: "bg-muted", in_progress: "bg-blue-500/20 border-blue-500/40",
  review: "bg-amber-500/20 border-amber-500/40", done: "bg-emerald-500/20 border-emerald-500/40",
  cancelled: "bg-rose-500/20 border-rose-500/40",
};

function ProjectsPage() {
  const s = useSearch({ from: "/_authenticated/_app/services-dashboard" });
  const { from, to } = periodToRange(s.period ?? "month", s.from, s.to);
  const qc = useQueryClient();
  const listFn = useServerFn(listSdProjects);
  const q = useQuery({
    queryKey: ["sd-projects", s.brandId, from, to],
    queryFn: () => listFn({ data: { brandId: s.brandId ?? null, dateFrom: from, dateTo: to } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sd-projects"] });
  const grouped = STATUSES.map((st) => ({ status: st, items: (q.data ?? []).filter((p: { status: string }) => p.status === st) }));

  return (
    <div className="grid gap-4">
      <div className="flex justify-end gap-2">
        <ClientDialog brandId={s.brandId ?? ""} onSaved={() => qc.invalidateQueries({ queryKey: ["service-clients"] })}>
          <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-2" />New Client</Button>
        </ClientDialog>
        <ProjectDialog brandId={s.brandId ?? ""} onSaved={invalidate}>
          <Button size="sm"><Plus className="w-4 h-4 mr-2" />New Project</Button>
        </ProjectDialog>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {grouped.map((g) => (
          <SdCard key={g.status} className={`!p-3 border-l-4 ${STATUS_TONE[g.status]}`}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm">{STATUS_LABEL[g.status]}</h4>
              <Badge variant="outline">{g.items.length}</Badge>
            </div>
            <div className="space-y-2 max-h-[65vh] overflow-y-auto">
              {g.items.map((p) => (
                <div key={p.id} className="p-3 rounded-xl bg-background/60 border border-border/40 hover:border-primary/50 transition space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link to="/services-dashboard/projects/$id" params={{ id: p.id }}
                          search={{ brandId: s.brandId, period: s.period, from: s.from, to: s.to }}
                          className="font-medium text-sm leading-tight flex-1 hover:underline">{p.name}</Link>
                    <Link to="/services-dashboard/projects/$id" params={{ id: p.id }}
                          search={{ brandId: s.brandId, period: s.period, from: s.from, to: s.to }}>
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </Link>
                  </div>
                  {p.service_clients?.name && <div className="text-xs text-muted-foreground">{p.service_clients.name}</div>}
                  <div className="flex items-center gap-2 flex-wrap">
                    {p.deadline && <Badge variant="outline" className="text-[10px]">⏰ {p.deadline}</Badge>}
                    {p.priority && p.priority !== "normal" && <Badge className="text-[10px]">{p.priority}</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{p.progress_pct}%</Badge>
                  </div>
                  <InlineStatusSelect project={p} onChanged={invalidate} />
                </div>
              ))}
              {g.items.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">—</div>}
            </div>
          </SdCard>
        ))}
      </div>
    </div>
  );
}

function InlineStatusSelect({ project, onChanged }: { project: { id: string; status: string; [k: string]: unknown }; onChanged: () => void }) {
  const upsertFn = useServerFn(upsertSdProject);
  const change = async (v: string) => {
    try {
      // Only send scalar columns; strip joined relations like service_clients
      await upsertFn({ data: { id: project.id, status: v } });
      toast.success("Status updated");
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  return (
    <Select value={project.status} onValueChange={change}>
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{STATUSES.map((v) => <SelectItem key={v} value={v}>{STATUS_LABEL[v]}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function ProjectDialog({ brandId, onSaved, children }: { brandId: string; onSaved: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", brand_id: brandId, client_id: "", status: "pending", priority: "normal",
    deadline: "", pricing_type: "fixed" as "fixed" | "commission", cost: 0, commission: 0, description: "",
  });
  const listBrandsFn = useServerFn(listBrands);
  const listClientsFn = useServerFn(listServiceClients);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn(), enabled: open });
  const clientsQ = useQuery({
    queryKey: ["service-clients", form.brand_id], enabled: open && !!form.brand_id,
    queryFn: () => listClientsFn({ data: { brandId: form.brand_id } }),
  });
  const save = useServerFn(upsertSdProject);
  const brands = (brandsQ.data ?? []).filter((b) => b.type === "service" && b.active);

  const submit = async () => {
    if (!form.name || !form.brand_id || !form.client_id) return toast.error("Fill required fields");
    try {
      await save({ data: { ...form, deadline: form.deadline || null } });
      toast.success("Saved");
      setOpen(false);
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Brand *</Label>
              <Select value={form.brand_id} onValueChange={(v) => setForm({ ...form, brand_id: v, client_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Client *</Label>
              <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })} disabled={!form.brand_id}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{(clientsQ.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((v) => <SelectItem key={v} value={v}>{STATUS_LABEL[v]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["low","normal","high","urgent"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Deadline</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Pricing</Label>
              <Select value={form.pricing_type} onValueChange={(v) => setForm({ ...form, pricing_type: v as "fixed" | "commission" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="fixed">Fixed</SelectItem><SelectItem value="commission">Commission</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Cost</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></div>
            <div><Label>Commission</Label><Input type="number" value={form.commission} onChange={(e) => setForm({ ...form, commission: Number(e.target.value) })} /></div>
          </div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientDialog({ brandId, onSaved, children }: { brandId: string; onSaved: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; brand_id: string; contact: string; status: "active" | "inactive"; notes: string }>({ name: "", brand_id: brandId, contact: "", status: "active", notes: "" });
  const listBrandsFn = useServerFn(listBrands);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn(), enabled: open });
  const save = useServerFn(upsertServiceClient);
  const brands = (brandsQ.data ?? []).filter((b) => b.type === "service" && b.active);

  const submit = async () => {
    if (!form.name || !form.brand_id) return toast.error("Fill required fields");
    try {
      await save({ data: { ...form, contact: form.contact || null, notes: form.notes || null } });
      toast.success("Client created");
      setOpen(false);
      setForm({ name: "", brand_id: brandId, contact: "", status: "active", notes: "" });
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Brand *</Label>
            <Select value={form.brand_id} onValueChange={(v) => setForm({ ...form, brand_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
              <SelectContent>{brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Contact</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Phone / Email" /></div>
          <div><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={submit}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}