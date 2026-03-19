"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/layout/TopBar";

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
  const [activePill, setActivePill] = useState<PillId>("client-journey");
  const ActiveView = VIEW_MAP[activePill];

  return (
    <div className="min-h-screen bg-[#F9F9F6]">
      <TopBar
        title="Indulge Eco"
        subtitle="The story of Indulge Eco operations — client journey, onboarding flows, and company structure"
        variant="default"
      />

      {/* Pill navigation — horizontally scrolling, swipeable on mobile */}
      <div className="sticky top-[65px] z-20 px-4 md:px-6 lg:px-8 py-4 bg-[#F9F9F6]/95 backdrop-blur-md border-b border-stone-200/80">
        <div className="flex justify-center overflow-x-auto hidden-scrollbar whitespace-nowrap -mx-1">
          <div className="flex items-center gap-1.5 py-1.5 px-2 rounded-2xl bg-stone-200/40 backdrop-blur-md ring-1 ring-stone-300/40 shadow-sm inline-flex">
            {PILLS.map((pill) => (
              <button
                key={pill.id}
                onClick={() => setActivePill(pill.id)}
                className="relative px-5 py-2.5 rounded-xl text-sm font-medium transition-colors duration-300 min-w-fit"
              >
                {activePill === pill.id && (
                  <motion.span
                    layoutId="indulge-world-pill"
                    className="absolute inset-0 rounded-xl bg-sidebar-active shadow-[0_2px_8px_rgb(0,0,0,0.15)] ring-1 ring-stone-800/30"
                    transition={{
                      type: "spring",
                      bounce: 0.2,
                      duration: 0.4,
                    }}
                  />
                )}
                <span
                  className={`relative z-10 ${
                    activePill === pill.id
                      ? "text-[#D4AF37] font-semibold"
                      : "text-stone-600 hover:text-stone-800"
                  }`}
                >
                  {pill.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content area — centrally aligned, fluid padding */}
      <div className="px-4 md:px-6 lg:px-8 py-6 md:py-8 flex flex-col items-center">
        <TooltipProvider delayDuration={200}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activePill}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <ActiveView />
            </motion.div>
          </AnimatePresence>
        </TooltipProvider>
      </div>
    </div>
  );
}
