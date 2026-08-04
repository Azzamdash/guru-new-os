import { createFileRoute } from "@tanstack/react-router";
import { OrderDistributionTab } from "@/components/orders/OrderDistributionTab";

export const Route = createFileRoute("/_authenticated/_app/order-distribution")({
  head: () => ({
    meta: [
      { title: "توزيع الأوردرات — e-GURUS" },
      {
        name: "description",
        content:
          "توزيع الأوردرات على شركات الشحن والمناديب مع اقتراح تلقائي حسب المحافظة وحمل كل شركة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OrderDistributionTab,
});
