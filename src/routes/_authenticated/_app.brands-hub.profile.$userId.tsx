import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBhProfile } from "@/lib/brandhub.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/_app/brands-hub/profile/$userId")({
  head: () => ({
    meta: [
      { title: "ملف عضو — Brands Hub — e-GURUS" },
      { name: "description", content: "مهام ومنشورات عضو الفريق داخل Brands Hub." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BhProfile,
});

function BhProfile() {
  const { userId } = Route.useParams();
  const fn = useServerFn(getBhProfile);
  const q = useQuery({ queryKey: ["bh-profile", userId], queryFn: () => fn({ data: { userId } }) });

  const brandName = (id: string | null) => q.data?.brands.find((b) => b.id === id)?.name ?? null;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl mx-auto">
      <Button asChild variant="ghost" size="sm">
        <Link to="/brands-hub/creative">
          <ArrowLeft className="w-4 h-4 me-1" /> Creative Feed
        </Link>
      </Button>

      <h1 className="text-2xl font-extrabold">{q.data?.user.email ?? "..."}</h1>

      <Card className="p-4 space-y-2">
        <div className="font-bold">المهام</div>
        {(q.data?.tasks ?? []).length === 0 ? (
          <EmptyState title="لا توجد مهام" />
        ) : (
          (q.data?.tasks ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/50 pb-2">
              <span>{t.title}</span>
              <div className="flex gap-1">
                {brandName(t.brand_id) && <Badge variant="outline">{brandName(t.brand_id)}</Badge>}
                <Badge variant="secondary">{t.status}</Badge>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="font-bold">المنشورات</div>
        {(q.data?.posts ?? []).length === 0 ? (
          <EmptyState title="لا توجد منشورات" />
        ) : (
          (q.data?.posts ?? []).map((p) => (
            <div key={p.id} className="text-sm border-b border-border/50 pb-2">
              <div className="font-medium">{p.title || "بدون عنوان"}</div>
              <div className="text-xs text-muted-foreground line-clamp-2">{p.body}</div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
