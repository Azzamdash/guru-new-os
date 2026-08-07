import { createFileRoute } from "@tanstack/react-router";
import { OrdersListTab } from "@/components/orders/OrdersListTab";

export const Route = createFileRoute("/_authenticated/_app/orders-list")({
  head: () => ({
    meta: [
      { title: "الأوردرات — e-GURUS" },
      {
        name: "description",
        content: "قائمة كل الأوردرات مع البحث والفلترة وإنشاء أوردر جديد.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrdersListTab,
});
