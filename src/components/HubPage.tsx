import { Link } from "@tanstack/react-router";
import { useLang } from "@/lib/i18n";
import { pagesForHub, canSeePage, HUB_BY_KEY, type HubKey, type RoleCtx, type NavPage } from "@/lib/nav-registry";
import { Lock } from "lucide-react";
import { CeoDashboard } from "@/components/ceo/CeoDashboard";


export function HubPage({ hub, ctx }: { hub: HubKey; ctx: RoleCtx }) {
  const { lang } = useLang();
  const meta = HUB_BY_KEY[hub];
  const allPages = pagesForHub(hub);
  const visible = allPages.filter((p) => canSeePage(p, ctx));
  const HubIcon = meta.icon;

  return (
    <div className="relative min-h-screen p-4 md:p-8 space-y-6">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className={`absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-gradient-to-br ${meta.accent} blur-3xl opacity-60`} />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="rounded-3xl bg-card/60 backdrop-blur-xl border border-border/60 shadow-xl p-5 md:p-7">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${meta.accent} border border-border/60 flex items-center justify-center`}>
            <HubIcon className="w-7 h-7 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold leading-tight">
              {meta.en}
            </h1>
            <p className="text-sm text-muted-foreground">
              {lang === "ar" ? meta.descAr : meta.descEn}
            </p>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-muted-foreground">
          <Lock className="w-10 h-10 mx-auto mb-3 opacity-40" />
          {lang === "ar"
            ? "لا توجد صفحات متاحة لك في هذا القسم — راجع الأدمن لطلب صلاحية."
            : "No pages available in this section — contact the admin for access."}
        </div>
      ) : hub === "overview" ? (
        <div className="space-y-8">
          <CeoDashboard />
          {OVERVIEW_SECTIONS.map((sec) => {
            const items = visible.filter((p) => p.group === sec.key);
            if (items.length === 0) return null;
            return (
              <div key={sec.key} className="space-y-3">
                <h2 className="text-lg font-bold text-foreground/90">
                  {sec.en}
                </h2>
                <CardGrid items={items} lang={lang} />
              </div>
            );
          })}
          {(() => {
            const rest = visible.filter((p) => !p.group);
            if (rest.length === 0) return null;
            return (
              <div className="space-y-3">
                <h2 className="text-lg font-bold text-foreground/90">
                  {lang === "ar" ? "أخرى" : "Other"}
                </h2>
                <CardGrid items={rest} lang={lang} />
              </div>
            );
          })()}
        </div>

      ) : (
        <CardGrid items={visible} lang={lang} />
      )}
    </div>
  );
}


const OVERVIEW_SECTIONS: { key: string; ar: string; en: string }[] = [
  { key: "executive", ar: "نظرة تنفيذية", en: "Executive" },
  { key: "sales_marketing", ar: "المبيعات والتسويق", en: "Sales & Marketing" },
  { key: "production_inventory", ar: "الإنتاج والمخزون", en: "Production & Inventory" },
  { key: "audit", ar: "التحقق والمراجعة", en: "Audit" },
];

function CardGrid({ items, lang }: { items: NavPage[]; lang: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((p) => {
        const Icon = p.icon;
        return (
          <Link
            key={p.to}
            to={p.to}
            className="group rounded-2xl bg-card/70 backdrop-blur-md border border-border/60 hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition p-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:bg-primary/20 transition">
                <Icon className="w-5 h-5" />
              </div>
            </div>
            <div>
              <div className="font-semibold text-sm leading-tight">
                {p.en}
              </div>
              {(p.descAr || p.descEn) && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {lang === "ar" ? p.descAr : p.descEn}
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
