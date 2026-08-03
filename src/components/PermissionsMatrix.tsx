import { tr } from "@/lib/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, X, Minus, ShieldCheck } from "lucide-react";

type Scope = "all" | "brand" | "own" | "none";
type Cell = { c: Scope; r: Scope; u: Scope; d: Scope; x: Scope };

const ROLES: { key: string; label: string; color: string }[] = [
  { key: "admin", label: "مشرف", color: "bg-red-500/15 text-red-600 dark:text-red-400" },
  { key: "manager", label: "مدير", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  { key: "accountant", label: "محاسب", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { key: "data_entry", label: "إدخال بيانات", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { key: "viewer", label: "مشاهد", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
  { key: "investor", label: "مستثمر", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { key: "member", label: "عضو", color: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
];

// c=create, r=read, u=update, d=delete, x=export
// scope: all=كل البراندات، brand=البراندات المصرح بها فقط، own=صفوفه هو فقط، none=لا يوجد
const M: Record<string, Record<string, Cell>> = {
  admin: {
    "فواتير المبيعات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "فواتير المشتريات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "مدفوعات الموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المصروفات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الخزنة والتحصيلات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الإدخال الشهري": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المنتجات والخامات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المخزون": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الأصول": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الموظفون والحضور": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "Fulfillment والشحن": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المهام": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "براندات وموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستثمرون والحصص": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستخدمون والصلاحيات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "التكاملات (Shopify/Bosta)": { c: "all", r: "all", u: "all", d: "all", x: "all" },
  },
  manager: {
    "فواتير المبيعات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "فواتير المشتريات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "مدفوعات الموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المصروفات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الخزنة والتحصيلات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الإدخال الشهري": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المنتجات والخامات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المخزون": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الأصول": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الموظفون والحضور": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "Fulfillment والشحن": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المهام": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "براندات وموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستثمرون والحصص": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "all", r: "all", u: "all", d: "all", x: "all" },
  },
  accountant: {
    "فواتير المبيعات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "فواتير المشتريات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "مدفوعات الموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المصروفات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الخزنة والتحصيلات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الإدخال الشهري": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المنتجات والخامات": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المخزون": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الأصول": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "الموظفون والحضور": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "Fulfillment والشحن": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المهام": { c: "none", r: "all", u: "own", d: "none", x: "all" },
    "براندات وموردين": { c: "all", r: "all", u: "all", d: "all", x: "all" },
    "المستثمرون والحصص": { c: "none", r: "all", u: "none", d: "none", x: "all" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "all", u: "none", d: "none", x: "none" },
  },
  data_entry: {
    "فواتير المبيعات": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "فواتير المشتريات": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "مدفوعات الموردين": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "المصروفات": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "الخزنة والتحصيلات": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "الإدخال الشهري": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "المنتجات والخامات": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "المخزون": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "الأصول": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الموظفون والحضور": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "Fulfillment والشحن": { c: "brand", r: "brand", u: "brand", d: "brand", x: "brand" },
    "المهام": { c: "none", r: "all", u: "own", d: "none", x: "all" },
    "براندات وموردين": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "المستثمرون والحصص": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "brand", u: "none", d: "none", x: "none" },
  },
  viewer: {
    "فواتير المبيعات": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "فواتير المشتريات": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "مدفوعات الموردين": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "المصروفات": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الخزنة والتحصيلات": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الإدخال الشهري": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "المنتجات والخامات": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "المخزون": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الأصول": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الموظفون والحضور": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "Fulfillment والشحن": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "المهام": { c: "none", r: "all", u: "none", d: "none", x: "all" },
    "براندات وموردين": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "المستثمرون والحصص": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "none", u: "none", d: "none", x: "none" },
  },
  investor: {
    "فواتير المبيعات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "فواتير المشتريات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "مدفوعات الموردين": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المصروفات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الخزنة والتحصيلات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الإدخال الشهري": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المنتجات والخامات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المخزون": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الأصول": { c: "none", r: "brand", u: "none", d: "none", x: "brand" },
    "الموظفون والحضور": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "Fulfillment والشحن": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المهام": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "براندات وموردين": { c: "none", r: "brand", u: "none", d: "none", x: "none" },
    "المستثمرون والحصص": { c: "none", r: "own", u: "none", d: "none", x: "own" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "none", u: "none", d: "none", x: "none" },
  },
  member: {
    "فواتير المبيعات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "فواتير المشتريات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "مدفوعات الموردين": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المصروفات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الخزنة والتحصيلات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الإدخال الشهري": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المنتجات والخامات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المخزون": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الأصول": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "الموظفون والحضور": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "Fulfillment والشحن": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المهام": { c: "none", r: "all", u: "own", d: "none", x: "none" },
    "براندات وموردين": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المستثمرون والحصص": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "المستخدمون والصلاحيات": { c: "none", r: "none", u: "none", d: "none", x: "none" },
    "التكاملات (Shopify/Bosta)": { c: "none", r: "none", u: "none", d: "none", x: "none" },
  },
};

const SECTIONS = Object.keys(M.admin);

function ScopeCell({ s }: { s: Scope }) {
  if (s === "none") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/60">
        <X className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (s === "all") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400" title={tr("جميع البراندات")}>
        <Check className="w-3.5 h-3.5" />
        <span className="text-[10px]">{tr("كل البراندات")}</span>
      </span>
    );
  }
  if (s === "brand") {
    return (
      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400" title={tr("البراندات المصرح بها فقط")}>
        <Check className="w-3.5 h-3.5" />
        <span className="text-[10px]">{tr("براندات مصرحة")}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400" title={tr("صفوفه الخاصة فقط")}>
      <Minus className="w-3.5 h-3.5" />
      <span className="text-[10px]">{tr("صفوفه فقط")}</span>
    </span>
  );
}

export function PermissionsMatrix() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            مصفوفة الصلاح{tr("مصفوفة الصلاحيات")}h2>
          <p className="text-sm text-muted-foreground mt-1">
            ما يقدر يعمله{tr("ما يقدر يعمله كل دور في كل قسم — بما فيها نطاق البراندات")}p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="gap-1"><Check className="w-3 h-3 text-emerald-600" /> ك{tr("كل البراندات")}/Badge>
          <Badge variant="outline" className="gap-1"><Check className="w-3 h-3 text-blue-600" /> ا{tr("البراندات المصرح بها")}/Badge>
          <Badge variant="outline" className="gap-1"><Minus className="w-3 h-3 text-amber-600" /> ص{tr("صفوفه فقط")}/Badge>
          <Badge variant="outline" className="gap-1"><X className="w-3 h-3 text-muted-foreground/60" /> غ{tr("غير مسموح")}/Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map((role) => (
          <div key={role.key} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Badge className={role.color}>{role.label}</Badge>
                <span className="text-xs text-muted-foreground font-mono">{role.key}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right whitespace-nowrap">{tr("القسم")}</TableHead>
                    <TableHead className="text-center whitespace-nowrap">{tr("إدخال")}</TableHead>
                    <TableHead className="text-center whitespace-nowrap">{tr("عرض")}</TableHead>
                    <TableHead className="text-center whitespace-nowrap">{tr("تعديل")}</TableHead>
                    <TableHead className="text-center whitespace-nowrap">{tr("حذف")}</TableHead>
                    <TableHead className="text-center whitespace-nowrap">{tr("تصدير")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SECTIONS.map((section) => {
                    const cell = M[role.key][section];
                    return (
                      <TableRow key={section}>
                        <TableCell className="text-right font-medium text-xs">{section}</TableCell>
                        <TableCell className="text-center"><ScopeCell s={cell.c} /></TableCell>
                        <TableCell className="text-center"><ScopeCell s={cell.r} /></TableCell>
                        <TableCell className="text-center"><ScopeCell s={cell.u} /></TableCell>
                        <TableCell className="text-center"><ScopeCell s={cell.d} /></TableCell>
                        <TableCell className="text-center"><ScopeCell s={cell.x} /></TableCell>
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
        <p className="font-semibold mb-2 text-foreground">{tr("ملاحظات مهمة:")}</p>
        <ul className="space-y-1 list-disc pr-5">
          <li>{tr("«البراندات المصرح بها» = البراندات التي أضافها المشرف يدوياً للمستخدم في تبويب «الصلاحيات».")}</li>
          <li>{tr("«المحاسب» يتمتع بوصول شامل للحسابات (فواتير، مصروفات، خزنة، مدفوعات، أصول) على كل البراندات دون الحاجة لتخصيص براند.")}</li>
          <li>{tr("«إدخال البيانات» يشتغل فقط على البراندات المصرح بها من المشرف.")}</li>
          <li>{tr("«المشاهد» يقدر يعرض ويصدّر تقارير برانداته المصرح بها فقط دون أي تعديل.")}</li>
          <li>{tr("«المستثمر» يشاهد فقط نصيبه من الأرباح والأصول المرتبطة بحصصه.")}</li>
          <li>{tr("الصلاحيات مفروضة على مستوى قاعدة البيانات (RLS) — لا يمكن تجاوزها من الواجهة.")}</li>
        </ul>
      </div>
    </div>
  );
}
