import { tr } from "@/lib/i18n";
import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

type Props = {
  title?: string;
  description?: string;
  icon?: "empty" | "warn" | "loading";
  action?: { label: string; onClick: () => void };
  className?: string;
};

/** حالة فارغة/تحذير/تحميل موحّدة داخل الرسوم والتقارير */
export function EmptyState({ title, description, icon = "empty", action, className }: Props) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const Icon = icon === "warn" ? AlertTriangle : icon === "loading" ? Loader2 : Inbox;
  const tone =
    icon === "warn"
      ? "text-amber-500"
      : icon === "loading"
        ? "text-primary"
        : "text-muted-foreground";
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-2 py-10 px-4 rounded-md border border-dashed border-border/60 bg-muted/10 ${className ?? ""}`}
    >
      <Icon className={`w-8 h-8 ${tone} ${icon === "loading" ? "animate-spin" : ""}`} />
      <div className="font-medium text-sm">
        {title ??
          (icon === "loading"
            ? T("جاري التحميل...", "Loading...")
            : T("لا توجد بيانات", "No data"))}
      </div>
      {description && <div className="text-xs text-muted-foreground max-w-md">{description}</div>}
      {action && (
        <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={action.onClick}>
          <RefreshCw className="w-3.5 h-3.5" /> {action.label}
        </Button>
      )}
    </div>
  );
}

type ChartFrameProps = {
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** أعمدة/حقول مطلوبة لعرض الرسم — إن كانت مفقودة من جميع الصفوف نعرض تحذير */
  requiredFields?: string[];
  rows?: Array<Record<string, unknown>>;
  onRetry?: () => void;
  height?: number;
  children: React.ReactNode;
};

/** يغلّف أي رسم/جدول ويعرض حالات (تحميل/خطأ/فارغ/أعمدة ناقصة) بدل شاشات مكسورة */
export function ChartFrame({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  requiredFields,
  rows,
  onRetry,
  height = 280,
  children,
}: ChartFrameProps) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const style = { minHeight: height };

  if (isLoading) {
    return (
      <div style={style}>
        <EmptyState icon="loading" />
      </div>
    );
  }
  if (isError) {
    const msg =
      error instanceof Error
        ? error.message
        : T("تعذّر تحميل البيانات.", "Could not load the data.");
    return (
      <div style={style}>
        <EmptyState
          icon="warn"
          title={T("حدث خطأ أثناء التحميل", "An error occurred while loading")}
          description={msg}
          action={onRetry ? { label: T("إعادة المحاولة", "Retry"), onClick: onRetry } : undefined}
        />
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div style={style}>
        <EmptyState
          icon="empty"
          title={emptyTitle ?? T("لا توجد بيانات لعرضها", "No data to display")}
          description={
            emptyDescription ??
            T(
              "جرّب تغيير الفترة الزمنية أو الفلاتر، أو ابدأ بإدخال البيانات.",
              "Try changing the time period or filters, or start entering data.",
            )
          }
        />
      </div>
    );
  }
  if (requiredFields && requiredFields.length > 0 && rows && rows.length > 0) {
    const missing = requiredFields.filter((f) =>
      rows.every((r) => r[f] === undefined || r[f] === null),
    );
    if (missing.length > 0) {
      return (
        <div style={style}>
          <EmptyState
            icon="warn"
            title={T("بيانات ناقصة", "Missing data")}
            description={T(
              `الحقول التالية غير متوفرة: ${missing.join("، ")}. أكمل الإدخال ليظهر الرسم بشكل صحيح.`,
              `The following fields are missing: ${missing.join(", ")}. Complete the data entry for the chart to display correctly.`,
            )}
          />
        </div>
      );
    }
  }
  return <>{children}</>;
}
