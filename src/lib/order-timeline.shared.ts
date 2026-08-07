import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrderTimeline } from "@/lib/orders-management.functions";
import { queryPresets } from "@/lib/query-presets";

export function useOrderTimeline(orderId: string) {
  const fn = useServerFn(getOrderTimeline);
  return useQuery({
    queryKey: ["order-timeline", orderId],
    queryFn: () => fn({ data: { orderId } }),
    enabled: !!orderId,
    ...queryPresets.live,
  });
}
