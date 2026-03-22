import { Suspense } from "react";
import { ShopOversightClient } from "@/components/shop/ShopOversightClient";
import {
  ShopDashboardTab,
  ShopDashboardSkeleton,
} from "@/components/shop/ShopDashboardTab";
import { getShopPulse } from "@/lib/actions/dashboards";

async function ShopPulseSection() {
  const data = await getShopPulse();
  return <ShopDashboardTab data={data} />;
}

export default function ShopOversightPage() {
  return (
    <ShopOversightClient
      pulseSlot={
        <Suspense fallback={<ShopDashboardSkeleton />}>
          <ShopPulseSection />
        </Suspense>
      }
    />
  );
}
