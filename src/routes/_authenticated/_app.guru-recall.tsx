import { createFileRoute } from "@tanstack/react-router";
import { Search, Clock3, UserRound, Truck, Package, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/guru-recall")({
  component: GuruRecallPage,
});

const events = [
  ["اليوم · 09:42", "تم تسليم أوردر", "العميل · أحمد حسن", "مكتمل"],
  ["أمس · 09:18", "تم إسناد مندوب", "التوزيع · فرع A", "محدث"],
  ["أمس · 08:51", "تم تسجيل تحصيل", "العميل · سارة علي", "مكتمل"],
  ["05 أغسطس · 14:27", "انخفاض المخزون تحت الحد", "Brand X · المخزن", "يحتاج انتباه"],
];

function GuruRecallPage() {
  const { lang } = useLang();
  const ar = lang === "ar";
  return (
    <main dir={ar ? "rtl" : "ltr"} className="relative min-h-full bg-background p-4 md:p-6 space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold text-primary">e-Gurus · Recall</div>
          <h1 className="mt-1 text-xl md:text-2xl font-extrabold">الذاكرة التشغيلية</h1>
          <p className="text-xs text-muted-foreground mt-1">استرجع ما حدث واربط الأحداث والكيانات في مكان واحد.</p>
        </div>
        <Button asChild variant="outline" size="sm"><a href="/guru-demo"><ArrowLeft className="w-4 h-4" /> مركز التحكم</a></Button>
      </header>

      <Card className="p-4 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl">
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 rtl:right-3 ltr:left-3 w-4 h-4 text-muted-foreground" />
          <Input className="h-11 rtl:pr-10 ltr:pl-10 rounded-2xl" placeholder="ابحث عن عميل، مندوب، أوردر، فرع..." />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary"><UserRound className="w-3 h-3 me-1" /> العملاء</Badge>
          <Badge variant="secondary"><Truck className="w-3 h-3 me-1" /> المندوبون</Badge>
          <Badge variant="secondary"><Package className="w-3 h-3 me-1" /> الأوردرات</Badge>
        </div>
      </Card>

      <section className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl">
          <div className="text-xs text-muted-foreground">الكيان المحدد</div>
          <h2 className="mt-2 text-xl font-bold">أحمد حسن</h2>
          <Badge className="mt-2" variant="outline">عميل</Badge>
          <div className="mt-5 space-y-3 text-sm">
            <Info label="الحالة الحالية" value="نشط" />
            <Info label="إجمالي الأوردرات" value="12" />
            <Info label="قيد التنفيذ" value="2" />
            <Info label="آخر نشاط" value="اليوم · 09:42" />
          </div>
        </Card>

        <Card className="p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl">
          <div className="flex items-center gap-2"><Clock3 className="w-4 h-4 text-primary" /><h2 className="text-sm font-bold">التاريخ والنشاط</h2></div>
          <div className="mt-3 divide-y divide-border">
            {events.map(([time, event, context, state]) => (
              <div key={`${time}-${event}`} className="py-4 grid gap-2 md:grid-cols-[130px_1fr_auto] md:items-center">
                <div className="text-xs text-muted-foreground">{time}</div>
                <div><div className="font-semibold text-sm">{event}</div><div className="text-xs text-muted-foreground mt-1">{context}</div></div>
                <Badge variant="outline" className="w-fit">{state}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>;
}
