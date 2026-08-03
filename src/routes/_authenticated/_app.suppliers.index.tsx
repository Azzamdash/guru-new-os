import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { SuppliersTab } from "@/components/inventory/SuppliersTab";

export const Route = createFileRoute("/_authenticated/_app/suppliers/")({
  head: () => ({ meta: [{ title: tr("الموردين — e-GURUS") }] }),
  component: () => (
    <div className="p-6 md:p-8">
      <SuppliersTab />
    </div>
  ),
});
