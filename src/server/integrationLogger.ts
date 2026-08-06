/**
 * Centralized logger for integration/webhook activity.
 * Writes to public.integration_logs and also mirrors to console
 * so entries surface in server-function-logs / worker logs for keyword search.
 *
 * Server-only helper — do NOT import from client bundles.
 */

export type IntegrationLogInput = {
  provider: string;
  brand_id?: string | null;
  direction: "outgoing" | "incoming" | "webhook" | "internal";
  operation: string;
  order_number?: string | null;
  order_id?: string | null;
  tracking_number?: string | null;
  status: "success" | "error" | "info" | "warning";
  http_status?: number | null;
  reason?: string | null;
  request?: unknown;
  response?: unknown;
  metadata?: Record<string, unknown> | null;
  actor_id?: string | null;
  /** Outbound target URL — mirrored to the console only, never persisted. */
  url?: string | null;
};


function redact(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  try {
    const seen = new WeakSet<object>();
    const walk = (v: unknown): unknown => {
      if (v === null || typeof v !== "object") return v;
      if (seen.has(v as object)) return "[Circular]";
      seen.add(v as object);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (/api[_-]?key|authorization|token|secret|password|credentials?/i.test(k)) {
          out[k] = "[REDACTED]";
        } else {
          out[k] = walk(val);
        }
      }
      return out;
    };
    return walk(obj);
  } catch {
    return "[unserializable]";
  }
}

function truncate(v: unknown, max = 8000): unknown {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (!s) return v;
    return s.length > max ? s.slice(0, max) + "…[truncated]" : v;
  } catch {
    return "[unserializable]";
  }
}

export async function logIntegrationEvent(input: IntegrationLogInput): Promise<void> {
  const row = {
    provider: input.provider,
    brand_id: input.brand_id ?? null,
    direction: input.direction,
    operation: input.operation,
    order_number: input.order_number ?? null,
    order_id: input.order_id ?? null,
    tracking_number: input.tracking_number ?? null,
    status: input.status,
    http_status: input.http_status ?? null,
    reason: input.reason ?? null,
    request: input.request === undefined ? null : truncate(redact(input.request)),
    response: input.response === undefined ? null : truncate(redact(input.response)),
    metadata: input.metadata ?? null,
    actor_id: input.actor_id ?? null,
  };

  // Console mirror — searchable via server-function-logs / worker logs.
  const tag = `[integration:${input.provider}]`;
  const key =
    `op=${input.operation} status=${input.status}` +
    (input.http_status ? ` http=${input.http_status}` : "") +
    (input.url ? ` url=${input.url}` : "") +
    (input.order_number ? ` order=${input.order_number}` : "") +
    (input.tracking_number ? ` tracking=${input.tracking_number}` : "") +
    (input.brand_id ? ` brand=${input.brand_id}` : "") +
    (input.reason ? ` reason="${String(input.reason).slice(0, 300)}"` : "");
  if (input.status === "error") console.error(tag, key);
  else if (input.status === "warning") console.warn(tag, key);
  else console.log(tag, key);

  try {
    // Always write with the service client: integration_logs has no insert
    // policy for end users, and a user-triggered sync must log the same way a
    // cron-triggered one does.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("integration_logs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(row as any);

    if (error) {
      const e = error as { code?: string; message?: string; details?: string; hint?: string };
      console.error(
        tag,
        "log-insert-failed",
        JSON.stringify({
          code: e.code ?? null,
          message: e.message ?? null,
          details: e.details ?? null,
          hint: e.hint ?? null,
          client: "service_role",
          provider: input.provider,
          operation: input.operation,
          direction: input.direction,
          brand_id: input.brand_id ?? null,
          order_id: input.order_id ?? null,
          url: input.url ?? null,
          http_status: input.http_status ?? null,
        }),
      );
    }
  } catch (e) {
    console.error(tag, "log-insert-threw", (e as Error).message);
  }
}

