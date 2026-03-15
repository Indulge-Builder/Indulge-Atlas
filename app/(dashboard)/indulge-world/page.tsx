"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopBar } from "@/components/layout/TopBar";
import { ClientJourneyView } from "@/components/indulge-world/ClientJourneyView";
import { BrandOnboardingView } from "@/components/indulge-world/BrandOnboardingView";
import { CompanyStructureView } from "@/components/indulge-world/CompanyStructureView";
import { ShopEngineView } from "@/components/indulge-world/ShopEngineView";

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

      {/* Pill navigation — horizontally scrolling, center-aligned */}
      <div className="sticky top-[65px] z-20 px-8 py-4 bg-[#F9F9F6]/95 backdrop-blur-md border-b border-stone-200/80">
        <div className="flex justify-center overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1.5 py-1.5 px-2 rounded-2xl bg-stone-200/40 backdrop-blur-md ring-1 ring-stone-300/40 shadow-sm">
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

      {/* Content area — centrally aligned */}
      <div className="px-8 py-8 flex flex-col items-center">
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
