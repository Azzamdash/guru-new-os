import { tr } from "@/lib/i18n";
import { useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { LineChart, BarChart3, PieChart, TrendingUp } from "lucide-react";
import logoAsset from "@/assets/egurus-logo.asset.json";

/** Only allow same-origin absolute paths: "/x". Rejects "//host", "/\\host", and any "scheme://". */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "";
  if (!value.startsWith("/")) return "";
  if (value.startsWith("//") || value.startsWith("/\\")) return "";
  if (value.includes("://")) return "";
  return value;
}

interface LoginScreenProps {
  next?: string;
}

export function LoginScreen({ next = "" }: LoginScreenProps) {
  const navigate = useNavigate();
  const safeNext = safeNextPath(next);
  const goNext = () => {
    if (safeNext) window.location.href = safeNext;
    else navigate({ to: "/hub/$hub", params: { hub: "overview" } });
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      goNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("بيانات الدخول غير صحيحة"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.15),_transparent_60%),radial-gradient(ellipse_at_bottom_right,_hsl(var(--primary)/0.1),_transparent_50%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,_hsl(var(--border)/0.15)_1px,_transparent_1px),linear-gradient(to_bottom,_hsl(var(--border)/0.15)_1px,_transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

      <div className="grid md:grid-cols-2 gap-10 max-w-5xl w-full items-center">
        {/* Brand side */}
        <div className="flex flex-col justify-center gap-6 md:pr-8 order-2 md:order-1">
          <Link to="/" search={{ next: "" }} className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl group-hover:blur-2xl transition-all" />
              <img
                src={logoAsset.url}
                alt="e-Gurus"
                className="relative w-16 h-16 rounded-2xl object-contain p-1 shadow-lg ring-1 ring-primary/30"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-gradient-primary leading-none">e-Gurus</span>
              <span className="text-xs text-muted-foreground mt-1">Dashboard</span>
            </div>
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold leading-tight">
            {tr("حوّل بياناتك إلى")}
            <br />
            <span className="text-gradient-primary">{tr("لوحة تحكم حية")}</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg">
            {tr("اربط متاجرك أو البيزنس الخاص بيك، وشاهد الإيرادات وصافي الربح والمركز النقدي لكل فرع في\n            رسوم بيانية تفاعلية — من غير معادلات ولا نسخ ولصق.")}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {[
              { icon: TrendingUp, label: tr("مؤشرات KPI مباشرة") },
              { icon: LineChart, label: tr("اتجاهات شهرية") },
              { icon: BarChart3, label: tr("مقارنة الفروع") },
              { icon: PieChart, label: tr("توزيع المصروفات") },
            ].map((f) => (
              <div
                key={f.label}
                className="flex items-center gap-3 p-3 rounded-lg card-gradient border border-border/50"
              >
                <f.icon className="w-5 h-5 text-primary" />
                <span className="text-sm">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Login card */}
        <Card className="card-gradient p-6 md:p-8 space-y-6 border-border/50 shadow-2xl order-1 md:order-2 relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          {/* Logo inside card (mobile-friendly) */}
          <div className="flex md:hidden items-center justify-center">
            <img
              src={logoAsset.url}
              alt="e-Gurus"
              className="w-14 h-14 rounded-2xl object-contain p-1 ring-1 ring-primary/30 shadow-lg"
            />
          </div>

          <div className="relative">
            <h2 className="text-2xl font-bold">{tr("تسجيل الدخول")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tr("أدخل بريدك وكلمة المرور للمتابعة. الحسابات يُنشئها المشرف فقط.")}
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 relative">
            <div className="space-y-2">
              <Label htmlFor="email">{tr("البريد الإلكتروني")}</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{tr("كلمة المرور")}</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11">
              {loading ? "..." : tr("دخول")}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground relative">
            {tr("التسجيل الذاتي مغلق — تواصل مع المشرف لإنشاء حسابك.")}
          </p>
        </Card>
      </div>
    </main>
  );
}
