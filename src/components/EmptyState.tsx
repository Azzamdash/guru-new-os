import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  title?: string;
  description?: string;
  icon?: "empty" | "warn" | "loading";
  action?: { label: string; onClick: () => void };
  className?: string;
};

/** حالة فارغة/تحذير/تحميل موحّدة داخل الرسوم والتقارير */
export function EmptyState({ title, description, icon = "empty", action, className }: Props) {
  const Icon = icon === "warn" ? AlertTriangle : icon === "loading" ? Loader2 : Inbox;
  const tone =
    icon === "warn" ? "text-amber-500" : icon === "loading" ? "text-primary" : "text-muted-foreground";
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-2 py-10 px-4 rounded-md border border-dashed border-border/60 bg-muted/10 ${className ?? ""}`}
    >
      <Icon className={`w-8 h-8 ${tone} ${icon === "loading" ? "animate-spin" : ""}`} />
      <div className="font-medium text-sm">{title ?? (icon === "loading" ? "جاري التحميل..." : "لا توجد بيانات")}</div>
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
  isLoading, isError, error, isEmpty, emptyTitle, emptyDescription,
  requiredFields, rows, onRetry, height = 280, children,
}: ChartFrameProps) {
  const style = { minHeight: height };

  if (isLoading) {
    return <div style={style}><EmptyState icon="loading" /></div>;
  }
  if (isError) {
    const msg = error instanceof Error ? error.message : "تعذّر تحميل البيانات.";
    return (
      <div style={style}>
        <EmptyState
          icon="warn"
          title="حدث خطأ أثناء التحميل"
          description={msg}
          action={onRetry ? { label: "إعادة المحاولة", onClick: onRetry } : undefined}
        />
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div style={style}>
        <EmptyState
          icon="empty"
          title={emptyTitle ?? "لا توجد بيانات لعرضها"}
          description={emptyDescription ?? "جرّب تغيير الفترة الزمنية أو الفلاتر، أو ابدأ بإدخال البيانات."}
        />
      </div>
    );
  }
  if (requiredFields && requiredFields.length > 0 && rows && rows.length > 0) {
    const missing = requiredFields.filter((f) => rows.every((r) => r[f] === undefined || r[f] === null));
    if (missing.length > 0) {
      return (
        <div style={style}>
          <EmptyState
            icon="warn"
            title="بيانات ناقصة"
            description={`الحقول التالية غير متوفرة: ${missing.join("، ")}. أكمل الإدخال ليظهر الرسم بشكل صحيح.`}
          />
        </div>
      );
    }
  }
  return <>{children}</>;
}
