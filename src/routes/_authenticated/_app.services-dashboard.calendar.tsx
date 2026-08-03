import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SdCard } from "@/components/sd/SdCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil } from "lucide-react";
import { listSdEvents, upsertSdEvent, deleteSdEvent, listSdProjects } from "@/lib/servicesDashboard.functions";
import { listBrands } from "@/lib/internal.functions";

export const Route = createFileRoute("/_authenticated/_app/services-dashboard/calendar")({
  component: CalendarPage,
});

const KIND_TONE: Record<string, string> = {
  shoot: "bg-purple-500/20 border-purple-500/40 text-purple-700 dark:text-purple-300",
  delivery: "bg-blue-500/20 border-blue-500/40 text-blue-700 dark:text-blue-300",
  booking: "bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-300",
  other: "bg-muted",
};

type SdEvent = {
  id: string; brand_id: string; project_id: string | null; kind: string;
  title: string; resource: string | null; starts_at: string; ends_at: string | null;
  notes: string | null;
};

function CalendarPage() {
  const s = useSearch({ from: "/_authenticated/_app/services-dashboard" });
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [editEvent, setEditEvent] = useState<SdEvent | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();
  const listFn = useServerFn(listSdEvents);
  const delFn = useServerFn(deleteSdEvent);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const q = useQuery({
    queryKey: ["sd-events", s.brandId, monthStart.toISOString()],
    queryFn: () => listFn({ data: { brandId: s.brandId ?? null, from: monthStart.toISOString(), to: new Date(monthEnd.getTime()+86400000).toISOString() } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["sd-events"] });
  const openEdit = (e: SdEvent) => { setEditEvent(e); setEditOpen(true); };

  const days = useMemo(() => {
    const first = monthStart.getDay();
    const total = monthEnd.getDate();
    const cells: Array<{ date: Date | null }> = [];
    for (let i = 0; i < first; i++) cells.push({ date: null });
    for (let i = 1; i <= total; i++) cells.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), i) });
    return cells;
  }, [cursor, monthStart, monthEnd]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Array<SdEvent>>();
    for (const e of (q.data ?? []) as SdEvent[]) {
      const k = new Date(e.starts_at).toISOString().slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return map;
  }, [q.data]);

  return (
    <div className="space-y-4">
      <SdCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</Button>
            <div className="font-bold text-lg min-w-[160px] text-center">
              {cursor.toLocaleString("en-US", { month: "long", year: "numeric" })}
            </div>
            <Button size="sm" variant="outline" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</Button>
          </div>
          <EventDialog brandId={s.brandId ?? ""} onSaved={invalidate}>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" />New Event</Button>
          </EventDialog>
        </div>

        <div className="grid grid-cols-7 gap-1 mt-4 text-center text-[10px] uppercase text-muted-foreground">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 mt-1">
          {days.map((c, i) => {
            const key = c.date?.toISOString().slice(0, 10);
            const list = key ? (eventsByDay.get(key) ?? []) : [];
            return (
              <div key={i} className={`min-h-[100px] rounded-lg p-1 border ${c.date ? "bg-background/40 border-border/40" : "bg-transparent border-transparent"}`}>
                {c.date && <div className="text-[10px] text-muted-foreground mb-1">{c.date.getDate()}</div>}
                <div className="space-y-1">
                  {list.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => openEdit(e)}
                      className={`w-full text-left text-[10px] px-1 py-0.5 rounded border ${KIND_TONE[e.kind] ?? KIND_TONE.other} hover:opacity-80 truncate`}
                      title={e.notes ?? e.title}
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SdCard>

      <SdCard>
        <h3 className="font-bold mb-3">Upcoming Events</h3>
        <div className="space-y-2">
          {((q.data ?? []) as SdEvent[]).slice(0, 15).map((e) => (
            <button
              key={e.id}
              onClick={() => openEdit(e)}
              className="w-full flex items-center justify-between p-2 rounded-lg bg-muted/40 hover:bg-muted transition text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge className={KIND_TONE[e.kind] ?? ""}>{e.kind}</Badge>
                <span className="text-sm truncate">{e.title}</span>
                {e.resource && <span className="text-xs text-muted-foreground truncate">• {e.resource}</span>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{new Date(e.starts_at).toLocaleString("en-US")}</span>
            </button>
          ))}
          {q.data?.length === 0 && <div className="text-sm text-muted-foreground">No events in this range.</div>}
        </div>
      </SdCard>

      <EventDialog
        brandId={s.brandId ?? ""}
        event={editEvent}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={invalidate}
        onDelete={async (id) => {
          if (!confirm("Delete this event?")) return;
          try { await delFn({ data: { id } }); toast.success("Deleted"); setEditOpen(false); invalidate(); }
          catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
        }}
      />
    </div>
  );
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventDialog({
  brandId, onSaved, children, event, open: openProp, onOpenChange, onDelete,
}: {
  brandId: string;
  onSaved: () => void;
  children?: React.ReactNode;
  event?: SdEvent | null;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  onDelete?: (id: string) => void | Promise<void>;
}) {
  const isEdit = !!event;
  const [openInner, setOpenInner] = useState(false);
  const open = openProp ?? openInner;
  const setOpen = onOpenChange ?? setOpenInner;
  const s = useSearch({ from: "/_authenticated/_app/services-dashboard" });

  const initialForm = () => ({
    brand_id: event?.brand_id ?? brandId,
    project_id: event?.project_id ?? "",
    kind: event?.kind ?? "shoot",
    title: event?.title ?? "",
    resource: event?.resource ?? "",
    starts_at: toLocalInput(event?.starts_at),
    ends_at: toLocalInput(event?.ends_at),
    notes: event?.notes ?? "",
  });
  const [form, setForm] = useState(initialForm);
  // Reset form whenever the dialog opens or the target event changes
  useMemo(() => { if (open) setForm(initialForm()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, event?.id]);

  const listProjectsFn = useServerFn(listSdProjects);
  const listBrandsFn = useServerFn(listBrands);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn(), enabled: open });
  const projQ = useQuery({ queryKey: ["sd-projects-for-event", form.brand_id || s.brandId], enabled: open,
    queryFn: () => listProjectsFn({ data: { brandId: form.brand_id || s.brandId || null } }) });
  const save = useServerFn(upsertSdEvent);
  const serviceBrands = (brandsQ.data ?? []).filter((b) => b.type === "service" && b.active);
  const submit = async () => {
    if (!form.title) return toast.error("Title required");
    if (!form.brand_id) return toast.error("Brand required");
    if (!form.starts_at) return toast.error("Start date required");
    try {
      const payload: Record<string, unknown> = {
        ...form,
        project_id: form.project_id || null,
        resource: form.resource || null,
        notes: form.notes || null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        starts_at: new Date(form.starts_at).toISOString(),
      };
      if (isEdit && event) payload.id = event.id;
      await save({ data: payload });
      toast.success("Saved"); setOpen(false); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v && !isEdit && !form.brand_id && brandId) setForm((f) => ({ ...f, brand_id: brandId })); }}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Event Details" : "New Event"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Brand *</Label>
            <Select value={form.brand_id} onValueChange={(v) => setForm({ ...form, brand_id: v, project_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
              <SelectContent>{serviceBrands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["shoot","delivery","booking","other"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Resource</Label><Input value={form.resource} onChange={(e) => setForm({ ...form, resource: e.target.value })} placeholder="Studio A, Camera 3…" /></div>
          </div>
          <div><Label>Project (optional)</Label>
            <Select value={form.project_id || "__none__"} onValueChange={(v) => {
              if (v === "__none__") return setForm({ ...form, project_id: "" });
              const p = (projQ.data ?? []).find((x: { id: string }) => x.id === v);
              setForm((f) => ({ ...f, project_id: v, brand_id: p?.brand_id ?? f.brand_id }));
            }}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {(projQ.data ?? []).map((p: { id: string; name: string; brand_id: string }) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Starts *</Label><Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
            <div><Label>Ends</Label><Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
          </div>
          <div>
            <Label>Description / Notes</Label>
            <Textarea
              rows={4}
              placeholder="Add a description or notes for this event…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {isEdit && event && onDelete ? (
            <Button variant="destructive" size="sm" onClick={() => onDelete(event.id)}>
              <Trash2 className="w-4 h-4 mr-2" />Delete
            </Button>
          ) : <span />}
          <Button onClick={submit}>
            {isEdit ? <><Pencil className="w-4 h-4 mr-2" />Update</> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}