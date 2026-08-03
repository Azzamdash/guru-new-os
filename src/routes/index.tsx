import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { LoginScreen, safeNextPath } from "@/components/auth/LoginScreen";

const TITLE = "تسجيل الدخول — e-GURUS Dashboard";
const DESCRIPTION = "سجّل الدخول لإدارة براندك وعرض لوحة التحكم المالية والتشغيلية.";

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: safeNextPath(s.next),
  }),
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
  }),
  component: HomeLoginPage,
});

function HomeLoginPage() {
  const { next } = Route.useSearch();
  return (
    <ClientOnly fallback={null}>
      <LoginScreen next={next} />
    </ClientOnly>
  );
}
