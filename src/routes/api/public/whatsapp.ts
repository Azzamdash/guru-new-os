import { createFileRoute } from "@tanstack/react-router";

type WaChange = {
  value?: {
    metadata?: { phone_number_id?: string };
    contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
    messages?: Array<{ id: string; from: string; timestamp?: string; text?: { body?: string }; type?: string }>;
  };
};

export const Route = createFileRoute("/api/public/whatsapp")({
  server: {
    handlers: {
      // Meta verification handshake
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = process.env["WHATSAPP_VERIFY_TOKEN"];
        if (mode === "subscribe" && expected && token === expected) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const expected = process.env["WHATSAPP_VERIFY_TOKEN"];
        if (!expected) return new Response("Not configured", { status: 503 });

        let payload: { entry?: Array<{ changes?: WaChange[] }> };
        try {
          payload = (await request.json()) as typeof payload;
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Default brand for inbound messages (first brand) — threads can be re-assigned in the UI.
        const { data: brand } = await supabaseAdmin.from("brands").select("id").limit(1).maybeSingle();
        if (!brand) return new Response("ok");

        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const messages = change.value?.messages ?? [];
            const name = change.value?.contacts?.[0]?.profile?.name ?? null;
            for (const msg of messages) {
              const body = msg.text?.body ?? `[${msg.type ?? "media"}]`;
              const phone = String(msg.from).replace(/[^\d+]/g, "");
              if (!phone) continue;

              const { data: existing } = await supabaseAdmin
                .from("whatsapp_threads").select("id, unread_count")
                .eq("brand_id", brand.id).eq("phone", phone).maybeSingle();

              let threadId = existing?.id as string | undefined;
              if (!threadId) {
                const { data: created } = await supabaseAdmin.from("whatsapp_threads")
                  .insert({ brand_id: brand.id, phone, display_name: name })
                  .select("id").single();
                threadId = created?.id as string | undefined;
              }
              if (!threadId) continue;

              await supabaseAdmin.from("whatsapp_messages").insert({
                thread_id: threadId,
                brand_id: brand.id,
                direction: "in",
                body,
                wa_message_id: msg.id,
                status: "received",
                sent_at: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
              });

              await supabaseAdmin.from("whatsapp_threads").update({
                last_message_at: new Date().toISOString(),
                last_message_preview: body.slice(0, 120),
                unread_count: Number(existing?.unread_count ?? 0) + 1,
                ...(name ? { display_name: name } : {}),
              }).eq("id", threadId);
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
