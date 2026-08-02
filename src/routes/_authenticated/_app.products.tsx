import { createFileRoute } from "@tanstack/react-router";
import { ProductCatalogTab } from "@/components/inventory/ProductCatalogTab";

export const Route = createFileRoute("/_authenticated/_app/products")({
  head: () => ({ meta: [
    { title: "المنتجات — e-GURUS" },
    { name: "description", content: "إدارة المنتجات والوحدات وقوائم الخامات." },
  ]}),
  component: () => <div className="p-6 md:p-8"><ProductCatalogTab /></div>,
});
