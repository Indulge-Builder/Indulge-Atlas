"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Database,
  Megaphone,
  Share2,
  Smartphone,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PILLOWY_CARD =
  "rounded-2xl bg-white/90 backdrop-blur-2xl ring-1 ring-stone-200/50 border border-stone-100/80 shadow-[0_4px_20px_rgb(0,0,0,0.03)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.9)] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.05)] hover:-translate-y-0.5";

const SOFT_ACCENT = "text-[#A8986D]";
const SOFT_ACCENT_BG = "bg-[#A8986D]/[0.08]";
const SOFT_ACCENT_BORDER = "border-[#A8986D]/25";
const SOFT_ACCENT_RING = "ring-[#A8986D]/10";

const DATABASE_STATS = [
  { label: "Vendors", value: "100+", icon: Truck, color: "teal" },
  { label: "Customers", value: "400+", icon: Users, color: "sky" },
  { label: "Pre-concierge", value: "700+", icon: Zap, color: "amber" },
] as const;

const PERFORMANCE_STATS = [
  { label: "Meta Ads", value: "Paid", icon: Megaphone, color: "violet" },
  { label: "Google Ads", value: "Paid", icon: BarChart3, color: "sky" },
  { label: "Display", value: "Retargeting", icon: BarChart3, color: "amber" },
] as const;

const SOCIAL_STATS = [
  { label: "Shruti", value: "Social Lead", icon: Users, color: "rose" },
  { label: "Manaswini", value: "Social Lead", icon: Users, color: "teal" },
] as const;

const USP = {
  title: "The App USP",
  tagline: "Google Lens–style Scanner",
  differentiator:
    'Unlike competitors that show "Sold Out," Indulge guarantees procurement and delivery.',
};

const FULFILLMENT = {
  team: "Harsh & Vikram",
  network: "100-vendor network",
  items: ["Rare items", "Concert tickets", "Watches", "Villa access"],
};

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

const COLOR_CLASSES = {
  teal: "bg-teal-50 text-teal-700 ring-1 ring-teal-200/50",
  sky: "bg-sky-50 text-sky-700 ring-1 ring-sky-200/50",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200/50",
  violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-200/50",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/50",
} as const;

export function ShopEngineView() {
  const [databaseOpen, setDatabaseOpen] = useState(false);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);

  return (
    <div className="max-w-3xl mx-auto text-center w-full">
      <h2
        className={`text-xl md:text-2xl font-semibold ${SOFT_ACCENT} tracking-tight mb-4`}
      >
        Cyclical Workflow
      </h2>
      <div className="flex items-center justify-center gap-2 mb-10">
        <span className="px-4 py-2 rounded-xl bg-rose-50/90 text-rose-700 text-sm font-medium ring-1 ring-rose-200/50 shadow-sm">
          Posts
        </span>
        <motion.span
          className="text-stone-400"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          →
        </motion.span>
        <span className="px-4 py-2 rounded-xl bg-teal-50/90 text-teal-700 text-sm font-medium ring-1 ring-teal-200/50 shadow-sm">
          Leads
        </span>
        <motion.span
          className="text-stone-400"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.25,
          }}
        >
          →
        </motion.span>
        <span className="px-4 py-2 rounded-xl bg-sky-50/90 text-sky-700 text-sm font-medium ring-1 ring-sky-200/50 shadow-sm">
          App
        </span>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-8"
      >
        {/* Traffic sources */}
        <motion.div variants={item}>
          <h3 className="text-xs font-medium text-stone-400/90 uppercase tracking-wider mb-3 flex items-center justify-center gap-2">
            <Zap strokeWidth={1.5} className="h-3.5 w-3.5 text-amber-400" />
            Traffic Sources
          </h3>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setPerformanceOpen(true)}
              className={`${PILLOWY_CARD} px-4 py-2 text-sm text-violet-600 font-medium cursor-pointer hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2`}
            >
              <BarChart3
                strokeWidth={1.5}
                className="h-4 w-4 text-violet-500"
              />
              Performance Marketing
            </button>
            <button
              onClick={() => setSocialOpen(true)}
              className={`${PILLOWY_CARD} px-4 py-2 text-sm text-rose-600 font-medium cursor-pointer hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2`}
            >
              <Share2 strokeWidth={1.5} className="h-4 w-4 text-rose-500" />
              Social
            </button>
            <button
              onClick={() => setDatabaseOpen(true)}
              className={`${PILLOWY_CARD} px-4 py-2 text-sm text-teal-600 font-medium cursor-pointer hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2`}
            >
              <Database strokeWidth={1.5} className="h-4 w-4 text-teal-500" />
              Database
            </button>
          </div>
        </motion.div>

        {/* USP — center highlight */}
        <motion.div
          variants={item}
          className={`rounded-2xl ${SOFT_ACCENT_BG} ${SOFT_ACCENT_BORDER} p-6 ring-1 ${SOFT_ACCENT_RING} shadow-[0_4px_20px_rgba(168,152,109,0.08)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)] transition-all duration-300 hover:shadow-[0_8px_30px_rgba(168,152,109,0.1)] hover:-translate-y-0.5 text-center`}
        >
          <h3
            className={`text-sm font-semibold ${SOFT_ACCENT} flex items-center justify-center gap-2`}
          >
            <Smartphone strokeWidth={1.5} className="h-4 w-4 text-sky-400" />
            {USP.title}
          </h3>
          <p className="text-sm text-stone-600 mt-1 font-medium">
            {USP.tagline}
          </p>
          <p className="text-sm text-stone-500/90 mt-3 leading-relaxed">
            {USP.differentiator}
          </p>
        </motion.div>

        {/* Fulfillment backend */}
        <motion.div variants={item}>
          <h3 className="text-xs font-medium text-stone-400/90 uppercase tracking-wider mb-3 flex items-center justify-center gap-2">
            <Truck strokeWidth={1.5} className="h-3.5 w-3.5 text-teal-500" />
            Fulfillment Backend
          </h3>
          <div className={`${PILLOWY_CARD} p-6 text-center`}>
            <p className="text-sm text-stone-500/90">
              <span className={`${SOFT_ACCENT} font-medium`}>
                {FULFILLMENT.team}
              </span>{" "}
              leveraging a{" "}
              <span className="text-[#A8986D]/90 font-medium">
                {FULFILLMENT.network}
              </span>{" "}
              to secure:
            </p>
            <ul className="mt-3 flex flex-wrap gap-2 justify-center">
              {FULFILLMENT.items.map((fulfillmentItem) => (
                <li
                  key={fulfillmentItem}
                  className="px-3 py-1.5 rounded-lg bg-stone-50/80 text-sm text-stone-600/90 ring-1 ring-stone-200/30"
                >
                  {fulfillmentItem}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </motion.div>

      <Dialog open={databaseOpen} onOpenChange={setDatabaseOpen}>
        <DialogContent className="max-w-sm border-0 bg-white/95 backdrop-blur-xl shadow-[0_24px_60px_-12px_rgb(0,0,0,0.12)] ring-1 ring-stone-200/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-stone-800">
              <Database className="h-5 w-5 text-teal-500" strokeWidth={1.5} />
              HNI WhatsApp Database
            </DialogTitle>
          </DialogHeader>
          <div className="mt-6 space-y-4">
            {DATABASE_STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className={`flex items-center justify-between rounded-xl px-5 py-4 ${COLOR_CLASSES[stat.color]}`}
                >
                  <span className="flex items-center gap-2.5 text-sm font-medium">
                    <Icon strokeWidth={1.5} className="h-4 w-4 opacity-80" />
                    {stat.label}
                  </span>
                  <span className="text-lg font-bold">{stat.value}</span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={performanceOpen} onOpenChange={setPerformanceOpen}>
        <DialogContent className="max-w-sm border-0 bg-white/95 backdrop-blur-xl shadow-[0_24px_60px_-12px_rgb(0,0,0,0.12)] ring-1 ring-stone-200/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-stone-800">
              <BarChart3
                className="h-5 w-5 text-violet-500"
                strokeWidth={1.5}
              />
              Performance Marketing
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-stone-500 mt-1">Led by Andreas</p>
          <div className="mt-6 space-y-4">
            {PERFORMANCE_STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className={`flex items-center justify-between rounded-xl px-5 py-4 ${COLOR_CLASSES[stat.color]}`}
                >
                  <span className="flex items-center gap-2.5 text-sm font-medium">
                    <Icon strokeWidth={1.5} className="h-4 w-4 opacity-80" />
                    {stat.label}
                  </span>
                  <span className="text-sm font-semibold">{stat.value}</span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={socialOpen} onOpenChange={setSocialOpen}>
        <DialogContent className="max-w-sm border-0 bg-white/95 backdrop-blur-xl shadow-[0_24px_60px_-12px_rgb(0,0,0,0.12)] ring-1 ring-stone-200/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-stone-800">
              <Share2 className="h-5 w-5 text-rose-500" strokeWidth={1.5} />
              Social
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-stone-500 mt-1">
            Instagram, WhatsApp & community
          </p>
          <div className="mt-6 space-y-4">
            {SOCIAL_STATS.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className={`flex items-center justify-between rounded-xl px-5 py-4 ${COLOR_CLASSES[stat.color]}`}
                >
                  <span className="flex items-center gap-2.5 text-sm font-medium">
                    <Icon strokeWidth={1.5} className="h-4 w-4 opacity-80" />
                    {stat.label}
                  </span>
                  <span className="text-sm font-semibold">{stat.value}</span>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
