"use client";

import { OrgChart } from "./OrgChart";

const PILLOWY_CONTAINER =
  "max-w-6xl mx-auto rounded-2xl bg-white/90 backdrop-blur-2xl p-8 ring-1 ring-stone-200/50 border border-stone-100/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)]";

export function CompanyStructureView() {
  return (
    <div className={`${PILLOWY_CONTAINER} text-center w-full`}>
      <h2 className="text-lg font-semibold text-sidebar-active tracking-tight mb-1">
        Company Structure
      </h2>
      <p className="text-sm text-stone-600 mb-10">
        The Indulge Eco org chart — founders, POC, and departments
      </p>

      <OrgChart />
    </div>
  );
}
