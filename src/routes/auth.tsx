import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LoginScreen, safeNextPath } from "@/components/auth/LoginScreen";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: safeNextPath(s.next),
  }),

  head: () => ({
    meta: [
      { title: "تسجيل الدخول — e-GURUS Dashboard" },
      {
        name: "description",
        content: "سجّل الدخول لإدارة براندك وعرض لوحة التحكم المالية والتشغيلية.",
      },
      { property: "og:title", content: "تسجيل الدخول — e-GURUS Dashboard" },
      {
        property: "og:description",
        content: "بوابة الدخول إلى لوحة تحكم e-GURUS المالية والتشغيلية.",
      },
      { property: "og:url", content: "https://egurus.info/auth" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "تسجيل الدخول — e-GURUS Dashboard" },
      {
        name: "twitter:description",
        content: "بوابة الدخول إلى لوحة تحكم e-GURUS المالية والتشغيلية.",
      },
    ],
    links: [{ rel: "canonical", href: "https://egurus.info/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  return (
    <ClientOnly fallback={null}>
      <LoginScreen next={next} />
    </ClientOnly>
  );
}
