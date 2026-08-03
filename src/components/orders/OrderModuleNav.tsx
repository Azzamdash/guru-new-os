import { Link, useLocation } from "@tanstack/react-router";
import { NAV_PAGES } from "@/lib/nav-registry";

const MODULE_PAGES = NAV_PAGES.filter((p) => p.hub === "sales");

/**
 * Sub-navigation shown across every Order Management page so the module feels
 * like one connected workspace instead of scattered screens.
 */
export function OrderModuleNav() {
  const { pathname } = useLocation();
  const inModule = MODULE_PAGES.some(
    (p) => pathname === p.to || pathname.startsWith(`${p.to}/`),
  ) || pathname.startsWith("/order-view/");
  if (!inModule) return null;

  return (
    <div className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2">
        <span className="me-2 shrink-0 text-xs font-semibold text-muted-foreground">
          Sales & Orders
        </span>
        {MODULE_PAGES.map((p) => {
          const Icon = p.icon;
          const active = pathname === p.to || pathname.startsWith(`${p.to}/`);
          return (
            <Link
              key={p.to}
              to={p.to}
              className={[
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" />
              {p.en}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
