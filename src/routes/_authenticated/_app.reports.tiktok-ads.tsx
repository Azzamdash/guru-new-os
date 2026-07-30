import { createFileRoute } from "@tanstack/react-router";
import { AdsInsightsView } from "@/components/AdsInsightsView";

export const Route = createFileRoute("/_authenticated/_app/reports/tiktok-ads")({
  head: () => ({
    meta: [
      { title: "TikTok Ads — e-GURUS" },
      { name: "description", content: "أرقام TikTok Ads Manager لايف لكل براند: Spend, ROAS, Conversions." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <AdsInsightsView provider="tiktok_ads" />,
});
