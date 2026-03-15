"use client";

import { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  FileText,
  TrendingUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminCreateTaskModal } from "@/components/tasks/AdminCreateTaskModal";
import { MarketingAgentPerformanceModal } from "@/components/marketing/MarketingAgentPerformanceModal";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// ── Glass card base style ────────────────────────────────────

const GLASS_CARD =
  "bg-white/80 backdrop-blur-2xl ring-1 ring-black/[0.03] shadow-[0_8px_30px_rgb(0,0,0,0.02)]";

// ── Mock data (high-end campaigns) ────────────────────────────

const MOCK_TOTAL_POSTS = 124;

const MOCK_COMMUNITY_GROWTH = {
  overall: "+18%",
  breakdown: [
    { label: "WhatsApp", value: "+450 Members", semantic: "text-emerald-600 bg-emerald-50 px-2 rounded-full" },
    { label: "Instagram", value: "+1.2k Followers", semantic: "text-rose-600 bg-rose-50 px-2 rounded-full" },
    { label: "Shop App", value: "+320 Installs", semantic: "text-sky-600 bg-sky-50 px-2 rounded-full" },
  ],
};

const MOCK_MARKETING_TEAM = [
  { id: "smruti", name: "Smruti", postsCreated: 28, avgEngagement: 4.2, campaignsManaged: 3, avatar: "S" },
  { id: "manaswini", name: "Manaswini", postsCreated: 22, avgEngagement: 5.1, campaignsManaged: 2, avatar: "M" },
  { id: "prajith", name: "Prajith", postsCreated: 19, avgEngagement: 3.8, campaignsManaged: 4, avatar: "P" },
  { id: "pixel", name: "Pixel", postsCreated: 31, avgEngagement: 6.2, campaignsManaged: 5, avatar: "P" },
  { id: "danish", name: "Danish", postsCreated: 24, avgEngagement: 4.5, campaignsManaged: 2, avatar: "D" },
];

const PILLOWY_CARD =
  "bg-white/80 backdrop-blur-2xl ring-1 ring-black/[0.03] shadow-[0_8px_30px_rgb(0,0,0,0.02)]";

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Community Growth Card (Interactive Bento) ──────────────────

function CommunityGrowthCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <LayoutGroup>
      <motion.div
        layout
        onClick={() => setExpanded(!expanded)}
        className={cn(
          GLASS_CARD,
          "rounded-2xl p-5 cursor-pointer transition-all duration-300",
          "hover:shadow-[0_8px_40px_rgb(0,0,0,0.04)]",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
                Community Growth
              </p>
              <p className="text-xl font-semibold text-stone-800 tabular-nums">
                Overall Growth: {MOCK_COMMUNITY_GROWTH.overall}
              </p>
            </div>
          </div>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.25 }}
            className="text-stone-400"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.span>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              layout
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-stone-100 space-y-2">
                {MOCK_COMMUNITY_GROWTH.breakdown.map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-stone-600">{item.label}</span>
                    <span className={cn("text-sm font-semibold tabular-nums", item.semantic)}>
                      {item.value}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Soft trend line (decorative) */}
        {!expanded && (
          <div className="mt-3 h-8 flex items-end gap-0.5">
            {[40, 55, 48, 72, 65, 82, 78].map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="w-2 rounded-full bg-emerald-200/60"
              />
            ))}
          </div>
        )}
      </motion.div>
    </LayoutGroup>
  );
}


// ── Main client ───────────────────────────────────────────────

export function MarketingOversightClient() {
  const [selectedAgent, setSelectedAgent] = useState<(typeof MOCK_MARKETING_TEAM)[number] | null>(null);

  return (
    <div className="space-y-8">
      {/* Phase 3: Apex Metrics — top row of glass cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Total Posts */}
        <div
          className={cn(
            GLASS_CARD,
            "rounded-2xl p-5 flex items-center gap-4",
          )}
        >
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center">
            <FileText className="w-6 h-6 text-rose-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-widest">
              Total Posts (This Month)
            </p>
            <p className="text-3xl font-semibold text-stone-800 tabular-nums">
              {MOCK_TOTAL_POSTS}
            </p>
          </div>
        </div>

        {/* Card 2: Community Growth (Interactive) */}
        <CommunityGrowthCard />
      </div>

      {/* Phase 4: Team Performance — Marketing Tab */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-lg font-semibold text-stone-800"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            Team Performance
          </h2>
          <AdminCreateTaskModal defaultDepartment="marketing" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MOCK_MARKETING_TEAM.map((agent, i) => (
            <motion.button
              key={agent.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setSelectedAgent(agent)}
              className={cn(
                "rounded-2xl p-5 text-left",
                PILLOWY_CARD,
                "hover:-translate-y-1 hover:shadow-[0_8px_40px_rgb(0,0,0,0.06)] transition-all duration-300 cursor-pointer",
              )}
            >
              <div className="flex gap-4">
                <Avatar className="w-14 h-14 rounded-full ring-2 ring-stone-200/50 shrink-0">
                  <AvatarFallback className="bg-stone-200/80 text-stone-600 text-base font-medium">
                    {getInitials(agent.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-stone-900 font-semibold text-sm truncate">
                    {agent.name}
                  </p>
                  <p className="text-stone-500 text-xs mt-0.5 tabular-nums">
                    Posts Created: {agent.postsCreated}
                  </p>
                  <p className="text-stone-500 text-xs mt-0.5 tabular-nums">
                    Avg Engagement: {agent.avgEngagement}%
                  </p>
                  <p className="text-emerald-600/95 text-xs font-semibold mt-0.5 tabular-nums">
                    Campaigns: {agent.campaignsManaged}
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      <MarketingAgentPerformanceModal
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  );
}
