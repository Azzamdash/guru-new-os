import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BarChart3, Boxes, Truck, Wallet } from "lucide-react";

const TITLE = "e-Gurus OS — نظام إدارة البراندات والمخزون والأوردرات";
const DESCRIPTION =
  "e-Gurus OS نظام تشغيل متكامل للتجارة الإلكترونية: إدارة الأوردرات والشحن، المخزون والتكاليف، الخزنة والمصروفات، وتقارير مالية وتنفيذية لحظية لكل براند.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://egurus.info/" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: "https://egurus.info/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "e-Gurus OS",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: "https://egurus.info/",
          description: DESCRIPTION,
        }),
      },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  { icon: BarChart3, title: "تقارير تنفيذية", desc: "قائمة دخل، تدفقات نقدية، وأرباح لكل براند لحظيًا." },
  { icon: Boxes, title: "مخزون وتكاليف", desc: "متوسط تكلفة متحرك، أوامر إنتاج، وتحويلات بين الفروع." },
  { icon: Truck, title: "أوردرات وشحن", desc: "توزيع الأوردرات، تأكيد، مرتجعات، وتسويات شركات الشحن." },
  { icon: Wallet, title: "خزنة ومصروفات", desc: "محافظ، تحويلات داخلية، مديونيات موردين، ومستحقات." },
];

function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/hub/$hub", params: { hub: "overview" } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <main className="max-w-5xl mx-auto px-6 py-20 space-y-16">
        <section className="space-y-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">{TITLE}</h1>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">{DESCRIPTION}</p>
          <div className="flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ next: "" }}>
                تسجيل الدخول
              </Link>
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <article key={f.title} className="rounded-xl border border-border p-5 space-y-2">
              <f.icon className="w-6 h-6 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold">{f.title}</h2>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
