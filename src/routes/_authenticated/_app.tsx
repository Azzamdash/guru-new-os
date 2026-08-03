import { Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { OrderModuleNav } from "@/components/orders/OrderModuleNav";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LogOut, Menu, Languages, Search } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/admin.functions";
import { getMyAccess } from "@/lib/permissions.functions";
import { useLang, tr } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import logoAsset from "@/assets/egurus-logo.asset.json";
import {
  HUBS,
  MAIN_NAV_GROUPS,
  NAV_PAGES,
  pagesForHub,
  canSeePage,
  pageAccessLevel,
  type Hub,
  type RoleCtx,
} from "@/lib/nav-registry";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { GlobalPeriodProvider, useGlobalPeriod } from "@/lib/global-period";
import { PeriodFilter } from "@/components/PeriodFilter";

const NavSearchContext = createContext("");

function GlobalPeriodBar() {
  const { period, setPeriod } = useGlobalPeriod();
  return (
    <div className="hidden md:flex items-center gap-2 px-4 py-2 border-b border-border bg-background/60 backdrop-blur">
      <span className="text-xs text-muted-foreground me-2">Global period</span>
      <PeriodFilter value={period} onChange={setPeriod} />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/_app")({
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const { t, toggle, lang } = useLang();
  const getMyRoleFn = useServerFn(getMyRole);
  const getAccessFn = useServerFn(getMyAccess);
  const roleQuery = useQuery({ queryKey: ["my-role"], queryFn: () => getMyRoleFn() });
  const accessQuery = useQuery({ queryKey: ["my-access"], queryFn: () => getAccessFn() });
  const role = roleQuery.data;
  const sections = useMemo(() => new Set(accessQuery.data?.sections ?? []), [accessQuery.data]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isAdmin = !!role?.isAdmin;
  const isManager = !!role?.isManager;
  const isInvestor = !!role?.isInvestor;
  const isOrderPrep = !!role?.isOrderPrep;
  const roles = (role?.roles ?? []) as string[];
  const isSalesMan = roles.includes("sales_man");
  const isProjectManager = roles.includes("project_manager");
  const isPrivileged = isAdmin || isManager;
  // If the admin granted any explicit per-page access, don't force the single-purpose lockdown.
  const hasExplicitPageGrants = Array.from(sections).some(
    (section) =>
      section.startsWith("page:") || section.startsWith("write:") || section.startsWith("deny:"),
  );
  // Other roles that should be free to browse the hubs they have access to (not locked to one screen).
  const OPEN_ROLES = [
    "branch_manager",
    "operation_manager",
    "fulfillment_manager",
    "team_leader",
    "production_worker",
    "moderator",
    "customer_service",
    "production_manager",
    "hr",
    "accountant",
    "data_entry",
    "viewer",
  ];
  const hasOpenRole = roles.some((r) => OPEN_ROLES.includes(r));
  const locksAllowed = !hasExplicitPageGrants && !hasOpenRole && !isPrivileged && !role?.canWrite;
  const investorOnly = locksAllowed && isInvestor;
  const prepOnly = locksAllowed && !isInvestor && isOrderPrep;
  const salesManOnly = locksAllowed && !isInvestor && !isOrderPrep && isSalesMan;
  const pmOnly = locksAllowed && !isInvestor && !isOrderPrep && !isSalesMan && isProjectManager;

  const ctx: RoleCtx = useMemo(
    () => ({
      isAdmin,
      isPrivileged,
      canWrite: !!role?.canWrite,
      isInvestor,
      roles,
      sections,
    }),
    [isAdmin, isPrivileged, role?.canWrite, isInvestor, roles, sections],
  );

  // Only show hubs that have at least one visible page for this user.
  const visibleHubs: Hub[] = useMemo(() => {
    if (!role || !accessQuery.data) return [];
    return HUBS.filter((h) => pagesForHub(h.key).some((p) => canSeePage(p, ctx)));
  }, [role, accessQuery.data, ctx]);

  const homeTo = pmOnly
    ? "/services-dashboard"
    : salesManOnly
      ? "/pos"
      : prepOnly
        ? "/order-pipeline"
        : investorOnly
          ? "/my-investments"
          : isPrivileged
            ? "/hub/overview"
            : visibleHubs[0]
              ? `/hub/${visibleHubs[0].key}`
              : "/dashboard";

  const currentPage = useMemo(
    () =>
      NAV_PAGES.filter(
        (page) => location.pathname === page.to || location.pathname.startsWith(`${page.to}/`),
      ).sort((a, b) => b.to.length - a.to.length)[0],
    [location.pathname],
  );
  const currentPageAccess = currentPage ? pageAccessLevel(currentPage, ctx) : "write";
  const isReadOnlyPage = currentPageAccess === "read";

  useEffect(() => {
    if (!role || !accessQuery.data) return;
    if (currentPage && !canSeePage(currentPage, ctx) && location.pathname !== homeTo) {
      navigate({ to: homeTo, replace: true });
      return;
    }
    if (
      pmOnly &&
      !location.pathname.startsWith("/services-dashboard") &&
      !location.pathname.startsWith("/hr/requests")
    ) {
      navigate({ to: "/services-dashboard", replace: true });
      return;
    }
    if (
      salesManOnly &&
      !location.pathname.startsWith("/pos") &&
      !location.pathname.startsWith("/invoice-print") &&
      !location.pathname.startsWith("/hr/requests")
    ) {
      navigate({ to: "/pos", replace: true });
      return;
    }
    if (
      prepOnly &&
      !location.pathname.startsWith("/order-pipeline") &&
      !location.pathname.startsWith("/my-prep") &&
      !location.pathname.startsWith("/hr/requests")
    ) {
      navigate({ to: "/order-pipeline", replace: true });
      return;
    }
    if (
      investorOnly &&
      !location.pathname.startsWith("/my-investments") &&
      !location.pathname.startsWith("/reports/investors-audit") &&
      !location.pathname.startsWith("/hr/requests")
    ) {
      navigate({ to: "/my-investments", replace: true });
      return;
    }
    if (!isPrivileged && location.pathname.startsWith("/dashboard") && visibleHubs.length > 0) {
      navigate({ to: homeTo, replace: true });
    }
  }, [
    role,
    accessQuery.data,
    location.pathname,
    navigate,
    isPrivileged,
    homeTo,
    investorOnly,
    prepOnly,
    salesManOnly,
    pmOnly,
    visibleHubs.length,
    ctx,
    currentPage,
  ]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: "" }, replace: true });
  };

  const sidebarInner = (
    <div className="flex h-full flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <Link to={homeTo} className="flex items-center gap-3">
          <img
            src={logoAsset.url}
            alt="e-Gurus"
            className="w-10 h-10 rounded-xl object-contain p-1 ring-1 ring-primary/30 shadow"
          />
          <div className="flex flex-col">
            <span className="text-xl font-bold text-gradient-primary leading-none">e-Gurus</span>
            <span className="text-xs text-muted-foreground mt-1">{t("brand_tagline")}</span>
          </div>
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full justify-center gap-2"
          onClick={toggle}
        >
          <Languages className="w-4 h-4" />
          {t("lang_toggle")}
        </Button>
        <div className="relative mt-3">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 ltr:left-2 rtl:right-2 text-muted-foreground pointer-events-none" />
          <Input
            value={navSearch}
            onChange={(e) => setNavSearch(e.target.value)}
            aria-label={lang === "ar" ? "ابحث في القائمة" : "Search menu"}
            placeholder={lang === "ar" ? "ابحث في القائمة..." : "Search menu..."}
            className="h-8 ltr:pl-8 rtl:pr-8 text-sm"
          />

        </div>
      </div>
      <NavSearchContext.Provider value={navSearch.trim().toLowerCase()}>
        <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
          {MAIN_NAV_GROUPS.map((group) => {
            const groupHubs = visibleHubs.filter((hub) => hub.group === group.key);
            if (groupHubs.length === 0) return null;
            return (
              <div key={group.key} className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {lang === "ar" ? group.ar : group.en}
                </div>
                {groupHubs.map((hub) => (
                  <HubNavItem
                    key={hub.key}
                    to={hub.key === "services" ? "/services-dashboard" : `/hub/${hub.key}`}
                    icon={hub.icon}
                    label={lang === "ar" ? hub.ar : hub.en}
                  />
                ))}
              </div>
            );
          })}

          {/* No Personal section — all pages are accessible through their hubs */}
        </nav>
      </NavSearchContext.Provider>
      <div className="p-4 border-t border-sidebar-border">
        {email && (
          <div className="text-xs text-muted-foreground mb-2 truncate" dir="ltr">
            {email}
          </div>
        )}
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={signOut}>
          <LogOut className="w-4 h-4" />
          {t("signout")}
        </Button>
      </div>
    </div>
  );

  return (
    <GlobalPeriodProvider>
      <div className="min-h-screen flex">
        <aside className="w-64 border-border ltr:border-r rtl:border-l bg-sidebar flex-col hidden md:flex">
          {sidebarInner}
        </aside>
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border bg-background/95 backdrop-blur px-3 py-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("open_menu")}>
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side={lang === "ar" ? "right" : "left"}
                className="p-0 w-72 bg-sidebar border-border"
              >
                {sidebarInner}
              </SheetContent>
            </Sheet>
            <Link to={homeTo} className="flex items-center gap-2 font-bold text-gradient-primary">
              <img
                src={logoAsset.url}
                alt="e-Gurus"
                className="w-6 h-6 rounded-md object-contain p-1"
              />
              e-Gurus
            </Link>
            <div className="flex items-center gap-1">
              <NotificationsBell />
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Language">
                <Languages className="w-4 h-4" />
              </Button>
            </div>
          </header>
          <div className="hidden md:flex sticky top-0 z-30 items-center justify-end gap-1 border-b border-border bg-background/80 px-4 py-1.5 backdrop-blur">
            <NotificationsBell />
          </div>
          {isPrivileged && location.pathname === "/dashboard" && <GlobalPeriodBar />}
          <div
            className="flex-1 min-w-0"
            data-page-access={currentPageAccess}
            onClickCapture={(event) => {
              if (!isReadOnlyPage) return;
              const target = event.target as Element;
              if (target.closest("button:not([data-readonly-safe])")) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onSubmitCapture={(event) => {
              if (!isReadOnlyPage) return;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {isReadOnlyPage && (
              <div className="sticky top-0 z-30 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
                صلاحية مشاهدة فقط{tr("صلاحية مشاهدة فقط — التعديل والحفظ غير مسموحين في هذه الصفحة")}div>
            )}
            <OrderModuleNav />
            <Outlet />
          </div>
        </main>
      </div>
    </GlobalPeriodProvider>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HubNavItem({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  const q = useContext(NavSearchContext);
  if (q && !label.toLowerCase().includes(q)) return null;
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent transition-colors [&.active]:bg-sidebar-accent [&.active]:text-primary"
      activeProps={{ className: "active" }}
    >
      <Icon className="w-4 h-4" />
      {label}
    </Link>
  );
}
