"use client";

import dynamic from "next/dynamic";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/layout/TopBar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const viewLoading = () => (
  <div className="mx-auto h-80 w-full max-w-6xl animate-pulse rounded-2xl bg-stone-100/50" />
);

const ClientJourneyView = dynamic(
  () =>
    import("@/components/indulge-world/ClientJourneyView").then(
      (m) => m.ClientJourneyView,
    ),
  { ssr: false, loading: viewLoading },
);

const BrandOnboardingView = dynamic(
  () =>
    import("@/components/indulge-world/BrandOnboardingView").then(
      (m) => m.BrandOnboardingView,
    ),
  { ssr: false, loading: viewLoading },
);

const CompanyStructureView = dynamic(
  () =>
    import("@/components/indulge-world/CompanyStructureView").then(
      (m) => m.CompanyStructureView,
    ),
  { ssr: false, loading: viewLoading },
);

const ShopEngineView = dynamic(
  () =>
    import("@/components/indulge-world/ShopEngineView").then(
      (m) => m.ShopEngineView,
    ),
  { ssr: false, loading: viewLoading },
);

const PILLS = [
  { id: "client-journey", label: "Client Journey" },
  { id: "brand-onboarding", label: "Brand Onboarding" },
  { id: "company-structure", label: "Company Structure" },
  { id: "shop-engine", label: "The Shop Engine" },
] as const;

type PillId = (typeof PILLS)[number]["id"];

const VIEW_MAP: Record<PillId, React.ComponentType> = {
  "client-journey": ClientJourneyView,
  "brand-onboarding": BrandOnboardingView,
  "company-structure": CompanyStructureView,
  "shop-engine": ShopEngineView,
};

export default function IndulgeWorldPage() {
  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Indulge Eco"
        subtitle="The story of Indulge Eco operations — client journey, onboarding flows, and company structure"
        variant="default"
      />

      <Tabs
        defaultValue="client-journey"
        indicatorLayoutId="indulge-world-pill"
        className="w-full"
      >
        <div className="sticky top-[65px] z-20 border-b border-stone-200/80 bg-[#F9F9F6]/95 px-4 py-4 backdrop-blur-md md:px-6 lg:px-8">
          <div className="mx-auto flex justify-center overflow-x-auto hidden-scrollbar -mx-1 whitespace-nowrap">
            <TabsList>
              {PILLS.map((pill) => (
                <TabsTrigger key={pill.id} value={pill.id} className="min-w-fit">
                  {pill.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <div className="flex flex-col items-center px-4 py-6 md:px-6 md:py-8 lg:px-8">
          <TooltipProvider delayDuration={200}>
            {PILLS.map((pill) => {
              const View = VIEW_MAP[pill.id];
              return (
                <TabsContent
                  key={pill.id}
                  value={pill.id}
                  className="mt-0 w-full max-w-6xl"
                >
                  <View />
                </TabsContent>
              );
            })}
          </TooltipProvider>
        </div>
      </Tabs>
    </div>
  );
}
