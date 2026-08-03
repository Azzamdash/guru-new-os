import { tr } from "@/lib/i18n";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { HubPage } from "@/components/HubPage";
import { HUB_BY_KEY, type HubKey, type RoleCtx } from "@/lib/nav-registry";
import { getMyRole } from "@/lib/admin.functions";
import { getMyAccess } from "@/lib/permissions.functions";
import { useLang } from "@/lib/i18n";

const HUB_KEYS: HubKey[] = [
  "overview",
  "missions",
  "sales",
  "invoicing",
  "catalog",
  "offline",
  "inventory",
  "services",
  "investors",
  "hr",
  "settings",
  "fulfillment",
];

export const Route = createFileRoute("/_authenticated/_app/hub/$hub")({
  beforeLoad: ({ params }) => {
    if (!HUB_KEYS.includes(params.hub as HubKey)) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: ({ params }) => {
    const hub = HUB_BY_KEY[params.hub as HubKey];
    const title = hub ? `${hub.en} — e-GURUS` : "e-GURUS";
    return {
      meta: [
        { title },
        { name: "description", content: hub?.descEn ?? "" },
        { name: "robots", content: "noindex, nofollow" },
      ],
    };
  },
  component: HubRoute,
});

function HubRoute() {
  const { hub } = Route.useParams();
  const { lang } = useLang();
  const getMyRoleFn = useServerFn(getMyRole);
  const getAccessFn = useServerFn(getMyAccess);
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => getMyRoleFn() });
  const accessQ = useQuery({ queryKey: ["my-access"], queryFn: () => getAccessFn() });

  const ctx: RoleCtx = useMemo(() => {
    const role = roleQ.data;
    const sections = new Set(accessQ.data?.sections ?? []);
    const roles = (role?.roles ?? []) as string[];
    const isAdmin = !!role?.isAdmin;
    const isManager = !!role?.isManager;
    return {
      isAdmin,
      isPrivileged: isAdmin || isManager,
      canWrite: !!role?.canWrite,
      isInvestor: !!role?.isInvestor,
      roles,
      sections,
    };
  }, [roleQ.data, accessQ.data]);

  if (roleQ.isLoading || accessQ.isLoading) {
    return (
      <div className="p-8 text-muted-foreground">
        {lang === "ar" ? "جاري التحميل..." : "Loading..."}
      </div>
    );
  }

  return <HubPage hub={hub as HubKey} ctx={ctx} />;
}
