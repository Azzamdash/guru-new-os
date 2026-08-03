import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),

  beforeLoad: async ({ location }) => {
    console.log("[auth-layout] beforeLoad for", location.pathname + location.search);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/", search: { next: location.pathname + location.search } });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
