import { tr } from "@/lib/i18n";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Local typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthClient = { name?: string; logo_uri?: string; client_uri?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  redirect_url?: string;
  redirect_to?: string;
  scopes?: string[];
};
type OAuthResult = { data: AuthorizationDetails | null; error: { message: string } | null };
const authOAuth = (supabase.auth as unknown as {
  oauth: {
    getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
    approveAuthorization: (id: string) => Promise<OAuthResult>;
    denyAuthorization: (id: string) => Promise<OAuthResult>;
  };
}).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } as never });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await authOAuth.getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="p-8 max-w-lg mx-auto">
      <Card className="p-6">
        <p>{tr("تعذّر تحميل طلب الصلاحية:")} {String((error as Error)?.message ?? error)}</p>
      </Card>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await authOAuth.approveAuthorization(authorization_id)
      : await authOAuth.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("لم يُرجع خادم الصلاحية عنوان إعادة توجيه.");
      return;
    }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "تطبيق خارجي";

  return (
    <main className="min-h-screen flex items-center justify-center p-4" dir="rtl">
      <Card className="p-8 max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold">{tr("ربط")} {clientName} ب{tr("بحسابك")}/h1>
        <p className="text-muted-foreground">
          سيسمح هذا ل{tr("سيسمح هذا لـ")}e} ب{tr("باستخدام تطبيق e-GURUS بالنيابة عنك، مع احترام صلاحياتك على البراندات والأقسام.")}        </p>
        {details?.scopes && details.scopes.length > 0 && (
          <ul className="text-sm list-disc pr-5 space-y-1">
            {details.scopes.map((s: string) => <li key={s}>{s}</li>)}
          </ul>
        )}
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button disabled={busy} onClick={() => decide(true)}>{tr("موافقة")}</Button>
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>{tr("رفض")}</Button>
        </div>
      </Card>
    </main>
  );
}
