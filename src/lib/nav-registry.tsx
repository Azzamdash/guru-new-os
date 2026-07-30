import {
  LayoutDashboard, Package, Tags, FileWarning, Boxes, Factory, Truck, Receipt, Plug,
  CheckSquare, Megaphone, BarChart3, ShoppingCart, PackageCheck, Wallet, UserCheck,
  Briefcase, ShoppingBag, HandCoins, Building2, GitCompareArrows, Users, Activity,
  FileBarChart, ShieldAlert, Gauge, CalendarDays, Store, ShieldCheck, Facebook, Music2, Clock,
  Palette, BookOpen, Sparkles, LineChart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type HubKey =
  | "overview"
  | "missions"
  | "sales"
  | "invoicing"
  | "catalog"
  | "offline"
  | "inventory"
  | "brands_hub"
  | "services"
  | "investors"
  | "hr"
  | "settings";


export type NavPage = {
  to: string;
  ar: string;
  en: string;
  icon: LucideIcon;
  hub: HubKey;
  /** Existing section key from ALL_SECTIONS for per-user access grants. */
  section?: string;
  /** Overview-hub-only card grouping. */
  group?: "executive" | "sales_marketing" | "production_inventory" | "audit";
  /** Requires role.canWrite (edit). If false → read-only viewers can see. */
  requiresWrite?: boolean;
  /** Admin only. */
  adminOnly?: boolean;
  /** Manager+admin only. */
  privilegedOnly?: boolean;
  /** Shown to investor role. */
  investor?: boolean;
  /** Explicit extra roles allowed (union with privileged). */
  extraRoles?: Array<
    | "production_manager" | "hr" | "sales_man" | "order_prep" | "project_manager"
    | "operation_manager" | "fulfillment_manager" | "branch_manager"
    | "team_leader" | "production_worker" | "moderator" | "customer_service"
  >;
  /** Short description shown on the hub card. */
  descAr?: string;
  descEn?: string;
};

export type Hub = {
  key: HubKey;
  ar: string;
  en: string;
  icon: LucideIcon;
  descAr: string;
  descEn: string;
  /** Gradient accent for the hub card. */
  accent: string;
};

export const HUBS: Hub[] = [
  {
    key: "overview", ar: "CEO Dashboard", en: "CEO Dashboard",
    icon: LayoutDashboard, accent: "from-primary/40 to-blue-500/20",
    descAr: "أهم المؤشرات التنفيذية",
    descEn: "Top executive KPIs",
  },
  {
    key: "missions", ar: "Tasks & Missions", en: "Tasks & Missions",
    icon: CheckSquare, accent: "from-cyan-500/40 to-primary/20",
    descAr: "المهام، مهام الإنتاج، تحضير الأوردرات وطباعة الفواتير",
    descEn: "Tasks, production tasks, order prep & invoice printing",
  },
  {
    key: "sales", ar: "الأوردرات", en: "Orders",
    icon: ShoppingBag, accent: "from-emerald-500/40 to-primary/20",
    descAr: "الأوردرات والشحن",
    descEn: "Orders & shipping",
  },

  {
    key: "invoicing", ar: "الفواتير والمالية", en: "Invoicing & Finance",
    icon: Receipt, accent: "from-amber-500/40 to-orange-500/20",
    descAr: "المشتريات، الموردين، المصروفات، الخزنة والتقارير المالية",
    descEn: "Purchases, suppliers, expenses, treasury & financial reports",
  },
  {
    key: "catalog", ar: "CRM", en: "CRM",
    icon: Users, accent: "from-purple-500/40 to-fuchsia-500/20",
    descAr: "قاعدة بيانات العملاء",
    descEn: "Customer database",
  },
  {
    key: "offline", ar: "الفروع الأوفلاين", en: "Offline Stores",
    icon: Store, accent: "from-sky-500/40 to-cyan-500/20",
    descAr: "نقطة البيع، مخزون الفروع وتقارير الأوفلاين",
    descEn: "POS, branch stock & offline reports",
  },
  {
    key: "inventory", ar: "إدارة المخزون", en: "Inventory Management",
    icon: Boxes, accent: "from-indigo-500/40 to-primary/20",
    descAr: "الخامات والمنتجات، الحركات، التنبيهات وتقارير المخزون",
    descEn: "Materials & products, movements, alerts & stock reports",
  },
  {
    key: "brands_hub", ar: "Brands Hub", en: "Brands Hub",
    icon: Palette, accent: "from-teal-500/40 to-emerald-500/20",
    descAr: "هوية البراندات، الـ Playbooks، الويكي، المهام والفيد الإبداعي",
    descEn: "Brand identity, playbooks, wiki, tasks & creative feed",
  },
  {
    key: "services", ar: "براندات الخدمات", en: "Services Brands",
    icon: Briefcase, accent: "from-primary/40 to-emerald-500/20",
    descAr: "لوحة براندات الخدمات: مشاريع، مهام، ملفات، تقويم",
    descEn: "Projects, tasks, files, calendar & KPIs",
  },


  {
    key: "investors", ar: "المستثمرون", en: "Investors",
    icon: HandCoins, accent: "from-yellow-500/40 to-amber-500/20",
    descAr: "المستثمرون، الحصص، الأرباح والتقييم",
    descEn: "Investors, shares, profits & valuation",
  },
  {
    key: "hr", ar: "الموارد البشرية", en: "HR",
    icon: UserCheck, accent: "from-teal-500/40 to-emerald-500/20",
    descAr: "الحضور والطلبات",
    descEn: "Attendance & requests",
  },
  {
    key: "settings", ar: "الإعدادات", en: "Settings",
    icon: ShieldCheck, accent: "from-slate-500/40 to-zinc-500/20",
    descAr: "التكاملات، المستخدمون والصلاحيات",
    descEn: "Integrations, users & permissions",
  },
];

export const HUB_BY_KEY: Record<HubKey, Hub> = HUBS.reduce(
  (acc, h) => ({ ...acc, [h.key]: h }),
  {} as Record<HubKey, Hub>,
);

export const NAV_PAGES: NavPage[] = [
  // OVERVIEW (CEO Dashboard)
  { to: "/dashboard", ar: "لوحة التحكم", en: "Dashboard", icon: LayoutDashboard, hub: "overview", section: "dashboard", privilegedOnly: true, descAr: "نظرة عامة على النشاط", descEn: "Top KPIs" , group: "executive"},
  { to: "/reports/executive", ar: "اللوحة المالية التنفيذية", en: "Financial Dashboard", icon: Gauge, hub: "overview", privilegedOnly: true, descAr: "الأرباح، السيولة والاتجاهات", descEn: "Profits, cash & trends" , group: "executive"},

  // MISSIONS (my missions section)
  { to: "/tasks", ar: "المهام", en: "Tasks", icon: CheckSquare, hub: "missions", section: "tasks", descAr: "قائمة مهامك اليومية", descEn: "Your daily to-do" },
  { to: "/production-tasks", ar: "مهام الإنتاج", en: "Production Tasks", icon: Factory, hub: "missions", extraRoles: ["production_manager"], descAr: "طابور مهام الورشة", descEn: "Workshop task queue" },
  { to: "/order-pipeline", ar: "تحضير الأوردرات", en: "Order Prep", icon: Activity, hub: "missions", section: "fulfillment", extraRoles: ["order_prep", "fulfillment_manager", "operation_manager"], descAr: "طابور تحضير المندوبين", descEn: "Prep queue" },
  { to: "/my-prep", ar: "أوردراتي — التحضير", en: "My Prep Queue", icon: Activity, hub: "missions", section: "fulfillment", extraRoles: ["order_prep", "fulfillment_manager"], descAr: "الأوردرات المُسندة إليك فقط", descEn: "Orders assigned only to you" },
  { to: "/invoice-print", ar: "طباعة الفواتير", en: "Print Invoices", icon: Receipt, hub: "offline", extraRoles: ["sales_man", "branch_manager", "customer_service"], descAr: "طباعة/إعادة طباعة الفواتير", descEn: "Print / reprint invoices" },
  { to: "/hr/requests", ar: "طلبات الإجازة والسلف", en: "Leave & Advance Requests", icon: CalendarDays, hub: "hr", descAr: "الإجازات، الأذونات والسلف", descEn: "Leaves, permissions & advances" },

  // SALES & ORDERS
  { to: "/orders", ar: "الأوردرات", en: "Orders", icon: ShoppingBag, hub: "sales", requiresWrite: true, extraRoles: ["customer_service", "fulfillment_manager", "operation_manager"], descAr: "كل أوردرات المبيعات", descEn: "All sales orders" },
  { to: "/fulfillment", ar: "تحضير الأوردرات", en: "Order Prep", icon: PackageCheck, hub: "sales", section: "fulfillment", extraRoles: ["fulfillment_manager", "operation_manager"], descAr: "تسجيل تحضير وتنفيذ الأوردرات", descEn: "Record order prep & fulfilment" },


  // INVOICING & FINANCE
  { to: "/purchases", ar: "المشتريات", en: "Purchases", icon: ShoppingCart, hub: "invoicing", requiresWrite: true, descAr: "فواتير الموردين والمشتريات", descEn: "Supplier invoices" },
  { to: "/suppliers", ar: "الموردون", en: "Suppliers", icon: FileWarning, hub: "invoicing", section: "suppliers", requiresWrite: true, descAr: "بيانات الموردين والمستحقات", descEn: "Suppliers & dues" },
  { to: "/suppliers/payments", ar: "دفعات الموردين", en: "Supplier Payments", icon: FileWarning, hub: "invoicing", section: "suppliers", requiresWrite: true, descAr: "دفعات الموردين — تسجّل في الخزنة تلقائياً", descEn: "Payments — auto-linked to treasury" },

  { to: "/expenses", ar: "المصروفات", en: "Expenses", icon: Wallet, hub: "invoicing", section: "expenses", requiresWrite: true, descAr: "المصروفات الشهرية والتشغيلية", descEn: "Operating expenses" },
  { to: "/treasury", ar: "الخزنة والتحصيلات", en: "Treasury", icon: HandCoins, hub: "invoicing", section: "data_entry", requiresWrite: true, descAr: "حركة الخزنة والتحصيل", descEn: "Cash & collections" },
  { to: "/reports/cash-flow", ar: "تقرير التدفق النقدي", en: "Cash Flow", icon: Wallet, hub: "invoicing", privilegedOnly: true, descAr: "الداخل والخارج نقديًا", descEn: "In/out cash" },
  { to: "/reports/income-statement", ar: "قائمة الدخل", en: "Income Statement", icon: FileBarChart, hub: "invoicing", privilegedOnly: true, descAr: "الإيرادات ناقص التكاليف", descEn: "P&L" },
  { to: "/reports/reconciliation", ar: "المطابقة المحاسبية", en: "Reconciliation", icon: GitCompareArrows, hub: "invoicing", privilegedOnly: true, descAr: "مطابقة الأرصدة والفواتير", descEn: "Balance recon" },

  // CEO Dashboard → profits
  { to: "/reports/profits", ar: "تقرير الأرباح", en: "Profits Report", icon: HandCoins, hub: "overview", privilegedOnly: true, descAr: "صافي الأرباح حسب البراند", descEn: "Net profit / brand" , group: "executive"},

  // CRM
  { to: "/brands", ar: "البراندات", en: "Brands", icon: Package, hub: "settings", privilegedOnly: true, descAr: "قائمة البراندات", descEn: "Brands list" },
  { to: "/categories", ar: "الفئات", en: "Categories", icon: Tags, hub: "settings", requiresWrite: true, descAr: "تصنيفات المنتجات", descEn: "Product categories" },
  { to: "/assets", ar: "الأصول", en: "Assets", icon: Building2, hub: "investors", requiresWrite: true, descAr: "أصول الشركة والإهلاك", descEn: "Company assets" },
  { to: "/couriers", ar: "شركات الشحن", en: "Couriers", icon: Truck, hub: "settings", section: "couriers", requiresWrite: true, descAr: "بيانات شركات الشحن", descEn: "Couriers data" },
  { to: "/customers", ar: "العملاء", en: "Customers", icon: Users, hub: "catalog", requiresWrite: true, extraRoles: ["customer_service", "sales_man", "branch_manager"], descAr: "قاعدة بيانات العملاء", descEn: "Customer database" },

  // OFFLINE
  { to: "/pos", ar: "نقطة البيع (POS)", en: "Point of Sale", icon: Store, hub: "offline", extraRoles: ["sales_man", "branch_manager", "customer_service"], descAr: "بيع مباشر داخل الفرع", descEn: "In-branch sales" },
  { to: "/branch-stock", ar: "مخزون الفروع", en: "Branch Stock", icon: Boxes, hub: "offline", privilegedOnly: true, extraRoles: ["branch_manager", "operation_manager"], descAr: "مخزون كل فرع أوفلاين", descEn: "Per-branch stock" },
  { to: "/reports/branches", ar: "تقارير الفروع", en: "Branches Report", icon: Building2, hub: "offline", privilegedOnly: true, extraRoles: ["branch_manager"], descAr: "أداء الفروع الأوفلاين", descEn: "Offline branch perf." },
  { to: "/reports/offline-invoices", ar: "فواتير الأوفلاين", en: "Offline Invoices", icon: FileBarChart, hub: "offline", privilegedOnly: true, extraRoles: ["branch_manager"], descAr: "فواتير فروع الأوفلاين", descEn: "Offline branches invoices" },

  // SERVICES BRANDS
  { to: "/services", ar: "الخدمات", en: "Services", icon: Briefcase, hub: "services", requiresWrite: true, descAr: "كتالوج الخدمات", descEn: "Services catalog" },
  { to: "/services-dashboard", ar: "لوحة براندات الخدمات", en: "Services Brand Dashboard", icon: Gauge, hub: "services", extraRoles: ["project_manager"], descAr: "المشاريع، المهام، الملفات والتقويم", descEn: "Projects, tasks, files, calendar" },

  // PRODUCTION → moved into Missions
  { to: "/production", ar: "أوامر الإنتاج", en: "Production Orders", icon: Factory, hub: "missions", section: "production", requiresWrite: true, extraRoles: ["production_manager", "team_leader", "production_worker", "operation_manager"], descAr: "أوامر الإنتاج", descEn: "Production orders" },
  { to: "/operations", ar: "حالة المخزون", en: "Inventory Status", icon: Activity, hub: "overview", section: "fulfillment", privilegedOnly: true, extraRoles: ["operation_manager"], descAr: "حالة ومتابعة المخزون اليومية", descEn: "Daily inventory status" , group: "production_inventory"},
  { to: "/reports/production", ar: "تقارير الإنتاج", en: "Production Reports", icon: BarChart3, hub: "overview", section: "reports_production", privilegedOnly: true, extraRoles: ["production_manager", "operation_manager"], descAr: "أداء الإنتاج والاستهلاك", descEn: "Output & usage" , group: "production_inventory"},

  // INVESTORS
  { to: "/investors", ar: "المستثمرون والحصص", en: "Investors & Shares", icon: HandCoins, hub: "investors", adminOnly: true, descAr: "إدارة المستثمرين وحصصهم", descEn: "Manage investors & shares" },
  { to: "/my-investments", ar: "استثماراتي", en: "My Investments", icon: HandCoins, hub: "investors", investor: true, descAr: "ملخصك كمستثمر", descEn: "Your investor summary" },
  { to: "/reports/investors-audit", ar: "مراجعة حصص المستثمرين", en: "Investors Audit", icon: HandCoins, hub: "investors", investor: true, descAr: "سجل تعديلات الحصص", descEn: "Shares changelog" },
  { to: "/reports/valuation", ar: "تقييم الشركة", en: "Company Valuation", icon: Building2, hub: "investors", privilegedOnly: true, descAr: "تقييم البراندات والشركة", descEn: "Brands & company valuation" },
  { to: "/reports/brands-comparison", ar: "مقارنة البراندات", en: "Brands Comparison", icon: GitCompareArrows, hub: "investors", privilegedOnly: true, descAr: "مقارنة أداء البراندات", descEn: "Brands perf. compare" },

  // REPORTS moved to CEO Dashboard
  { to: "/reports/sales", ar: "تقارير المبيعات", en: "Sales Reports", icon: ShoppingCart, hub: "overview", section: "reports_sales", privilegedOnly: true, descAr: "المبيعات حسب الفترة/البراند", descEn: "Sales by period/brand" , group: "sales_marketing"},
  { to: "/reports/marketing", ar: "تقارير التسويق", en: "Marketing Reports", icon: Megaphone, hub: "overview", section: "reports_marketing", privilegedOnly: true, descAr: "أداء الحملات والقنوات", descEn: "Campaign & channel perf." , group: "sales_marketing"},
  { to: "/reports/couriers", ar: "لوحة شركات الشحن", en: "Couriers Dashboard", icon: Truck, hub: "overview", section: "couriers", privilegedOnly: true, descAr: "أداء شركات الشحن", descEn: "Couriers performance" , group: "audit"},
  { to: "/reports/revenue-comparison", ar: "مقارنة الإيرادات", en: "Revenue Comparison", icon: GitCompareArrows, hub: "overview", privilegedOnly: true, descAr: "مقارنة إيرادات بين فترات", descEn: "Period vs period" , group: "sales_marketing"},
  { to: "/reports/fulfillment", ar: "تقارير Fulfillment", en: "Fulfillment Reports", icon: PackageCheck, hub: "overview", section: "reports_fulfillment", privilegedOnly: true, descAr: "أداء التنفيذ والتسليم", descEn: "Fulfilment perf." , group: "audit"},
  { to: "/reports/inventory-valuation", ar: "تقارير المخزون", en: "Inventory Reports", icon: Boxes, hub: "overview", privilegedOnly: true, descAr: "قيمة ومخزون البراندات والفروع مع ربط الإنتاج", descEn: "Stock value & levels across brands, branches & production" , group: "production_inventory"},
  { to: "/reports/shopify", ar: "تقارير Shopify", en: "Shopify Reports", icon: ShoppingBag, hub: "overview", privilegedOnly: true, descAr: "بيانات متاجر Shopify", descEn: "Shopify stores data" , group: "audit"},
  { to: "/reports/meta-ads", ar: "Meta Ads", en: "Meta Ads", icon: Facebook, hub: "overview", privilegedOnly: true, descAr: "أرقام إعلانات Meta لايف لكل براند", descEn: "Live Meta Ads metrics per brand" , group: "sales_marketing"},
  { to: "/reports/tiktok-ads", ar: "TikTok Ads", en: "TikTok Ads", icon: Music2, hub: "overview", privilegedOnly: true, descAr: "أرقام إعلانات TikTok لايف لكل براند", descEn: "Live TikTok Ads metrics per brand" , group: "sales_marketing"},
  { to: "/reports/audit", ar: "سجل المراجعة", en: "Audit Log", icon: ShieldAlert, hub: "overview", privilegedOnly: true, descAr: "كل تعديلات النظام الحساسة", descEn: "Sensitive changes log", group: "audit" },
  { to: "/reports/receivables-aging", ar: "أعمار الذمم المدينة", en: "Receivables Aging", icon: Clock, hub: "overview", privilegedOnly: true, descAr: "تحليل الذمم المدينة حسب فترة التأخير", descEn: "Receivables broken down by aging period", group: "audit" },
  { to: "/reports/data-health", ar: "صحة البيانات", en: "Data Health", icon: Activity, hub: "overview", privilegedOnly: true, descAr: "مراقبة المزامنات، فجوات COGS والفروقات", descEn: "Monitor syncs, COGS gaps & drifts", group: "audit" },

  // HR
  { to: "/hr/attendance", ar: "الحضور والانصراف", en: "Attendance & Check-in", icon: Clock, hub: "hr", section: "hr_attendance", extraRoles: ["hr"], descAr: "تسجيل مواعيد الحضور والانصراف وحساب التأخير والأوفر تايم", descEn: "Daily check-in/out with late & overtime reports" },
  { to: "/reports/attendance", ar: "تقارير الحضور", en: "Attendance Reports", icon: UserCheck, hub: "hr", section: "reports_attendance", extraRoles: ["hr"], descAr: "انتظام وحضور الموظفين", descEn: "Employees attendance" },


  // INVENTORY
  { to: "/inventory", ar: "إدارة المخزون", en: "Inventory Management", icon: Boxes, hub: "inventory", requiresWrite: true, extraRoles: ["production_manager", "operation_manager", "branch_manager", "fulfillment_manager"], descAr: "المخزون الحالي، الحركات والتنبيهات", descEn: "Stock levels, movements & alerts" },
  { to: "/brands-hub", ar: "البراندات", en: "Brands", icon: Palette, hub: "brands_hub", descAr: "هوية كل براند، الـ Design System والملفات", descEn: "Brand identity, design system & files" },
  { to: "/brands-hub/tasks", ar: "مهام البراندات", en: "Brand Tasks", icon: CheckSquare, hub: "brands_hub", descAr: "لوحة مهام البراندات والتكليفات", descEn: "Brand task board & assignments" },
  { to: "/brands-hub/creative", ar: "Creative Feed", en: "Creative Feed", icon: Sparkles, hub: "brands_hub", descAr: "مشاركة الأعمال الإبداعية والتفاعل", descEn: "Share creative work & engage" },
  { to: "/brands-hub/insights", ar: "إحصائيات البراندات", en: "Brand Insights", icon: LineChart, hub: "brands_hub", privilegedOnly: true, descAr: "أرقام المحتوى والمهام والبلاغات", descEn: "Content, tasks & reports analytics" },
  { to: "/materials", ar: "الخامات", en: "Materials", icon: Package, hub: "inventory", requiresWrite: true, descAr: "بيانات الخامات وتكلفتها", descEn: "Raw materials & costs" },
  { to: "/products", ar: "المنتجات", en: "Products", icon: Boxes, hub: "inventory", requiresWrite: true, descAr: "كتالوج المنتجات", descEn: "Products catalog" },
  { to: "/production", ar: "أوامر الإنتاج", en: "Production Orders", icon: Factory, hub: "inventory", section: "production", requiresWrite: true, extraRoles: ["production_manager", "team_leader", "production_worker", "operation_manager"], descAr: "أوامر الإنتاج وخصم الخامات مباشرة", descEn: "Production orders & direct material consumption" },
  { to: "/reports/inventory-valuation", ar: "تقييم المخزون", en: "Inventory Valuation", icon: FileBarChart, hub: "inventory", privilegedOnly: true, descAr: "قيمة المخزون عبر البراندات والفروع", descEn: "Stock value across brands & branches" },

  // SETTINGS
  { to: "/integrations", ar: "التكاملات", en: "Integrations", icon: Plug, hub: "settings", adminOnly: true, descAr: "Shopify, Bosta والتكاملات", descEn: "Shopify, Bosta & more" },
  { to: "/admin", ar: "المستخدمون والصلاحيات", en: "Users & Permissions", icon: ShieldCheck, hub: "settings", adminOnly: true, descAr: "إدارة الحسابات والأدوار", descEn: "Accounts, roles & access" },
  { to: "/data-entry", ar: "إدخال البيانات", en: "Data Entry", icon: FileBarChart, hub: "settings", section: "data_entry", requiresWrite: true, descAr: "إدخال يومي وشهري", descEn: "Daily/monthly entry" },

];

export function pagesForHub(hub: HubKey): NavPage[] {
  return NAV_PAGES.filter((p) => p.hub === hub);
}

export type RoleCtx = {
  isAdmin: boolean;
  isPrivileged: boolean; // admin | manager
  canWrite: boolean;
  isInvestor: boolean;
  roles: string[];
  sections: Set<string>;
};

export function canSeePage(p: NavPage, ctx: RoleCtx): boolean {
  if (p.adminOnly) return ctx.isAdmin;
  if (ctx.isPrivileged) return true;
  // Per-page explicit grant (from user_section_access as "page:<route>")
  if (ctx.sections.has(`page:${p.to}`)) return true;
  if (p.investor && ctx.isInvestor) return true;
  if (p.extraRoles?.some((r) => ctx.roles.includes(r))) return true;
  if (p.privilegedOnly) return false;
  if (p.requiresWrite && !ctx.canWrite) return false;
  if (p.section && ctx.sections.has(p.section)) return true;
  // Fallback: if page has no gating fields and user has any write or matching section
  if (!p.section && !p.extraRoles && !p.investor && !p.privilegedOnly && !p.adminOnly) {
    return ctx.canWrite || ctx.sections.size > 0 || ctx.isInvestor;
  }
  return false;
}

export function canEditPage(p: NavPage, ctx: RoleCtx): boolean {
  if (ctx.isPrivileged) return true;
  if (p.adminOnly) return ctx.isAdmin;
  if (p.privilegedOnly) return false;
  return !!ctx.canWrite;
}
