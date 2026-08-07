import {
  LayoutDashboard,
  Package,
  Tags,
  FileWarning,
  Boxes,
  Factory,
  Truck,
  Receipt,
  Plug,
  CheckSquare,
  Megaphone,
  BarChart3,
  ShoppingCart,
  PackageCheck,
  Wallet,
  UserCheck,
  Briefcase,
  ShoppingBag,
  HandCoins,
  Building2,
  GitCompareArrows,
  Users,
  Activity,
  FileBarChart,
  ShieldAlert,
  Gauge,
  CalendarDays,
  Store,
  ShieldCheck,
  Facebook,
  Music2,
  Clock,
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
  | "services"
  | "investors"
  | "hr"
  | "settings"
  | "fulfillment";

export type NavPage = {
  to: string;
  ar: string;
  en: string;
  icon: LucideIcon;
  hub: HubKey;
  /** Additional hubs where the same route should be listed without duplicating permissions. */
  alsoInHubs?: HubKey[];
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
    | "production_manager"
    | "hr"
    | "sales_man"
    | "order_prep"
    | "project_manager"
    | "operation_manager"
    | "fulfillment_manager"
    | "branch_manager"
    | "team_leader"
    | "production_worker"
    | "moderator"
    | "customer_service"
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
  group: "executive" | "operations" | "management" | "system";
};

export const MAIN_NAV_GROUPS = [
  { key: "executive", ar: "الخلاصة التنفيذية", en: "Executive" },
  { key: "operations", ar: "التشغيل والمبيعات", en: "Operations & Sales" },
  { key: "management", ar: "الإدارة والمالية", en: "Management & Finance" },
  { key: "system", ar: "النظام", en: "System" },
] as const;

export const HUBS: Hub[] = [
  {
    key: "overview",
    ar: "CEO Dashboard",
    en: "CEO Dashboard",
    icon: LayoutDashboard,
    accent: "from-primary/40 to-blue-500/20",
    group: "executive",
    descAr: "أهم المؤشرات التنفيذية",
    descEn: "Top executive KPIs",
  },
  {
    key: "missions",
    ar: "Tasks & Missions",
    en: "Tasks & Missions",
    icon: CheckSquare,
    accent: "from-cyan-500/40 to-primary/20",
    group: "operations",
    descAr: "المهام، مهام الإنتاج، تحضير الأوردرات وطباعة الفواتير",
    descEn: "Tasks, production tasks, order prep & invoice printing",
  },
  {
    key: "sales",
    ar: "إدارة الأوردرات",
    en: "Sales & Orders",
    icon: ShoppingBag,
    accent: "from-emerald-500/40 to-primary/20",
    group: "operations",
    descAr: "دورة الأوردر كاملة: التأكيد، التوزيع، الشحن، التحصيل والمرتجعات",
    descEn: "Full order lifecycle: confirm, distribute, ship, collect, return",
  },

  {
    key: "invoicing",
    ar: "Invoicing & Finance",
    en: "Invoicing & Finance",
    icon: Receipt,
    accent: "from-amber-500/40 to-orange-500/20",
    group: "management",
    descAr: "المشتريات، الموردين، المصروفات، الخزنة والتقارير المالية",
    descEn: "Purchases, suppliers, expenses, treasury & financial reports",
  },
  {
    key: "catalog",
    ar: "CRM",
    en: "CRM",
    icon: Users,
    accent: "from-purple-500/40 to-fuchsia-500/20",
    group: "operations",
    descAr: "قاعدة بيانات العملاء",
    descEn: "Customer database",
  },
  {
    key: "offline",
    ar: "Offline Stores",
    en: "Offline Stores",
    icon: Store,
    accent: "from-sky-500/40 to-cyan-500/20",
    group: "operations",
    descAr: "نقطة البيع، مخزون الفروع وتقارير الأوفلاين",
    descEn: "POS, branch stock & offline reports",
  },
  {
    key: "inventory",
    ar: "إدارة المخزون",
    en: "Inventory & Purchasing",
    icon: Boxes,
    accent: "from-indigo-500/40 to-primary/20",
    group: "operations",
    descAr: "الخامات والمنتجات، الحركات، التنبيهات وتقارير المخزون",
    descEn: "Materials & products, movements, alerts & stock reports",
  },
  {
    key: "services",
    ar: "Services Brands",
    en: "Services Brands",
    icon: Briefcase,
    accent: "from-primary/40 to-emerald-500/20",
    group: "operations",
    descAr: "لوحة براندات الخدمات: مشاريع، مهام، ملفات، تقويم",
    descEn: "Projects, tasks, files, calendar & KPIs",
  },
  {
    key: "fulfillment",
    ar: "Fulfillment",
    en: "Fulfillment & Couriers",
    icon: Truck,
    accent: "from-orange-500/40 to-red-500/20",
    group: "operations",
    descAr: "أداء شركات الشحن وتقارير التنفيذ",
    descEn: "Courier performance & fulfillment reports",
  },

  {
    key: "investors",
    ar: "المستثمرون",
    en: "Investors Reporting",
    icon: HandCoins,
    accent: "from-yellow-500/40 to-amber-500/20",
    group: "management",
    descAr: "المستثمرون، الحصص، الأرباح والتقييم",
    descEn: "Investors, shares, profits & valuation",
  },
  {
    key: "hr",
    ar: "الموارد البشرية",
    en: "HR & Payroll",
    icon: UserCheck,
    accent: "from-teal-500/40 to-emerald-500/20",
    group: "management",
    descAr: "الحضور والطلبات",
    descEn: "Attendance & requests",
  },
  {
    key: "settings",
    ar: "الإعدادات",
    en: "Settings & Access",
    icon: ShieldCheck,
    accent: "from-slate-500/40 to-zinc-500/20",
    group: "system",
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
  {
    to: "/dashboard",
    ar: "لوحة التحكم",
    en: "Dashboard",
    icon: LayoutDashboard,
    hub: "overview",
    section: "dashboard",
    privilegedOnly: true,
    descAr: "نظرة عامة على النشاط",
    descEn: "Top KPIs",
    group: "executive",
  },
  {
    to: "/reports/executive",
    ar: "اللوحة المالية التنفيذية",
    en: "Financial Dashboard",
    icon: Gauge,
    hub: "overview",
    privilegedOnly: true,
    descAr: "الأرباح، السيولة والاتجاهات",
    descEn: "Profits, cash & trends",
    group: "executive",
  },

  // MISSIONS (my missions section)
  {
    to: "/tasks",
    ar: "المهام",
    en: "Tasks",
    icon: CheckSquare,
    hub: "missions",
    section: "tasks",
    descAr: "قائمة مهامك اليومية",
    descEn: "Your daily to-do",
  },
  {
    to: "/production-tasks",
    ar: "مهام الإنتاج",
    en: "Production Tasks",
    icon: Factory,
    hub: "missions",
    extraRoles: ["production_manager"],
    descAr: "طابور مهام الورشة",
    descEn: "Workshop task queue",
  },
  {
    to: "/order-pipeline",
    ar: "تحضير الأوردرات",
    en: "Order Prep",
    icon: Activity,
    hub: "missions",
    section: "fulfillment",
    extraRoles: ["order_prep", "fulfillment_manager", "operation_manager"],
    descAr: "طابور تحضير المندوبين",
    descEn: "Prep queue",
  },
  {
    to: "/my-prep",
    ar: "أوردراتي — التحضير",
    en: "My Prep Queue",
    icon: Activity,
    hub: "missions",
    section: "fulfillment",
    extraRoles: ["order_prep", "fulfillment_manager"],
    descAr: "الأوردرات المُسندة إليك فقط",
    descEn: "Orders assigned only to you",
  },
  {
    to: "/invoice-print",
    ar: "طباعة الفواتير",
    en: "Print Invoices",
    icon: Receipt,
    hub: "offline",
    extraRoles: ["sales_man", "branch_manager", "customer_service"],
    descAr: "طباعة/إعادة طباعة الفواتير",
    descEn: "Print / reprint invoices",
  },
  {
    to: "/hr/requests",
    ar: "طلبات الإجازة والسلف",
    en: "Leave & Advance Requests",
    icon: CalendarDays,
    hub: "hr",
    descAr: "الإجازات، الأذونات والسلف",
    descEn: "Leaves, permissions & advances",
  },

  // ORDER MANAGEMENT — ordered by the order lifecycle
  {
    to: "/orders-center",
    ar: "مركز إدارة الأوردرات",
    en: "Orders Center",
    icon: Gauge,
    hub: "sales",
    extraRoles: ["customer_service", "fulfillment_manager", "operation_manager"],
    descAr: "الشاشة الرئيسية: أوردراتي، الشحن والتحصيل وسجل الحالات",
    descEn: "Main screen: my orders, shipping, collections and timeline",
  },
  {
    to: "/order-distribution",
    ar: "توزيع الأوردرات",
    en: "Order Distribution",
    icon: GitCompareArrows,
    hub: "sales",
    requiresWrite: true,
    extraRoles: ["fulfillment_manager", "operation_manager"],
    descAr: "طابور الأوردرات غير الموزَّعة وتوزيعها على موظفي النظام وشركات الشحن مع موازنة الأحمال",
    descEn: "Queue of unassigned orders, assignment to system users and couriers with load balancing",
  },
  {
    to: "/orders-list",
    ar: "الأوردرات",
    en: "Orders",
    icon: ShoppingCart,
    hub: "sales",
    extraRoles: ["customer_service", "fulfillment_manager", "operation_manager"],
    descAr: "قائمة كل الأوردرات مع البحث والفلترة وإنشاء أوردر جديد",
    descEn: "Full orders list with search, filters, and creating new orders",
  },
  {
    to: "/courier-loads",
    ar: "أحمال شركات الشحن",
    en: "Courier Loads",
    icon: Truck,
    hub: "sales",
    extraRoles: ["fulfillment_manager", "operation_manager"],
    descAr: "أحمال كل شركة شحن: مفتوحة، تم التسليم، مرتجع، ونسبة التسليم",
    descEn: "Each courier's load: open, delivered, returned, and delivery rate",
  },
  {
    to: "/distribution-performance",
    ar: "تقارير الموظفين",
    en: "Employee Reports",
    icon: Users,
    hub: "sales",
    extraRoles: ["fulfillment_manager", "operation_manager"],
    descAr: "أداء كل موظف في متابعة الأوردرات الموزَّعة عليه",
    descEn: "Each employee's performance on assigned orders",
  },
  {
    to: "/distribution-log",
    ar: "سجل التوزيع",
    en: "Distribution Log",
    icon: Receipt,
    hub: "sales",
    extraRoles: ["fulfillment_manager", "operation_manager"],
    descAr: "سجل كل عمليات توزيع الأوردرات على شركات الشحن والموظفين",
    descEn: "Log of every order distribution action to couriers and employees",
  },
  {
    to: "/orders-radar",
    ar: "رادار الأوردرات",
    en: "Orders Radar",
    icon: Activity,
    hub: "sales",
    extraRoles: ["customer_service", "fulfillment_manager", "operation_manager"],
    descAr: "تنبيهات تأخر المراحل والأوردرات عالية المخاطر",
    descEn: "SLA breaches and risky orders",
  },
  {
    to: "/order-returns",
    ar: "المرتجعات والاستبدال",
    en: "Returns & Exchanges",
    icon: PackageCheck,
    hub: "sales",
    requiresWrite: true,
    extraRoles: ["customer_service", "fulfillment_manager", "operation_manager"],
    descAr: "دورة المرتجع: استلام، إرجاع للمخزون، واسترداد",
    descEn: "Return lifecycle: receive, restock, refund",
  },
  {
    to: "/courier-settlements",
    ar: "كشوف تحصيل الشحن",
    en: "Courier Settlements",
    icon: HandCoins,
    hub: "invoicing",
    requiresWrite: true,
    extraRoles: ["operation_manager"],
    descAr: "رفع كشوف شركات الشحن ومطابقة التحصيل",
    descEn: "Import courier COD statements and reconcile",
  },
  {
    to: "/whatsapp-templates",
    ar: "قوالب واتساب",
    en: "WhatsApp Templates",
    icon: Megaphone,
    hub: "settings",
    requiresWrite: true,
    extraRoles: ["customer_service", "operation_manager"],
    descAr: "قوالب الرسائل التلقائية لأحداث الأوردر",
    descEn: "Automated message templates for order events",
  },
  {
    to: "/whatsapp-settings",
    ar: "إعدادات واتساب",
    en: "WhatsApp Settings",
    icon: Plug,
    hub: "settings",
    requiresWrite: true,
    descAr: "مفاتيح WhatsApp Cloud API وحالة الاتصال والـ Webhook",
    descEn: "WhatsApp Cloud API keys, connection status and webhook",
  },

  {
    to: "/fulfillment",
    ar: "تحضير الأوردرات",
    en: "Order Prep",
    icon: PackageCheck,
    hub: "missions",
    section: "fulfillment",
    extraRoles: ["fulfillment_manager", "operation_manager"],
    descAr: "تسجيل تحضير وتنفيذ الأوردرات",
    descEn: "Record order prep & fulfilment",
  },

  // INVOICING & FINANCE
  // "Suppliers" (contact records + a simple manual-amount invoice/payment
  // form, no line items) is fully covered by the Suppliers tab inside
  // "إدارة المخزون" (Inventory Management), so it stays out of the nav.
  // "Purchases" is NOT a duplicate of that tab: it's the only place with
  // line-item entry (products/materials/qty/cost) that actually drives
  // inventory movements and material costing — including supplier return
  // invoices — so it needs its own card.
  {
    to: "/purchases",
    ar: "فواتير المشتريات",
    en: "Purchase Invoices",
    icon: ShoppingCart,
    hub: "invoicing",
    section: "suppliers",
    requiresWrite: true,
    descAr: "فواتير موردين ببنود منتجات/خامات، ومرتجعات المورد",
    descEn: "Itemized supplier invoices, including supplier returns",
  },
  {
    to: "/suppliers/payments",
    ar: "دفعات الموردين",
    en: "Supplier Payments",
    icon: FileWarning,
    hub: "invoicing",
    section: "suppliers",
    requiresWrite: true,
    descAr: "دفعات الموردين — تسجّل في الخزنة تلقائياً",
    descEn: "Payments — auto-linked to treasury",
  },

  {
    to: "/expenses",
    ar: "المصروفات",
    en: "Expenses",
    icon: Wallet,
    hub: "invoicing",
    section: "expenses",
    requiresWrite: true,
    descAr: "المصروفات الشهرية والتشغيلية",
    descEn: "Operating expenses",
  },
  {
    to: "/treasury",
    ar: "الخزنة والتحصيلات",
    en: "Treasury",
    icon: HandCoins,
    hub: "invoicing",
    section: "data_entry",
    requiresWrite: true,
    descAr: "حركة الخزنة والتحصيل",
    descEn: "Cash & collections",
  },
  {
    to: "/reports/cash-flow",
    ar: "تقرير التدفق النقدي",
    en: "Cash Flow",
    icon: Wallet,
    hub: "invoicing",
    privilegedOnly: true,
    descAr: "الداخل والخارج نقديًا",
    descEn: "In/out cash",
  },
  {
    to: "/reports/income-statement",
    ar: "قائمة الدخل",
    en: "Income Statement",
    icon: FileBarChart,
    hub: "invoicing",
    privilegedOnly: true,
    descAr: "الإيرادات ناقص التكاليف",
    descEn: "P&L",
  },
  {
    to: "/reports/reconciliation",
    ar: "المطابقة المحاسبية",
    en: "Reconciliation",
    icon: GitCompareArrows,
    hub: "invoicing",
    privilegedOnly: true,
    descAr: "مطابقة الأرصدة والفواتير",
    descEn: "Balance recon",
  },

  // CEO Dashboard → profits
  {
    to: "/reports/profits",
    ar: "تقرير الأرباح",
    en: "Profits Report",
    icon: HandCoins,
    hub: "overview",
    privilegedOnly: true,
    descAr: "صافي الأرباح حسب البراند",
    descEn: "Net profit / brand",
    group: "executive",
  },

  // CRM
  {
    to: "/brands",
    ar: "البراندات",
    en: "Brands",
    icon: Package,
    hub: "settings",
    privilegedOnly: true,
    descAr: "قائمة البراندات",
    descEn: "Brands list",
  },
  {
    to: "/categories",
    ar: "الفئات",
    en: "Categories",
    icon: Tags,
    hub: "settings",
    requiresWrite: true,
    descAr: "تصنيفات المنتجات",
    descEn: "Product categories",
  },
  {
    to: "/assets",
    ar: "الأصول",
    en: "Assets",
    icon: Building2,
    hub: "investors",
    requiresWrite: true,
    descAr: "أصول الشركة والإهلاك",
    descEn: "Company assets",
  },
  {
    to: "/couriers",
    ar: "شركات الشحن",
    en: "Couriers",
    icon: Truck,
    hub: "settings",
    section: "couriers",
    requiresWrite: true,
    descAr: "بيانات شركات الشحن",
    descEn: "Couriers data",
  },
  {
    to: "/customers",
    ar: "العملاء",
    en: "Customers",
    icon: Users,
    hub: "catalog",
    requiresWrite: true,
    extraRoles: ["customer_service", "sales_man", "branch_manager"],
    descAr: "قاعدة بيانات العملاء",
    descEn: "Customer database",
  },

  // OFFLINE
  {
    to: "/pos",
    ar: "نقطة البيع (POS)",
    en: "Point of Sale",
    icon: Store,
    hub: "offline",
    extraRoles: ["sales_man", "branch_manager", "customer_service"],
    descAr: "بيع مباشر داخل الفرع",
    descEn: "In-branch sales",
  },
  {
    to: "/branch-stock",
    ar: "مخزون الفروع",
    en: "Branch Stock",
    icon: Boxes,
    hub: "offline",
    privilegedOnly: true,
    extraRoles: ["branch_manager", "operation_manager"],
    descAr: "مخزون كل فرع أوفلاين",
    descEn: "Per-branch stock",
  },
  {
    to: "/reports/branches",
    ar: "تقارير الفروع",
    en: "Branches Report",
    icon: Building2,
    hub: "offline",
    privilegedOnly: true,
    extraRoles: ["branch_manager"],
    descAr: "أداء الفروع الأوفلاين",
    descEn: "Offline branch perf.",
  },
  {
    to: "/reports/offline-invoices",
    ar: "فواتير الأوفلاين",
    en: "Offline Invoices",
    icon: FileBarChart,
    hub: "offline",
    privilegedOnly: true,
    extraRoles: ["branch_manager"],
    descAr: "فواتير فروع الأوفلاين",
    descEn: "Offline branches invoices",
  },

  // SERVICES BRANDS
  {
    to: "/services",
    ar: "الخدمات",
    en: "Services",
    icon: Briefcase,
    hub: "services",
    requiresWrite: true,
    descAr: "كتالوج الخدمات",
    descEn: "Services catalog",
  },
  {
    to: "/services-dashboard",
    ar: "لوحة براندات الخدمات",
    en: "Services Brand Dashboard",
    icon: Gauge,
    hub: "services",
    extraRoles: ["project_manager"],
    descAr: "المشاريع، المهام، الملفات والتقويم",
    descEn: "Projects, tasks, files, calendar",
  },

  // PRODUCTION → moved into Missions
  {
    to: "/production",
    ar: "أوامر الإنتاج",
    en: "Production Orders",
    icon: Factory,
    hub: "missions",
    section: "production",
    requiresWrite: true,
    extraRoles: ["production_manager", "team_leader", "production_worker", "operation_manager"],
    descAr: "أوامر الإنتاج",
    descEn: "Production orders",
  },
  {
    to: "/operations",
    ar: "حالة المخزون",
    en: "Inventory Status",
    icon: Activity,
    hub: "inventory",
    section: "fulfillment",
    privilegedOnly: true,
    extraRoles: ["operation_manager"],
    descAr: "حالة ومتابعة المخزون اليومية",
    descEn: "Daily inventory status",
  },
  {
    to: "/reports/production",
    ar: "تقارير الإنتاج",
    en: "Production Reports",
    icon: BarChart3,
    hub: "inventory",
    section: "reports_production",
    privilegedOnly: true,
    extraRoles: ["production_manager", "operation_manager"],
    descAr: "أداء الإنتاج والاستهلاك",
    descEn: "Output & usage",
  },

  // INVESTORS
  {
    to: "/investors",
    ar: "المستثمرون والحصص",
    en: "Investors & Shares",
    icon: HandCoins,
    hub: "investors",
    adminOnly: true,
    descAr: "إدارة المستثمرين وحصصهم",
    descEn: "Manage investors & shares",
  },
  {
    to: "/my-investments",
    ar: "استثماراتي",
    en: "My Investments",
    icon: HandCoins,
    hub: "investors",
    investor: true,
    descAr: "ملخصك كمستثمر",
    descEn: "Your investor summary",
  },
  {
    to: "/reports/investors-audit",
    ar: "مراجعة حصص المستثمرين",
    en: "Investors Audit",
    icon: HandCoins,
    hub: "investors",
    investor: true,
    descAr: "سجل تعديلات الحصص",
    descEn: "Shares changelog",
  },
  {
    to: "/reports/valuation",
    ar: "تقييم الشركة",
    en: "Company Valuation",
    icon: Building2,
    hub: "investors",
    privilegedOnly: true,
    descAr: "تقييم البراندات والشركة",
    descEn: "Brands & company valuation",
  },
  {
    to: "/reports/brands-comparison",
    ar: "مقارنة البراندات",
    en: "Brands Comparison",
    icon: GitCompareArrows,
    hub: "investors",
    privilegedOnly: true,
    descAr: "مقارنة أداء البراندات",
    descEn: "Brands perf. compare",
  },

  // REPORTS moved to CEO Dashboard
  {
    to: "/reports/orders-overview",
    ar: "مؤشرات الأوردرات",
    en: "Orders KPIs",
    icon: Activity,
    hub: "sales",
    alsoInHubs: ["overview"],
    section: "reports_orders_overview",
    privilegedOnly: true,
    descAr: "مؤشرات شاملة للأوردرات: المبيعات، التسليم والتحصيل",
    descEn: "Comprehensive order KPIs: sales, delivery & collection",
    group: "sales_marketing",
  },
  {
    to: "/reports/sales",
    ar: "تقارير المبيعات",
    en: "Sales Reports",
    icon: ShoppingCart,
    hub: "overview",
    section: "reports_sales",
    privilegedOnly: true,
    descAr: "المبيعات حسب الفترة/البراند",
    descEn: "Sales by period/brand",
    group: "sales_marketing",
  },
  {
    to: "/reports/marketing",
    ar: "تقارير التسويق",
    en: "Marketing Reports",
    icon: Megaphone,
    hub: "overview",
    section: "reports_marketing",
    privilegedOnly: true,
    descAr: "أداء الحملات والقنوات",
    descEn: "Campaign & channel perf.",
    group: "sales_marketing",
  },
  {
    to: "/reports/couriers",
    ar: "لوحة شركات الشحن",
    en: "Couriers Dashboard",
    icon: Truck,
    hub: "fulfillment",
    section: "couriers",
    privilegedOnly: true,
    descAr: "أداء شركات الشحن",
    descEn: "Couriers performance",
  },
  {
    to: "/reports/revenue-comparison",
    ar: "مقارنة الإيرادات",
    en: "Revenue Comparison",
    icon: GitCompareArrows,
    hub: "overview",
    privilegedOnly: true,
    descAr: "مقارنة إيرادات بين فترات",
    descEn: "Period vs period",
    group: "sales_marketing",
  },
  {
    to: "/reports/fulfillment",
    ar: "تقارير Fulfillment",
    en: "Fulfillment Reports",
    icon: PackageCheck,
    hub: "fulfillment",
    section: "reports_fulfillment",
    privilegedOnly: true,
    descAr: "أداء التنفيذ والتسليم",
    descEn: "Fulfilment perf.",
  },
  {
    to: "/reports/shopify",
    ar: "تقارير Shopify",
    en: "Shopify Reports",
    icon: ShoppingBag,
    hub: "overview",
    privilegedOnly: true,
    descAr: "بيانات متاجر Shopify",
    descEn: "Shopify stores data",
    group: "audit",
  },
  {
    to: "/reports/meta-ads",
    ar: "Meta Ads",
    en: "Meta Ads",
    icon: Facebook,
    hub: "overview",
    privilegedOnly: true,
    descAr: "أرقام إعلانات Meta لايف لكل براند",
    descEn: "Live Meta Ads metrics per brand",
    group: "sales_marketing",
  },
  {
    to: "/reports/tiktok-ads",
    ar: "TikTok Ads",
    en: "TikTok Ads",
    icon: Music2,
    hub: "overview",
    privilegedOnly: true,
    descAr: "أرقام إعلانات TikTok لايف لكل براند",
    descEn: "Live TikTok Ads metrics per brand",
    group: "sales_marketing",
  },
  {
    to: "/reports/audit",
    ar: "سجل المراجعة",
    en: "Audit Log",
    icon: ShieldAlert,
    hub: "overview",
    privilegedOnly: true,
    descAr: "كل تعديلات النظام الحساسة",
    descEn: "Sensitive changes log",
    group: "audit",
  },
  {
    to: "/reports/receivables-aging",
    ar: "أعمار الذمم المدينة",
    en: "Receivables Aging",
    icon: Clock,
    hub: "overview",
    privilegedOnly: true,
    descAr: "تحليل الذمم المدينة حسب فترة التأخير",
    descEn: "Receivables broken down by aging period",
    group: "audit",
  },
  {
    to: "/reports/data-health",
    ar: "صحة البيانات",
    en: "Data Health",
    icon: Activity,
    hub: "overview",
    privilegedOnly: true,
    descAr: "مراقبة المزامنات، فجوات COGS والفروقات",
    descEn: "Monitor syncs, COGS gaps & drifts",
    group: "audit",
  },

  // HR
  {
    to: "/hr/attendance",
    ar: "الحضور والانصراف",
    en: "Attendance & Check-in",
    icon: Clock,
    hub: "hr",
    section: "hr_attendance",
    extraRoles: ["hr"],
    descAr: "تسجيل مواعيد الحضور والانصراف وحساب التأخير والأوفر تايم",
    descEn: "Daily check-in/out with late & overtime reports",
  },
  {
    to: "/reports/attendance",
    ar: "تقارير الحضور",
    en: "Attendance Reports",
    icon: UserCheck,
    hub: "hr",
    section: "reports_attendance",
    extraRoles: ["hr"],
    descAr: "انتظام وحضور الموظفين",
    descEn: "Employees attendance",
  },

  // INVENTORY
  {
    to: "/inventory-management",
    ar: "إدارة المخزون",
    en: "Inventory Management",
    icon: Boxes,
    hub: "inventory",
    requiresWrite: true,
    extraRoles: [
      "production_manager",
      "operation_manager",
      "branch_manager",
      "fulfillment_manager",
    ],
    descAr: "الرئيسية، الكتالوج، نقل المخزون، الموردين، أوامر الشراء، والتحليلات",
    descEn: "Dashboard, catalog, transfers, suppliers, purchase orders & analytics",
  },
  {
    to: "/materials",
    ar: "الخامات",
    en: "Materials",
    icon: Package,
    hub: "inventory",
    requiresWrite: true,
    descAr: "بيانات الخامات وتكلفتها",
    descEn: "Raw materials & costs",
  },
  {
    to: "/products",
    ar: "المنتجات",
    en: "Products",
    icon: Boxes,
    hub: "inventory",
    requiresWrite: true,
    descAr: "كتالوج المنتجات",
    descEn: "Products catalog",
  },
  {
    to: "/production",
    ar: "أوامر الإنتاج",
    en: "Production Orders",
    icon: Factory,
    hub: "inventory",
    section: "production",
    requiresWrite: true,
    extraRoles: ["production_manager", "team_leader", "production_worker", "operation_manager"],
    descAr: "أوامر الإنتاج وخصم الخامات مباشرة",
    descEn: "Production orders & direct material consumption",
  },
  {
    to: "/reports/inventory-valuation",
    ar: "تقييم المخزون",
    en: "Inventory Valuation",
    icon: FileBarChart,
    hub: "inventory",
    privilegedOnly: true,
    descAr: "قيمة المخزون عبر البراندات والفروع",
    descEn: "Stock value across brands & branches",
  },

  // SETTINGS
  {
    to: "/integrations",
    ar: "التكاملات",
    en: "Integrations",
    icon: Plug,
    hub: "settings",
    adminOnly: true,
    descAr: "Shopify, Bosta والتكاملات",
    descEn: "Shopify, Bosta & more",
  },
  {
    to: "/admin",
    ar: "المستخدمون والصلاحيات",
    en: "Users & Permissions",
    icon: ShieldCheck,
    hub: "settings",
    adminOnly: true,
    descAr: "إدارة الحسابات والأدوار",
    descEn: "Accounts, roles & access",
  },
  {
    to: "/data-entry",
    ar: "إدخال البيانات",
    en: "Data Entry",
    icon: FileBarChart,
    hub: "settings",
    section: "data_entry",
    requiresWrite: true,
    descAr: "إدخال يومي وشهري",
    descEn: "Daily/monthly entry",
  },
];

export function pagesForHub(hub: HubKey): NavPage[] {
  return NAV_PAGES.filter((p) => p.hub === hub || p.alsoInHubs?.includes(hub));
}

export type RoleCtx = {
  isAdmin: boolean;
  isPrivileged: boolean; // admin | manager
  canWrite: boolean;
  isInvestor: boolean;
  roles: string[];
  sections: Set<string>;
};

export type PageAccessLevel = "hidden" | "read" | "write";

/**
 * Resolve the effective access for one screen.
 *
 * Strictly explicit: nothing is assumed from job roles. A user only sees a page
 * when an administrator granted it, and only edits when the grant is `write:`.
 * `page:` = view only, `deny:` / missing = hidden.
 * Admin and manager remain break-glass full-access roles.
 *
 * `privilegedOnly` is a hard floor below that: no per-user `page:`/`write:`
 * grant can open a privilegedOnly page for a non-admin/manager. Without this
 * check the flag was purely decorative — a user granted `page:/reports/executive`
 * (or any of the ~27 other privilegedOnly pages) could see it despite not
 * being admin/manager.
 */
export function pageAccessLevel(p: NavPage, ctx: RoleCtx): PageAccessLevel {
  if (p.adminOnly) return ctx.isAdmin ? "write" : "hidden";
  if (ctx.isPrivileged) return "write";
  if (p.privilegedOnly) return "hidden";

  if (ctx.sections.has(`deny:${p.to}`)) return "hidden";
  if (ctx.sections.has(`write:${p.to}`)) return "write";
  if (ctx.sections.has(`page:${p.to}`)) return "read";

  return "hidden";
}

export function canSeePage(p: NavPage, ctx: RoleCtx): boolean {
  return pageAccessLevel(p, ctx) !== "hidden";
}

export function canEditPage(p: NavPage, ctx: RoleCtx): boolean {
  return pageAccessLevel(p, ctx) === "write";
}
