import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InventoryDashboardTab } from "@/components/inventory/InventoryDashboardTab";
import { ProductCatalogTab } from "@/components/inventory/ProductCatalogTab";
import { StockTransfersTab } from "@/components/inventory/StockTransfersTab";
import { SuppliersTab } from "@/components/inventory/SuppliersTab";
import { PurchaseOrdersTab } from "@/components/inventory/PurchaseOrdersTab";
import { InventoryAnalyticsTab } from "@/components/inventory/InventoryAnalyticsTab";
import { InventoryIntelligenceTab } from "@/components/inventory/InventoryIntelligenceTab";

export const Route = createFileRoute("/_authenticated/_app/inventory-management")({
  head: () => ({ meta: [
    { title: "إدارة المخزون — e-GURUS" },
    { name: "description", content: "الرئيسية، الكتالوج، نقل المخزون، الموردين، أوامر الشراء، التحليلات، والذكاء — كل حاجة عن المخزون في مكان واحد." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: InventoryManagementPage,
});

function InventoryManagementPage() {
  return (
    <div className="p-6 md:p-8 space-y-4">
      <div>
        <h1 className="text-3xl font-bold">إدارة المخزون</h1>
        <p className="text-muted-foreground text-sm mt-1">كل حاجة عن المخزون: المنتجات، النقل بين البراندات والفروع، الموردين، أوامر الشراء، والتحليلات.</p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard">الرئيسية</TabsTrigger>
          <TabsTrigger value="catalog">الكتالوج</TabsTrigger>
          <TabsTrigger value="transfers">نقل المخزون</TabsTrigger>
          <TabsTrigger value="suppliers">الموردين</TabsTrigger>
          <TabsTrigger value="purchase-orders">أوامر الشراء</TabsTrigger>
          <TabsTrigger value="analytics">التحليلات</TabsTrigger>
          <TabsTrigger value="intelligence">الذكاء</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="pt-4"><InventoryDashboardTab /></TabsContent>
        <TabsContent value="catalog" className="pt-4"><ProductCatalogTab /></TabsContent>
        <TabsContent value="transfers" className="pt-4"><StockTransfersTab /></TabsContent>
        <TabsContent value="suppliers" className="pt-4"><SuppliersTab /></TabsContent>
        <TabsContent value="purchase-orders" className="pt-4"><PurchaseOrdersTab /></TabsContent>
        <TabsContent value="analytics" className="pt-4"><InventoryAnalyticsTab /></TabsContent>
        <TabsContent value="intelligence" className="pt-4"><InventoryIntelligenceTab /></TabsContent>
      </Tabs>
    </div>
  );
}
