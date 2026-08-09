import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, PackageSearch, Truck, Wallet } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const priorities = [
  { level: "critical", title: "تسويات شحن تحتاج مراجعة", detail: "3 تسويات تحتاج إلى مطابقة", action: "مراجعة", icon: Wallet },
  { level: "warning", title: "12 عملية متأخرة", detail: "5 منها تجاوزت الموعد المتوقع للتسليم", action: "فحص", icon: Clock3 },
  { level: "warning", title: "مخزون منخفض", detail: "مخزون أحد البراندات يقترب من الحد الآمن", action: "فتح المخزون", icon: PackageSearch },
  { level: "normal", title: "5 موافقات معلقة", detail: "لا يوجد تجاوز للـ SLA حتى الآن", action: "مراجعة", icon: CheckCircle2 },
];

const events = [
  ["09:42", "تم تسليم أوردر", "العميل · أحمد حسن", "مكتمل"],
  ["09:18", "تم إسناد مندوب", "التوزيع · فرع A", "محدث"],
  ["08:51", "تم تسجيل تحصيل", "العميل · سارة علي", "مكتمل"],
  ["08:27", "انخفاض المخزون تحت الحد", "Brand X · المخزن", "يحتاج انتباه"],
];

export default function GuruCommandCenterDemo() {
  const { lang } = useLang();
  const ar = lang === "ar";

  return (
    <main dir={ar ? "rtl" : "ltr"} className="relative min-h-full bg-background p-4 md:p-6 space-y-5">
      <div className="pointer-events-none fixed top-[-10%] right-[-10%] w-72 h-72 rounded-full bg-primary/10 blur-[120px] -z-10" />
      <div className="pointer-events-none fixed bottom-[-5%] left-[-10%] w-72 h-72 rounded-full bg-primary/5 blur-[120px] -z-10" />

      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <GaugeIcon />
          </div>
          <div>
            <div className="text-xs font-semibold text-primary">e-Gurus · مركز التحكم</div>
            <h1 className="mt-1 text-xl md:text-2xl font-extrabold">مركز التحكم</h1>
            <p className="text-xs text-muted-foreground mt-1">أهم ما يحدث في النظام وما يحتاج إلى انتباهك الآن.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/guru-recall">الذاكرة التشغيلية <ArrowLeft className="w-4 h-4" /></Link>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SummaryCard value="3" label="يحتاج تدخل عاجل" icon={AlertTriangle} tone="destructive" />
        <SummaryCard value="7" label="يحتاج مراجعة" icon={Clock3} tone="warning" />
        <SummaryCard value="24" label="تعمل بشكل طبيعي" icon={CheckCircle2} tone="success" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="p-4 md:p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold">يحتاج تدخل</h2>
              <p className="text-xs text-muted-foreground mt-1">الأولوية الحالية من العمليات اليومية.</p>
            </div>
            <Badge variant="secondary">4 عناصر</Badge>
          </div>
          <div className="space-y-2">
            {priorities.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-border/60 bg-background/50 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center"><Icon className="w-4 h-4 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={item.level === "critical" ? "destructive" : item.level === "warning" ? "secondary" : "outline"} className="text-[10px]">{item.level === "critical" ? "عاجل" : item.level === "warning" ? "انتباه" : "طبيعي"}</Badge>
                      <span className="font-semibold text-sm truncate">{item.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0">{item.action}</Button>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4 md:p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
          <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-primary" /><h2 className="text-sm font-bold">نبض التشغيل</h2></div>
          <div className="mt-5 space-y-5">
            <Pulse label="الأوردرات" value="+18%" width="78%" />
            <Pulse label="تأخير الشحن" value="+7%" width="46%" />
            <Pulse label="صحة المخزون" value="82%" width="82%" />
          </div>
          <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <div className="font-semibold">ملاحظة من Guru</div>
            <p className="text-xs text-muted-foreground mt-1">لاحظنا ارتفاعًا في تأخير عمليات الشحن مقارنة بالأسبوع الماضي.</p>
            <Button variant="link" size="sm" className="px-0 mt-1">اعرف السبب</Button>
          </div>
        </Card>
      </section>

      <Card className="p-4 md:p-5 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><h2 className="text-sm font-bold">آخر النشاطات</h2><p className="text-xs text-muted-foreground mt-1">خط زمني موحد للعملاء والمندوبين والمخزون والتوزيع.</p></div>
          <Button asChild variant="outline" size="sm"><Link to="/guru-recall">عرض الذاكرة كاملة</Link></Button>
        </div>
        <div className="mt-3 divide-y divide-border">
          {events.map(([time, event, context, state]) => (
            <div key={`${time}-${event}`} className="grid gap-2 py-4 md:grid-cols-[70px_1fr_auto] md:items-center">
              <div className="text-xs text-muted-foreground">{time}</div>
              <div><div className="text-sm font-semibold">{event}</div><div className="text-xs text-muted-foreground mt-1">{context}</div></div>
              <Badge variant="outline" className="w-fit">{state}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </main>
  );
}

function SummaryCard({ value, label, icon: Icon, tone }: { value: string; label: string; icon: typeof AlertTriangle; tone: "destructive" | "warning" | "success" }) {
  const toneClass = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-amber-500" : "text-emerald-500";
  return <Card className="p-4 rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl"><div className="flex items-center gap-3"><Icon className={`w-5 h-5 ${toneClass}`} /><div><div className="text-2xl font-extrabold">{value}</div><div className="text-xs text-muted-foreground mt-0.5">{label}</div></div></div></Card>;
}

function Pulse({ label, value, width }: { label: string; value: string; width: string }) {
  return <div><div className="flex justify-between text-xs"><span>{label}</span><span className="font-semibold">{value}</span></div><div className="mt-2 h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width }} /></div></div>;
}

function GaugeIcon() {
  return <svg viewBox="0 0 24 24" className="w-5 h-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14a8 8 0 1 1 16 0" /><path d="M12 14l4-4" /><path d="M5 18h14" /></svg>;
}
