import { createFileRoute } from "@tanstack/react-router";
import { AdsInsightsView } from "@/components/AdsInsightsView";

export const Route = createFileRoute("/_authenticated/_app/reports/meta-ads")({
  head: () => ({
    meta: [
      { title: "Meta Ads — e-GURUS" },
      { name: "description", content: "أرقام Meta Ads Manager لايف لكل براند: Spend, ROAS, Conversions." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <AdsInsightsView provider="meta_ads" />,
});
