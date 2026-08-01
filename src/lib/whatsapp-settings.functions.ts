import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx) {
  for (const role of ["admin", "manager"]) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
    if (data) return;
  }
  throw new Error("Forbidden");
}

function mask(value: string | undefined | null) {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export type WhatsappSettings = {
  token: { configured: boolean; preview: string | null };
  phoneNumberId: { configured: boolean; preview: string | null };
  verifyToken: { configured: boolean; preview: string | null };
  webhookUrl: string;
};

export const getWhatsappSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappSettings> => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);

    const token = process.env["WHATSAPP_TOKEN"];
    const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    const verify = process.env["WHATSAPP_VERIFY_TOKEN"];
    const base = process.env["PUBLIC_SITE_URL"] ?? "https://egurus.info";

    return {
      token: { configured: Boolean(token), preview: mask(token) },
      phoneNumberId: { configured: Boolean(phoneId), preview: phoneId ?? null },
      verifyToken: { configured: Boolean(verify), preview: mask(verify) },
      webhookUrl: `${base.replace(/\/$/, "")}/api/public/whatsapp`,
    };
  });

export type WhatsappTestResult = {
  ok: boolean;
  message: string;
  phoneNumber?: string | null;
  verifiedName?: string | null;
};

export const testWhatsappConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WhatsappTestResult> => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);

    const token = process.env["WHATSAPP_TOKEN"];
    const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    if (!token || !phoneId) {
      return { ok: false, message: "المفاتيح غير مكتملة: أضف WHATSAPP_TOKEN و WHATSAPP_PHONE_NUMBER_ID" };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${phoneId}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = (await res.json()) as {
        display_phone_number?: string;
        verified_name?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        return { ok: false, message: `[${res.status}] ${json?.error?.message ?? "provider error"}` };
      }
      return {
        ok: true,
        message: "الاتصال بواتساب يعمل بنجاح",
        phoneNumber: json.display_phone_number ?? null,
        verifiedName: json.verified_name ?? null,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "فشل الاتصال" };
    }
  });

export const sendWhatsappTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { phone: string; body?: string }) => input)
  .handler(async ({ data, context }): Promise<WhatsappTestResult> => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);

    const phone = (data.phone ?? "").replace(/[^\d]/g, "");
    if (phone.length < 8 || phone.length > 20) {
      return { ok: false, message: "رقم الهاتف غير صحيح (بصيغة دولية بدون +)" };
    }
    const token = process.env["WHATSAPP_TOKEN"];
    const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    if (!token || !phoneId) return { ok: false, message: "المفاتيح غير مكتملة" };

    const body = (data.body ?? "رسالة اختبار من نظام e-GURUS").slice(0, 500);
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body } }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) return { ok: false, message: `[${res.status}] ${json?.error?.message ?? "provider error"}` };
      return { ok: true, message: "تم إرسال رسالة الاختبار" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "فشل الإرسال" };
    }
  });
