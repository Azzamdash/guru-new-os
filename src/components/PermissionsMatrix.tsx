import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Minus, ShieldCheck } from "lucide-react";
import { useLang } from "@/lib/i18n";

type Scope = "all" | "brand" | "own" | "none";
type Cell = { c: Scope; r: Scope; u: Scope; d: Scope; x: Scope };

const ROLES: { key: string; label: string; labelEn: string; color: string }[] = [
  {
    key: "admin",
    label: "مشرف",
    labelEn: "Admin",
    color: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  {
    key: "manager",
    label: "مدير",
    labelEn: "Manager",
    color: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  {
    key: "accountant",
    label: "محاسب",
    labelEn: "Accountant",
    color: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  {
    key: "data_entry",
    label: "إدخال بيانات",
    labelEn: "Data entry",
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "viewer",
    label: "مشاهد",
    labelEn: "Viewer",
    color: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  },
  {
    key: "investor",
    label: "مستثمر",
    labelEn: "Investor",
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  {
    key: "member",
    label: "عضو",
    labelEn: "Member",
    color: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
  },
];

// c=create, r=read, u=update, d=delete, x=export
// scope: all=كل البراندات، brand=البراندات المصرح بها فقط، own=صفوفه هو فقط، none=لا يوجد
const M: Record<string, Record<string, Cell>> = {
  admin: {
    "فواتير المبيعات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "فواتير المشتريات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "مدفوعات الموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    المصروفات: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الخزنة والتحصيلات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الإدخال الشهري": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المنتجات والخامات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    المخزون: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    الأصول: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الموظفون والحضور": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "Fulfillment والشحن": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    المهام: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "براندات وموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستثمرون والحصص": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستخدمون والصلاحيات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "التكاملات (Shopify/Bosta)": { c: "all", r: "all", u: "all", d: "all", x: "all" },
  },
  manager: {
    "فواتير المبيعات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "فواتير المشتريات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "مدفوعات الموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    المصروفات: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الخزنة والتحصيلات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الإدخال الشهري": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المنتجات والخامات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    المخزون: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    الأصول: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الموظفون والحضور": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "Fulfillment والشحن": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    المهام: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "براندات وموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستثمرون والحصص": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "all", r: "all", u: "all", d: "all", x: "all" },
  },
  accountant: {
    "فواتير المبيعات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "فواتير المشتريات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "مدفوعات الموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    المصروفات: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الخزنة والتحصيلات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الإدخال الشهري": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المنتجات والخامات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    المخزون: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    الأصول: { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الموظفون والحضور": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "Fulfillment والشحن": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    المهام: { c: "none", r: "all", u: "own", d: "none", x: "all" },
    "براندات وموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستثمرون والحصص": { c: "none", r: "all", u: "none", d: "none", x: "all" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "all", u: "none", d: "none", x: "none" },
  },
  data_entry: {
    "فواتير المبيعات": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "فواتير المشتريات": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "مدفوعات الموردين": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    المصروفات: { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "الخزنة والتحصيلات": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "الإدخال الشهري": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "المنتجات والخامات": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    المخزون: { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    الأصول: { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الموظفون والحضور": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "Fulfillment والشحن": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    المهام: { c: "none", r: "all", u: "own", d: "none", x: "all" },
    "براندات وموردين": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "المستثمرون والحصص": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "brand", u: "none", d: "none", x: "none" },
  },
  viewer: {
    "فواتير المبيعات": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "فواتير المشتريات": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "مدفوعات الموردين": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    المصروفات: { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الخزنة والتحصيلات": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الإدخال الشهري": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "المنتجات والخامات": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    المخزون: { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    الأصول: { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الموظفون والحضور": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "Fulfillment والشحن": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    المهام: { c: "none", r: "all", u: "none", d: "none", x: "all" },
    "براندات وموردين": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "المستثمرون والحصص": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "none", u: "none", d: "none", x: "none" },
  },
  investor: {
    "فواتير المبيعات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "فواتير المشتريات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "مدفوعات الموردين": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    المصروفات: { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الخزنة والتحصيلات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الإدخال الشهري": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المنتجات والخامات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    المخزون: { c: "none", r: "none", u: "none", d: "none", x: "none" },
    الأصول: { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الموظفون والحضور": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "Fulfillment والشحن": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    المهام: { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "براندات وموردين": { c: "none", r: "brand", u: "none", d: "none", x: "none" },
    "المستثمرون والحصص": { c: "none", r: "own", u: "none", d: "none", x: "own" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "none", u: "none", d: "none", x: "none" },
  },
  member: {
    "فواتير المبيعات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "فواتير المشتريات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "مدفوعات الموردين": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    المصروفات: { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الخزنة والتحصيلات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الإدخال الشهري": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المنتجات والخامات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    المخزون: { c: "none", r: "none", u: "none", d: "none", x: "none" },
    الأصول: { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الموظفون والحضور": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "Fulfillment والشحن": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    المهام: { c: "none", r: "all", u: "own", d: "none", x: "none" },
    "براندات وموردين": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المستثمرون والحصص": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "none", u: "none", d: "none", x: "none" },
  },
};

const SECTIONS = Object.keys(M.admin);

const SECTION_LABELS_EN: Record<string, string> = {
  "فواتير المبيعات": "Sales invoices",
  "فواتير المشتريات": "Purchase invoices",
  "مدفوعات الموردين": "Supplier payments",
  المصروفات: "Expenses",
  "الخزنة والتحصيلات": "Cash & collections",
  "الإدخال الشهري": "Monthly entry",
  "المنتجات والخامات": "Products & materials",
  المخزون: "Inventory",
  الأصول: "Assets",
  "الموظفون والحضور": "Employees & attendance",
  "Fulfillment والشحن": "Fulfillment & shipping",
  المهام: "Tasks",
  "براندات وموردين": "Brands & suppliers",
  "المستثمرون والحصص": "Investors & shares",
  "المستخدمون والصلاحيات": "Users & permissions",
  "التكاملات (Shopify/Bosta)": "Integrations (Shopify/Bosta)",
};

function ScopeCell({ s }: { s: Scope }) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  if (s === "none") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/60">
        <X className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (s === "all") {
    return (
      <span
        className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
        title={T("جميع البراندات", "All brands")}
      >
        <Check className="w-3.5 h-3.5" />
        <span className="text-[10px]">{T("كل البراندات", "All brands")}</span>
      </span>
    );
  }
  if (s === "brand") {
    return (
      <span
        className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400"
        title={T("البراندات المصرح بها فقط", "Authorized brands only")}
      >
        <Check className="w-3.5 h-3.5" />
        <span className="text-[10px]">{T("براندات مصرحة", "Authorized brands")}</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"
      title={T("صفوفه الخاصة فقط", "Own rows only")}
    >
      <Minus className="w-3.5 h-3.5" />
      <span className="text-[10px]">{T("صفوفه فقط", "Own rows only")}</span>
    </span>
  );
}

export function PermissionsMatrix() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            {T("مصفوفة الصلاحيات", "Permissions matrix")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {T(
              "ما يقدر يعمله كل دور في كل قسم — بما فيها نطاق البراندات",
              "What each role can do in each section — including the brand scope",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="gap-1">
            <Check className="w-3 h-3 text-emerald-600" /> {T("كل البراندات", "All brands")}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Check className="w-3 h-3 text-blue-600" />{" "}
            {T("البراندات المصرح بها", "Authorized brands")}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Minus className="w-3 h-3 text-amber-600" /> {T("صفوفه فقط", "Own rows only")}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <X className="w-3 h-3 text-muted-foreground/60" /> {T("غير مسموح", "Not allowed")}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map((role) => (
          <div key={role.key} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Badge className={role.color}>{T(role.label, role.labelEn)}</Badge>
                <span className="text-xs text-muted-foreground font-mono">{role.key}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right whitespace-nowrap">
                      {T("القسم", "Section")}
                    </TableHead>
                    <TableHead className="text-center whitespace-nowrap">
                      {T("إدخال", "Create")}
                    </TableHead>
                    <TableHead className="text-center whitespace-nowrap">
                      {T("عرض", "View")}
                    </TableHead>
                    <TableHead className="text-center whitespace-nowrap">
                      {T("تعديل", "Edit")}
                    </TableHead>
                    <TableHead className="text-center whitespace-nowrap">
                      {T("حذف", "Delete")}
                    </TableHead>
                    <TableHead className="text-center whitespace-nowrap">
                      {T("تصدير", "Export")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SECTIONS.map((section) => {
                    const cell = M[role.key][section];
                    return (
                      <TableRow key={section}>
                        <TableCell className="text-right font-medium text-xs">
                          {T(section, SECTION_LABELS_EN[section] ?? section)}
                        </TableCell>
                        <TableCell className="text-center">
                          <ScopeCell s={cell.c} />
                        </TableCell>
                        <TableCell className="text-center">
                          <ScopeCell s={cell.r} />
                        </TableCell>
                        <TableCell className="text-center">
                          <ScopeCell s={cell.u} />
                        </TableCell>
                        <TableCell className="text-center">
                          <ScopeCell s={cell.d} />
                        </TableCell>
                        <TableCell className="text-center">
                          <ScopeCell s={cell.x} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground leading-6">
        <p className="font-semibold mb-2 text-foreground">
          {T("ملاحظات مهمة:", "Important notes:")}
        </p>
        <ul className="space-y-1 list-disc pr-5">
          <li>
            {T(
              "«البراندات المصرح بها» = البراندات التي أضافها المشرف يدوياً للمستخدم في تبويب «الصلاحيات».",
              '"Authorized brands" = the brands the admin manually added for the user in the "Permissions" tab.',
            )}
          </li>
          <li>
            {T(
              "«المحاسب» يتمتع بوصول شامل للحسابات (فواتير، مصروفات، خزنة، مدفوعات، أصول) على كل البراندات دون الحاجة لتخصيص براند.",
              '"Accountant" has full access to accounts (invoices, expenses, cash, payments, assets) across all brands without needing brand assignment.',
            )}
          </li>
          <li>
            {T(
              "«إدخال البيانات» يشتغل فقط على البراندات المصرح بها من المشرف.",
              '"Data entry" works only on the brands authorized by the admin.',
            )}
          </li>
          <li>
            {T(
              "«المشاهد» يقدر يعرض ويصدّر تقارير برانداته المصرح بها فقط دون أي تعديل.",
              '"Viewer" can view and export reports for their authorized brands only, with no editing.',
            )}
          </li>
          <li>
            {T(
              "«المستثمر» يشاهد فقط نصيبه من الأرباح والأصول المرتبطة بحصصه.",
              '"Investor" only sees their share of profits and assets linked to their stakes.',
            )}
          </li>
          <li>
            {T(
              "الصلاحيات مفروضة على مستوى قاعدة البيانات (RLS) — لا يمكن تجاوزها من الواجهة.",
              "Permissions are enforced at the database level (RLS) — they cannot be bypassed from the interface.",
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}
