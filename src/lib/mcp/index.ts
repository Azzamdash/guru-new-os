import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listBrands from "./tools/list_brands";
import listProducts from "./tools/list_products";
import listSuppliers from "./tools/list_suppliers";
import listTasks from "./tools/list_tasks";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "e-gurus-mcp",
  title: "e-GURUS Dashboard",
  version: "0.1.0",
  instructions:
    "Read-only tools over the signed-in user's e-GURUS data (brands, products, suppliers, tasks). Access is scoped by the user's role and brand permissions via database policies.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listBrands, listProducts, listSuppliers, listTasks],
});
