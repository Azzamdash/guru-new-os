import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { LineChart, BarChart3, PieChart, TrendingUp } from "lucide-react";
import logoAsset from "@/assets/egurus-logo.asset.json";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") ? s.next : "",
  }),
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — e-GURUS Dashboard" },
      { name: "description", content: "سجّل الدخول لإدارة براندك وعرض لوحة التحكم المالية والتشغيلية." },
      { property: "og:title", content: "تسجيل الدخول — e-GURUS Dashboard" },
      { property: "og:description", content: "بوابة الدخول إلى لوحة تحكم e-GURUS المالية والتشغيلية." },
      { property: "og:url", content: "https://egurus.info/auth" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "تسجيل الدخول — e-GURUS Dashboard" },
      { name: "twitter:description", content: "بوابة الدخول إلى لوحة تحكم e-GURUS المالية والتشغيلية." },
    ],
    links: [{ rel: "canonical", href: "https://egurus.info/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const goNext = () => {
    if (next) window.location.href = next;
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
      toast.error(err instanceof Error ? err.message : "بيانات الدخول غير صحيحة");
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    const redirectBase = window.location.origin + (next || "");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: redirectBase,
    });
    if (result.error) {
      toast.error("فشل تسجيل الدخول بـ Google");
      return;
    }
    if (result.redirected) return;
    goNext();
  };


  return (
    <main className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.15),_transparent_60%),radial-gradient(ellipse_at_bottom_right,_hsl(var(--primary)/0.1),_transparent_50%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,_hsl(var(--border)/0.15)_1px,_transparent_1px),linear-gradient(to_bottom,_hsl(var(--border)/0.15)_1px,_transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />

      <div className="grid md:grid-cols-2 gap-10 max-w-5xl w-full items-center">
        {/* Brand side */}
        <div className="flex flex-col justify-center gap-6 md:pr-8 order-2 md:order-1">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-xl group-hover:blur-2xl transition-all" />
              <img
                src={logoAsset.url}
                alt="e-Gurus"
                className="relative w-16 h-16 rounded-2xl object-cover shadow-lg ring-1 ring-primary/30"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-gradient-primary leading-none">e-Gurus</span>
              <span className="text-xs text-muted-foreground mt-1">Dashboard</span>
            </div>
          </Link>

          <h1 className="text-3xl md:text-4xl font-bold leading-tight">
            حوّل بياناتك إلى<br />
            <span className="text-gradient-primary">لوحة تحكم حية</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg">
            اربط متاجرك أو البيزنس الخاص بيك، وشاهد الإيرادات وصافي الربح والمركز النقدي
            لكل فرع في رسوم بيانية تفاعلية — من غير معادلات ولا نسخ ولصق.
          </p>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {[
              { icon: TrendingUp, label: "مؤشرات KPI مباشرة" },
              { icon: LineChart, label: "اتجاهات شهرية" },
              { icon: BarChart3, label: "مقارنة الفروع" },
              { icon: PieChart, label: "توزيع المصروفات" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3 p-3 rounded-lg card-gradient border border-border/50">
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
              className="w-14 h-14 rounded-2xl object-cover ring-1 ring-primary/30 shadow-lg"
            />
          </div>

          <div className="relative">
            <h2 className="text-2xl font-bold">تسجيل الدخول</h2>
            <p className="text-sm text-muted-foreground mt-1">
              أدخل بريدك وكلمة المرور للمتابعة. الحسابات يُنشئها المشرف فقط.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-11 gap-2 relative"
            onClick={onGoogle}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            المتابعة عبر Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">أو</span>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 relative">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11">
              {loading ? "..." : "دخول"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground relative">
            التسجيل الذاتي مغلق — تواصل مع المشرف لإنشاء حسابك.
          </p>
        </Card>
      </div>
    </main>
  );
}
