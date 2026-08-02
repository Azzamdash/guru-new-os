import { createFileRoute } from "@tanstack/react-router";
import { SuppliersTab } from "@/components/inventory/SuppliersTab";

export const Route = createFileRoute("/_authenticated/_app/suppliers/")({
  head: () => ({ meta: [{ title: "الموردين — e-GURUS" }] }),
  component: () => <div className="p-6 md:p-8"><SuppliersTab /></div>,
});
