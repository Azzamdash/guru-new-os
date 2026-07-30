import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listIntegrationLogs } from "@/lib/integrations.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/_app/integration-logs")({
  component: IntegrationLogsPage,
  head: () => ({
    meta: [
      { title: "Integration Logs · e-Gurus" },
      { name: "description", content: "Searchable log of integration requests and webhook events (Bosta, etc.)." },
    ],
  }),
});

type LogRow = {
  id: string;
  created_at: string;
  provider: string;
  brand_id: string | null;
  direction: string;
  operation: string;
  order_number: string | null;
  tracking_number: string | null;
  status: string;
  http_status: number | null;
  reason: string | null;
  request: unknown;
  response: unknown;
  metadata: unknown;
};

function IntegrationLogsPage() {
  const fn = useServerFn(listIntegrationLogs);
  const [provider, setProvider] = useState<string>("bosta");
  const [status, setStatus] = useState<string>("");
  const [operation, setOperation] = useState<string>("");
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [applied, setApplied] = useState({ provider: "bosta", status: "", operation: "", order_number: "", search: "" });
  const navigate = useNavigate();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["integration-logs", applied],
    queryFn: () => fn({ data: {
      provider: applied.provider || undefined,
      status: applied.status || undefined,
      operation: applied.operation || undefined,
      order_number: applied.order_number || undefined,
      search: applied.search || undefined,
      limit: 300,
    } }),
  });

  const rows = (data ?? []) as LogRow[];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Integration Logs</h1>
        <Button variant="outline" onClick={() => navigate({ to: "/hub/$hub", params: { hub: "overview" } })}>← CEO Dashboard</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <Select value={provider || "all"} onValueChange={(v) => setProvider(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="bosta">Bosta</SelectItem>
              <SelectItem value="shopify">Shopify</SelectItem>
              <SelectItem value="meta_ads">Meta Ads</SelectItem>
              <SelectItem value="tiktok_ads">TikTok Ads</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="success">success</SelectItem>
              <SelectItem value="error">error</SelectItem>
              <SelectItem value="warning">warning</SelectItem>
              <SelectItem value="info">info</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="operation (e.g. create_delivery)" value={operation} onChange={(e) => setOperation(e.target.value)} />
          <Input placeholder="order number" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          <Input placeholder="search reason / tracking" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={() => setApplied({ provider, status, operation, order_number: orderNumber, search })}>
              Apply
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>Refresh</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent events ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-muted-foreground">Loading…</p> : rows.length === 0 ? (
            <p className="text-muted-foreground">No log entries match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Dir</th>
                    <th className="py-2 pr-3">Operation</th>
                    <th className="py-2 pr-3">Order #</th>
                    <th className="py-2 pr-3">Tracking</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">HTTP</th>
                    <th className="py-2 pr-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-3">{r.provider}</td>
                      <td className="py-2 pr-3">{r.direction}</td>
                      <td className="py-2 pr-3 font-mono">{r.operation}</td>
                      <td className="py-2 pr-3 font-mono">{r.order_number ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono">{r.tracking_number ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={r.status === "success" ? "default" : r.status === "error" ? "destructive" : "secondary"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{r.http_status ?? "—"}</td>
                      <td className="py-2 pr-3 max-w-[420px]"><span className="text-muted-foreground">{r.reason ?? "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
