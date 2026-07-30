import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

type Dict = Record<string, { ar: string; en: string }>;

const DICT: Dict = {
  brand_tagline: { ar: "لوحة التحكم المالية", en: "Financial Dashboard" },
  signout: { ar: "تسجيل الخروج", en: "Sign out" },
  lang_toggle: { ar: "English", en: "العربية" },
  open_menu: { ar: "فتح القائمة", en: "Open menu" },

  section_core: { ar: "البيانات الأساسية", en: "Core Data" },
  section_reports: { ar: "التقارير", en: "Reports" },
  section_catalog: { ar: "الكتالوج", en: "Catalog" },
 section_offline_data: { ar: "داتا الأوفلاين", en: "Offline Data" },
  section_settings: { ar: "إعدادات", en: "Settings" },

  nav_dashboard: { ar: "CEO Dashboard", en: "CEO Dashboard" },
  nav_treasury: { ar: "الخزنة (تحصيلات/سحوبات)", en: "Treasury" },
  nav_sales: { ar: "الأوردرات", en: "Orders" },
  nav_purchases: { ar: "فواتير المشتريات", en: "Purchase Invoices" },
  nav_expenses: { ar: "المصروفات", en: "Expenses" },
  nav_production: { ar: "الإنتاج والمخزون", en: "Production & Inventory" },
  nav_suppliers: { ar: "الموردين", en: "Suppliers" },
  nav_fulfillment: { ar: "تحضير الأوردرات", en: "Fulfillment" },
  nav_couriers: { ar: "الشحن والمناديب", en: "Shipping & Couriers" },
  nav_tasks: { ar: "المهام", en: "Tasks" },
  nav_invoices_dashboard: { ar: "داش بورد الفواتير", en: "Invoices Dashboard" },
  nav_services: { ar: "براندات الخدمات", en: "Service Brands" },
  nav_reports_sales: { ar: "تقارير الأوردرات", en: "Orders Reports" },
  nav_reports_marketing: { ar: "تقارير التسويق", en: "Marketing Reports" },
  nav_reports_production: { ar: "تقارير الإنتاج", en: "Production Reports" },
  nav_reports_fulfillment: { ar: "Operation & Fulfillment", en: "Operation & Fulfillment" },
  nav_reports_couriers: { ar: "تقارير الشحن والمناديب", en: "Courier Reports" },
  nav_reports_attendance: { ar: "تقرير أداء الموظفين", en: "Employee Performance Report" },
  section_hr: { ar: "HR", en: "HR" },
  nav_production_tasks: { ar: "مهام الإنتاج", en: "Production Tasks" },
  nav_hr_requests: { ar: "طلبات الإجازة والسلفة", en: "Leave & Advance Requests" },
  nav_reports_shopify: { ar: "تقارير Shopify", en: "Shopify Reports" },
  nav_reports_valuation: { ar: "تقييم الشركات", en: "Company Valuation" },
  nav_reports_revenue: { ar: "مقارنة الإيرادات", en: "Revenue Comparison" },
  nav_reports_investors: { ar: "تدقيق نسب المستثمرين", en: "Investor Audit" },
  nav_customers: { ar: "العملاء", en: "Customers" },
  nav_operations: { ar: "تقارير المخزون", en: "Inventory Reports" },
  nav_brands_comparison: { ar: "مقارنة البراندات", en: "Brands Comparison" },
  nav_brands: { ar: "البراندات", en: "Brands" },
  nav_products: { ar: "المنتجات", en: "Products" },
  nav_materials: { ar: "الخامات", en: "Materials" },
  nav_categories: { ar: "بنود المصروفات", en: "Expense Categories" },
  nav_assets: { ar: "أصول الشركة", en: "Company Assets" },
  nav_investors: { ar: "المستثمرون", en: "Investors" },
  nav_my_investments: { ar: "استثماراتي", en: "My Investments" },
  nav_integrations: { ar: "التكاملات", en: "Integrations" },
  nav_admin: { ar: "المستخدمين", en: "Users" },
  nav_orders: { ar: "الأوردرات", en: "Orders" },
  nav_reports_profits: { ar: "تقرير الأرباح", en: "Profits report" },
  nav_reports_income_statement: { ar: "قائمة الدخل", en: "Income Statement" },
  nav_reports_cash_flow: { ar: "التدفقات النقدية", en: "Cash Flow" },
  nav_reports_reconciliation: { ar: "تسوية شركات الشحن", en: "Courier Reconciliation" },
  nav_reports_inventory_valuation: { ar: "تقييم المخزون", en: "Inventory Valuation" },
  nav_reports_audit: { ar: "سجل التدقيق", en: "Audit Log" },
  nav_reports_executive: { ar: "لوحة التنفيذي", en: "Executive Dashboard" },

  // Profits
  profits_title: { ar: "تقرير الأرباح", en: "Profits report" },
  profits_formula: { ar: "صافي الربح = الإيرادات − تكلفة البضاعة (COGS) − المصاريف (مرتبات، إعلانات، تشغيل…)", en: "Net profit = Revenue − COGS − Expenses (salaries, ads, ops…)" },
  profits_empty: { ar: "لا توجد فواتير أو مصاريف داخل هذه الفترة.", en: "No sales or expenses in this period." },
  profits_expense_breakdown: { ar: "تفاصيل المصاريف حسب البند", en: "Expenses breakdown by category" },
  kpi_gross_profit: { ar: "الربح الإجمالي", en: "Gross profit" },

  // Investor valuation
  investors_valuation_title: { ar: "نصيب المستثمرين من التقييم الحالي", en: "Investor share of current valuation" },
  investors_valuation_sub: { ar: "بناءً على تقييم كل براند = الإيرادات السنوية × 1.5 + صافي الأصول", en: "Based on each brand's valuation = Annual revenue × 1.5 + Net assets" },
  inv_val_brand_val: { ar: "تقييم البراند", en: "Brand valuation" },
  inv_val_share_pct: { ar: "نصيب المستثمر %", en: "Share %" },
  inv_val_investor_share: { ar: "قيمة نصيب المستثمر", en: "Investor share value" },
  inv_val_total_company: { ar: "إجمالي تقييم الشركة", en: "Total company valuation" },
  inv_val_effective: { ar: "الملكية الفعلية %", en: "Effective ownership %" },

  // Manual order dialog
  order_new_title: { ar: "أوردر يدوي جديد", en: "New manual order" },
  order_new_hint: { ar: "أضف عميل، البراند، والمنتجات مع الأسعار.", en: "Choose brand, customer, and items with prices." },
  order_shipping_amount: { ar: "قيمة الشحن", en: "Shipping" },
  order_add_item: { ar: "بند جديد", en: "Add item" },
  order_item_title: { ar: "اسم البند", en: "Item name" },
  order_item_qty: { ar: "الكمية", en: "Qty" },
  order_item_price: { ar: "سعر الوحدة", en: "Unit price" },
  order_save: { ar: "حفظ الأوردر", en: "Save order" },
  order_saved: { ar: "تم حفظ الأوردر", en: "Order saved" },

  // Orders / COGS
  orders_title: { ar: "الأوردرات", en: "Orders" },
  orders_new: { ar: "أوردر جديد", en: "New order" },
  order_number: { ar: "رقم الأوردر", en: "Order #" },
  order_source: { ar: "المصدر", en: "Source" },
  order_customer: { ar: "العميل", en: "Customer" },
  order_courier: { ar: "شركة الشحن", en: "Courier" },
  order_employee: { ar: "المندوب/الموظف", en: "Employee" },
  order_status_fulfillment: { ar: "حالة التنفيذ", en: "Fulfillment" },
  order_status_financial: { ar: "حالة الدفع", en: "Payment" },
  order_total: { ar: "الإجمالي", en: "Total" },
  order_cost: { ar: "التكلفة", en: "Cost" },
  order_profit: { ar: "الربح", en: "Profit" },
  order_items: { ar: "القطع", en: "Items" },
  orders_sync_now: { ar: "مزامنة Shopify الآن", en: "Sync Shopify now" },
  orders_synced: { ar: "تمت المزامنة", en: "Synced" },
  ff_unfulfilled: { ar: "قيد التجهيز", en: "Unfulfilled" },
  ff_processing: { ar: "تحت التنفيذ", en: "Processing" },
  ff_shipped: { ar: "تم الشحن", en: "Shipped" },
  ff_delivered: { ar: "تم التسليم", en: "Delivered" },
  ff_returned: { ar: "مرتجع", en: "Returned" },
  ff_cancelled: { ar: "ملغي", en: "Cancelled" },
  fin_pending: { ar: "معلّق", en: "Pending" },
  fin_paid: { ar: "مدفوع", en: "Paid" },
  fin_refunded: { ar: "مسترد", en: "Refunded" },
  fin_voided: { ar: "ملغي", en: "Voided" },
  cogs_title: { ar: "تكلفة البضاعة (COGS) والربح الإجمالي", en: "COGS & Gross Profit" },
  cogs_revenue: { ar: "الإيراد", en: "Revenue" },
  cogs_cost: { ar: "COGS", en: "COGS" },
  cogs_gross_profit: { ar: "الربح الإجمالي", en: "Gross Profit" },
  cogs_margin: { ar: "هامش الربح", en: "Gross Margin" },

  // Customer edit
  customer_edit: { ar: "تعديل بيانات العميل", en: "Edit customer" },
  customer_name: { ar: "الاسم", en: "Name" },
  customer_phone: { ar: "التليفون", en: "Phone" },
  customer_email: { ar: "البريد الإلكتروني", en: "Email" },
  customer_governorate: { ar: "المحافظة", en: "Governorate" },
  customer_is_general: { ar: "عميل عام (متاح لكل البراندات)", en: "General customer (all brands)" },
  customer_brands_assigned: { ar: "البراندات المرتبطة", en: "Assigned brands" },

  auth_title: { ar: "تسجيل الدخول", en: "Sign in" },
  auth_email: { ar: "البريد الإلكتروني", en: "Email" },
  auth_password: { ar: "كلمة المرور", en: "Password" },
  auth_signin_btn: { ar: "تسجيل الدخول", en: "Sign in" },
  auth_google: { ar: "الدخول باستخدام Google", en: "Continue with Google" },
  auth_loading: { ar: "جاري الدخول...", en: "Signing in..." },

  // Common
  loading: { ar: "جاري التحميل...", en: "Loading..." },
  error_loading: { ar: "خطأ في تحميل البيانات", en: "Error loading data" },
  unknown_error: { ar: "خطأ غير معروف", en: "Unknown error" },
  save: { ar: "حفظ", en: "Save" },
  saved: { ar: "تم الحفظ", en: "Saved" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  delete: { ar: "حذف", en: "Delete" },
  deleted: { ar: "تم الحذف", en: "Deleted" },
  edit: { ar: "تعديل", en: "Edit" },
  new: { ar: "جديد", en: "New" },
  select_placeholder: { ar: "اختر", en: "Select" },
  none: { ar: "— بدون —", en: "— None —" },
  general: { ar: "— عام —", en: "— General —" },
  confirm_delete: { ar: "حذف؟", en: "Delete?" },
  confirm_delete_task: { ar: "حذف المهمة؟", en: "Delete task?" },
  all_brands: { ar: "كل البراندات", en: "All brands" },
  brand: { ar: "البراند", en: "Brand" },
  date: { ar: "التاريخ", en: "Date" },
  type: { ar: "النوع", en: "Type" },
  amount: { ar: "المبلغ", en: "Amount" },
  qty: { ar: "الكمية", en: "Qty" },
  total: { ar: "الإجمالي", en: "Total" },
  price: { ar: "السعر", en: "Price" },
  note: { ar: "ملاحظة", en: "Note" },
  customer_name_label: { ar: "اسم العميل", en: "Customer name" },
  customer_phone_label: { ar: "رقم العميل", en: "Customer phone" },
  customer_email_label: { ar: "بريد العميل", en: "Customer email" },
  status: { ar: "الحالة", en: "Status" },
  priority: { ar: "الأولوية", en: "Priority" },
  assignee: { ar: "المسؤول", en: "Assignee" },
  due_date: { ar: "تاريخ الاستحقاق", en: "Due date" },
  title_label: { ar: "العنوان", en: "Title" },
  description: { ar: "الوصف", en: "Description" },
  compare: { ar: "مقارنة", en: "Compare" },
  services: { ar: "خدمات", en: "Services" },
  products: { ar: "منتجات", en: "Products" },

  // Period presets
  period_today: { ar: "اليوم", en: "Today" },
  period_yesterday: { ar: "الأمس", en: "Yesterday" },
  period_this_week: { ar: "هذا الأسبوع", en: "This week" },
  period_this_month: { ar: "هذا الشهر", en: "This month" },
  period_this_year: { ar: "هذه السنة", en: "This year" },
  period_last_12: { ar: "خلال 12 شهر", en: "Last 12 months" },
  period_custom: { ar: "مدة محددة", en: "Custom range" },

  // Report actions
  action_print: { ar: "طباعة", en: "Print" },
  action_export_csv: { ar: "تصدير CSV", en: "Export CSV" },
  action_share: { ar: "إرسال الملخص", en: "Share summary" },
  exported_csv: { ar: "تم تصدير CSV", en: "CSV exported" },

  quick_reports_title: { ar: "تقارير سريعة", en: "Quick Reports" },
  qr_audit: { ar: "سجل التدقيق", en: "Audit Log" },
  qr_inventory: { ar: "تقييم المخزون", en: "Inventory Valuation" },
  qr_cash_flow: { ar: "التدفقات النقدية", en: "Cash Flow" },
  qr_income_statement: { ar: "قائمة الدخل", en: "Income Statement" },
  qr_reconciliation: { ar: "تسوية شركات الشحن", en: "Courier Reconciliation" },

  // Dashboard
  dash_title: { ar: "e-Gurus Dashboard", en: "e-Gurus Dashboard" },
  dash_view_of: { ar: "عرض:", en: "View:" },
  dash_year: { ar: "سنة", en: "Year" },
  dash_period_summary: { ar: "ملخص e-Gurus Dashboard", en: "e-Gurus Dashboard summary" },
  dash_period_label: { ar: "الفترة:", en: "Period:" },
  ql_sale: { ar: "فاتورة مبيعات", en: "Sales invoice" },
  ql_purchase: { ar: "فاتورة مشتريات", en: "Purchase invoice" },
  ql_expense: { ar: "مصروف جديد", en: "New expense" },
  ql_production: { ar: "إنتاج / مخزون", en: "Production / stock" },
  ql_fulfillment: { ar: "تحضير أوردر", en: "Prepare order" },
  ql_tasks: { ar: "المهام", en: "Tasks" },
  kpi_revenue: { ar: "الإيرادات", en: "Revenue" },
  kpi_net_profit: { ar: "صافي الربح", en: "Net profit" },
  kpi_margin: { ar: "هامش", en: "margin" },
  kpi_expenses: { ar: "المصروفات", en: "Expenses" },
  kpi_cash_position: { ar: "المركز النقدي", en: "Cash position" },
  kpi_treasury_balance: { ar: "رصيد الخزنة الحالي", en: "Current treasury balance" },
  kpi_treasury_click: { ar: "اضغط للتفاصيل", en: "Click for details" },
  kpi_treasury_in: { ar: "داخل الخزنة (الفترة)", en: "Treasury inflow (period)" },
  kpi_treasury_out: { ar: "خارج الخزنة (الفترة)", en: "Treasury outflow (period)" },
  kpi_personal_draws: { ar: "سحوباتي الشخصية (الفترة)", en: "My personal draws (period)" },
  kpi_orders_total: { ar: "إجمالي الأوردرات", en: "Total orders" },
  kpi_confirmed: { ar: "مؤكدة", en: "Confirmed" },
  kpi_delivered: { ar: "مسلَّمة", en: "Delivered" },
  kpi_returned: { ar: "مرتجعة", en: "Returned" },
  kpi_confirm_rate: { ar: "معدل التأكيد", en: "Confirm rate" },
  kpi_delivery_rate: { ar: "معدل التسليم", en: "Delivery rate" },
  kpi_return_rate: { ar: "معدل الإرجاع", en: "Return rate" },
  kpi_supplier_debt: { ar: "مديونيات موردين", en: "Supplier debt" },
  kpi_supplier_overdue: { ar: "متأخرة", en: "overdue" },
  kpi_supplier_none: { ar: "لا متأخرات", en: "No overdue" },
  kpi_clients: { ar: "عدد العملاء", en: "Clients" },
  kpi_projects: { ar: "عدد المشروعات", en: "Projects" },
  kpi_avg_project_revenue: { ar: "متوسط إيراد/مشروع", en: "Avg revenue / project" },
  kpi_assets: { ar: "أصول الشركة", en: "Company assets" },
  kpi_assets_count: { ar: "عدد الأصول", en: "Asset count" },
  kpi_assets_cost: { ar: "إجمالي التكلفة", en: "Total cost" },
  kpi_assets_net: { ar: "القيمة الدفترية الحالية", en: "Current book value" },
  kpi_assets_dep: { ar: "إهلاك سنوي", en: "Annual depreciation" },
  chart_trend: { ar: "اتجاه الإيرادات والربح والمصروفات", en: "Revenue, profit & expense trend" },
  chart_brand_revenue: { ar: "مقارنة إيرادات البراندات", en: "Brand revenue comparison" },
  chart_monthly_margin: { ar: "هامش الربحية الشهري", en: "Monthly profit margin" },
  chart_expense_split: { ar: "توزيع المصروفات على البنود", en: "Expenses by category" },
  chart_no_expenses: { ar: "لا مصروفات مسجلة", en: "No expenses recorded" },
  chart_top_cat_per_brand: { ar: "أعلى بند مصروفات لكل براند", en: "Top expense category per brand" },
  no_data: { ar: "لا توجد بيانات.", en: "No data." },
  top_category: { ar: "أعلى بند", en: "Top category" },
  of_total: { ar: "من الإجمالي", en: "of total" },
  supplier_debt_analytics: { ar: "تحليلات مديونيات الموردين", en: "Supplier debt analytics" },
  manage_suppliers: { ar: "إدارة الموردين ←", en: "Manage suppliers →" },
  investors_share_title: { ar: "تحليلات المستثمرين — نصيب الأرباح", en: "Investors analytics — profit share" },
  investors_total_share: { ar: "مجموع النصيب:", en: "Total share:" },
  full_report: { ar: "التقرير الكامل ←", en: "Full report →" },
  customers_overview: { ar: "نظرة على العملاء", en: "Customers overview" },
  brand_count: { ar: "براند", en: "brand(s)" },
  marketing_by_platform: { ar: "مصروفات التسويق حسب المنصة", en: "Marketing spend by platform" },
  marketing_spend: { ar: "الإنفاق", en: "Spend" },
  marketing_attr_revenue: { ar: "الإيراد المنسوب", en: "Attributed revenue" },
  marketing_channel_roi: { ar: "ROI لكل قناة تسويقية", en: "ROI per marketing channel" },
  platform: { ar: "المنصة", en: "Platform" },
  revenue: { ar: "الإيراد", en: "Revenue" },
  low_stock_alerts: { ar: "تنبيهات نقطة إعادة الطلب", en: "Reorder-point alerts" },
  low_stock_none: { ar: "لا منتجات دون نقطة إعادة الطلب.", en: "No products below reorder point." },
  reorder_threshold: { ar: "الحد:", en: "Threshold:" },
  remaining: { ar: "متبقي", en: "Remaining" },
  top_workers: { ar: "أعلى العاملين إنتاجًا", en: "Top producing workers" },
  no_worker_output: { ar: "لا يوجد إنتاج مُسجَّل باسم عامل بعد.", en: "No worker production recorded yet." },
  products_short: { ar: "منتج", en: "products" },
  brands_details: { ar: "تفاصيل البراندات", en: "Brand details" },
  margin_col: { ar: "الهامش", en: "Margin" },
  empty_start_title: { ar: "ابدأ بإضافة البراندات وإدخال البيانات", en: "Start by adding brands and entering data" },
  empty_start_sub: { ar: "اذهب إلى إعدادات البراندات ثم إدخال البيانات الشهرية.", en: "Go to Brands, then monthly data entry." },

  // Tasks
  tasks_title: { ar: "المهام", en: "Tasks" },
  tasks_sub: { ar: "تنظيم وتوزيع المهام على الفريق.", en: "Organize and assign tasks across the team." },
  tasks_new: { ar: "مهمة جديدة", en: "New task" },
  tasks_edit: { ar: "تعديل مهمة", en: "Edit task" },
  tasks_none: { ar: "لا مهام.", en: "No tasks." },
  status_todo: { ar: "قيد الانتظار", en: "To do" },
  status_in_progress: { ar: "قيد التنفيذ", en: "In progress" },
  status_done: { ar: "مكتملة", en: "Done" },
  priority_low: { ar: "منخفضة", en: "Low" },
  priority_medium: { ar: "متوسطة", en: "Medium" },
  priority_high: { ar: "عالية", en: "High" },

  // Sales
  sales_title: { ar: "فواتير المبيعات والمرتجعات", en: "Sales & returns invoices" },
  sales_sub: { ar: "فاتورة بعدة منتجات، سعر تلقائي، وتعديل بصلاحية.", en: "Multi-item invoice, auto pricing, permission-guarded edits." },
  sales_new: { ar: "فاتورة جديدة", en: "New invoice" },
  sales_edit: { ar: "تعديل فاتورة", en: "Edit invoice" },
  sales_report: { ar: "تقرير المبيعات", en: "Sales report" },
  sales_last_n: { ar: "آخر {n} فاتورة", en: "Last {n} invoices" },
  sales_gross: { ar: "إجمالي البيع", en: "Gross sales" },
  sales_invoices_count: { ar: "{n} فاتورة", en: "{n} invoice(s)" },
  sales_returns: { ar: "المرتجعات", en: "Returns" },
  sales_returns_rate: { ar: "{p}% من العدد", en: "{p}% by count" },
  sales_net: { ar: "صافي المبيعات", en: "Net sales" },
  sales_collected: { ar: "المُحصَّل", en: "Collected" },
  sales_outstanding: { ar: "متبقي {n}", en: "Outstanding {n}" },
  sales_avg_ticket: { ar: "متوسط الفاتورة", en: "Avg ticket" },
  sales_top5: { ar: "أعلى 5 منتجات مبيعاً", en: "Top 5 selling products" },
  sales_product: { ar: "المنتج", en: "Product" },
  sales_last: { ar: "آخر الفواتير", en: "Recent invoices" },
  sales_shipping: { ar: "الشحن", en: "Shipping" },
  sales_no_invoices: { ar: "لا فواتير.", en: "No invoices." },
  sale_type_sale: { ar: "بيع", en: "Sale" },
  sale_type_return: { ar: "مرتجع", en: "Return" },
  courier_label: { ar: "شحن/مندوب", en: "Courier / rep" },
  invoice_items: { ar: "بنود الفاتورة", en: "Invoice items" },
  add_item: { ar: "بند", en: "Item" },
  choose_brand_first: { ar: "اختر البراند أولاً", en: "Pick a brand first" },
  save_invoice: { ar: "حفظ الفاتورة", en: "Save invoice" },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: keyof typeof DICT | string) => string; toggle: () => void };
const LangCtx = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    try {
      const saved = (localStorage.getItem("app_lang") as Lang | null) ?? "ar";
      setLangState(saved === "en" ? "en" : "ar");
    } catch {}
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("app_lang", l); } catch {}
  };

  const t = (k: string) => (DICT[k]?.[lang]) ?? k;
  const toggle = () => setLang(lang === "ar" ? "en" : "ar");

  return <LangCtx.Provider value={{ lang, setLang, t, toggle }}>{children}</LangCtx.Provider>;
}

export const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
export const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function monthName(lang: Lang, m: number) {
  return (lang === "ar" ? MONTHS_AR : MONTHS_EN)[m - 1] ?? "";
}

export function useLang() {
  const ctx = useContext(LangCtx);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}