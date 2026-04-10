import { ShopWorkspaceView } from "@/components/shop/workspace/ShopWorkspaceView";
import { requireShopWorkspaceAccess } from "@/lib/shop/requireShopWorkspaceAccess";

export default async function ShopWorkspacePage() {
  await requireShopWorkspaceAccess();
  return <ShopWorkspaceView />;
}
