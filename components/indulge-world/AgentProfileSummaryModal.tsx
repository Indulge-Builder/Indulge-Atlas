"use client";

import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckSquare, Users, IndianRupee, BarChart3 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TermTooltip } from "./TermTooltip";

export type Employee = {
  id: string;
  name: string;
  role: string;
  department?: string;
  isLead: boolean;
  sops?: string[];
};

// ── Department semantic colors (Light Quiet Luxury) ─────────────────────────

const DEPARTMENT_STYLES: Record<string, string> = {
  Founder: "bg-amber-50 text-amber-700 ring-amber-500/10",
  POC: "bg-stone-100 text-stone-700 ring-stone-400/20",
  Tech: "bg-slate-50 text-slate-600 ring-slate-400/15",
  Finance: "bg-emerald-50 text-emerald-600 ring-emerald-500/10",
  "Performance Marketing": "bg-blue-50 text-blue-600 ring-blue-500/10",
  Onboarding: "bg-violet-50 text-violet-600 ring-violet-500/10",
  Shop: "bg-amber-50 text-amber-600 ring-amber-500/10",
  Concierge: "bg-rose-50 text-rose-600 ring-rose-500/10",
  Marketing: "bg-indigo-50 text-indigo-600 ring-indigo-500/10",
  Legacy: "bg-stone-100 text-stone-600 ring-stone-400/15",
  House: "bg-teal-50 text-teal-600 ring-teal-500/10",
};

function getDepartmentStyle(employee: Employee): string {
  const key =
    employee.role === "Founder"
      ? "Founder"
      : employee.role === "Queen"
        ? "Concierge"
        : employee.department ?? employee.role ?? "POC";
  return DEPARTMENT_STYLES[key] ?? "bg-stone-50 text-stone-600 ring-stone-300/20";
}

// ── Semantic bullet colors for SOP list (Light Quiet Luxury) ─────────────────

const BULLET_STYLES: Record<string, string> = {
  Founder: "bg-amber-400 ring-amber-50",
  POC: "bg-stone-300 ring-stone-100",
  Tech: "bg-sky-400 ring-sky-50",
  Finance: "bg-emerald-400 ring-emerald-50",
  "Performance Marketing": "bg-blue-400 ring-blue-50",
  Onboarding: "bg-violet-400 ring-violet-50",
  Shop: "bg-amber-400 ring-amber-50",
  Concierge: "bg-rose-400 ring-rose-50",
  Marketing: "bg-indigo-400 ring-indigo-50",
  Legacy: "bg-stone-300 ring-stone-100",
  House: "bg-teal-400 ring-teal-50",
};

function getBulletStyle(employee: Employee): string {
  const key =
    employee.role === "Founder"
      ? "Founder"
      : employee.role === "Queen"
        ? "Concierge"
        : employee.department ?? employee.role ?? "POC";
  return BULLET_STYLES[key] ?? "bg-stone-300 ring-stone-100";
}

// ── Mock SOP data by department / role ─────────────────────────────────────

function getMockSops(employee: Employee): string[] {
  const dept = employee.department ?? "";
  const name = employee.name;

  // Onboarding (e.g., Samson)
  if (dept === "Onboarding" || name === "Samson") {
    return [
      "Execute Typeform profiling within 1 hour of lead capture.",
      "Assign new clients to a Kingdom and initialize the WhatsApp ecosystem.",
      "Ensure zero SLA breaches on 9 AM live leads.",
    ];
  }

  // Tech/CRM (e.g., Arfam)
  if (dept === "Tech" || name === "Arfam") {
    return [
      "Maintain 99.9% uptime for the Indulge Eco CRM.",
      "Audit Supabase RLS policies weekly for security.",
      "Optimize Next.js bundle sizes and deployment pipelines.",
    ];
  }

  // Shop (e.g., Vikram)
  if (dept === "Shop" || name === "Vikram") {
    return [
      "Source requested high-ticket items within a 24-hour SLA.",
      "Manage vendor relationships and negotiate preferred pricing.",
      "Update the Shop App catalog with exclusive daily drops.",
    ];
  }

  // Performance Marketing
  if (dept === "Performance Marketing") {
    return [
      "Track and optimize paid campaign performance across Meta and Google.",
      "Report on CPA, ROAS, and conversion funnel metrics weekly.",
      "Collaborate with Marketing on creative and targeting strategy.",
    ];
  }

  // Finance
  if (dept === "Finance") {
    return [
      "Reconcile won leads with Finance within 48 hours of closure.",
      "Maintain audit trails for all deal value adjustments.",
      "Report monthly revenue forecasts to leadership.",
    ];
  }

  // Marketing
  if (dept === "Marketing") {
    return [
      "Review campaign performance metrics daily.",
      "Align ad spend with target CPA and ROI benchmarks.",
      "Coordinate creative refreshes with brand guidelines.",
    ];
  }

  // Concierge
  if (dept === "Concierge") {
    return [
      "Ensure seamless handoff from Onboarding to client delivery.",
      "Coordinate Jokers and Kingdom touchpoints per client journey.",
      "Maintain white-glove service standards across all interactions.",
    ];
  }

  // Founders / POC
  if (employee.role === "Founder" || employee.role === "POC") {
    return [
      "Set strategic direction and quarterly OKRs for Indulge Eco.",
      "Review pipeline health and team performance weekly.",
      "Approve high-value deals and escalation decisions.",
    ];
  }

  // Default
  return [
    "Execute assigned tasks within agreed SLAs.",
    "Maintain accurate CRM updates and lead notes.",
    "Escalate blockers to department lead promptly.",
  ];
}

// ── Role-based mock metrics ───────────────────────────────────────────────

type MetricConfig = {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
};

function getMockMetrics(employee: Employee): MetricConfig[] {
  const dept = employee.department ?? "";
  const isFounder = employee.role === "Founder";
  const isPOC = employee.role === "POC";

  // Marketing: Campaigns Managed instead of Revenue
  if (dept === "Marketing" || employee.name === "Smruti") {
    return [
      { label: "Active Tasks", value: "4", icon: <CheckSquare className="w-4 h-4" />, iconBg: "bg-violet-100 text-violet-600" },
      { label: "Pipeline / Leads", value: "12", icon: <Users className="w-4 h-4" />, iconBg: "bg-blue-100 text-blue-600" },
      { label: "Campaigns Managed", value: "6", icon: <BarChart3 className="w-4 h-4" />, iconBg: "bg-indigo-100 text-indigo-600" },
      { label: "Revenue Influenced", value: "₹8.2L", icon: <IndianRupee className="w-4 h-4" />, iconBg: "bg-amber-100 text-amber-600" },
    ];
  }

  // Shop / Finance: Revenue Generated
  if (dept === "Shop" || dept === "Finance") {
    return [
      { label: "Active Tasks", value: "3", icon: <CheckSquare className="w-4 h-4" />, iconBg: "bg-violet-100 text-violet-600" },
      { label: "Pipeline / Leads", value: "8", icon: <Users className="w-4 h-4" />, iconBg: "bg-blue-100 text-blue-600" },
      { label: "Revenue Generated", value: "₹12.4L", icon: <IndianRupee className="w-4 h-4" />, iconBg: "bg-emerald-100 text-emerald-600" },
      { label: "Deals Closed", value: "5", icon: <BarChart3 className="w-4 h-4" />, iconBg: "bg-amber-100 text-amber-600" },
    ];
  }

  // Founders / POC: high-level overview
  if (isFounder || isPOC) {
    return [
      { label: "Active Tasks", value: "7", icon: <CheckSquare className="w-4 h-4" />, iconBg: "bg-violet-100 text-violet-600" },
      { label: "Pipeline / Leads", value: "24", icon: <Users className="w-4 h-4" />, iconBg: "bg-blue-100 text-blue-600" },
      { label: "Revenue Generated", value: "₹42.1L", icon: <IndianRupee className="w-4 h-4" />, iconBg: "bg-emerald-100 text-emerald-600" },
      { label: "Team Size", value: "32", icon: <BarChart3 className="w-4 h-4" />, iconBg: "bg-stone-100 text-stone-600" },
    ];
  }

  // Default: generic agent metrics
  return [
    { label: "Active Tasks", value: "5", icon: <CheckSquare className="w-4 h-4" />, iconBg: "bg-violet-100 text-violet-600" },
    { label: "Pipeline / Leads", value: "9", icon: <Users className="w-4 h-4" />, iconBg: "bg-blue-100 text-blue-600" },
    { label: "Revenue Generated", value: "₹6.8L", icon: <IndianRupee className="w-4 h-4" />, iconBg: "bg-amber-100 text-amber-600" },
    { label: "Completion Rate", value: "94%", icon: <BarChart3 className="w-4 h-4" />, iconBg: "bg-emerald-100 text-emerald-600" },
  ];
}

// ── Modal Component ───────────────────────────────────────────────────────

interface AgentProfileSummaryModalProps {
  employee: Employee | null;
  onClose: () => void;
}

export function AgentProfileSummaryModal({ employee, onClose }: AgentProfileSummaryModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (employee) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [employee, handleEscape]);

  const metrics = employee ? getMockMetrics(employee) : [];
  const deptStyle = employee ? getDepartmentStyle(employee) : "";
  const sops = employee ? getMockSops(employee) : [];
  const bulletStyle = employee ? getBulletStyle(employee) : "";
  const isQueen = employee?.role === "Queen";

  return (
    <AnimatePresence>
      {employee && (
        <>
          {/* Backdrop */}
          <motion.div
            key="agent-profile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-stone-900/10 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          {/* Modal Card */}
          <motion.div
            key="agent-profile-modal"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-white/95 backdrop-blur-2xl ring-1 ring-black/[0.03] shadow-2xl rounded-3xl max-h-[85vh] overflow-y-auto scrollbar-hide flex flex-col">
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 z-10 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100/80 transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Section 1: Header */}
              <div className="flex flex-col items-center text-center p-6 pb-0 shrink-0">
                <Avatar className="w-20 h-20 rounded-full ring-2 ring-stone-200/80 mb-3">
                  <AvatarFallback className="bg-stone-100 text-stone-700 text-xl font-medium">
                    {employee.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-xl text-stone-900 font-medium">{employee.name}</h3>
                <span
                  className={`mt-1.5 inline-flex px-3 py-1 rounded-full text-xs font-medium ring-1 ${deptStyle}`}
                >
                  {employee.role}
                </span>
              </div>

              {/* Section 2: Live Metrics (2x2 grid) */}
              <div className="grid grid-cols-2 gap-3 px-6 pt-6">
                {metrics.map((m, i) => (
                  <div
                    key={i}
                    className="bg-stone-50/50 ring-1 ring-stone-100 rounded-2xl p-4"
                  >
                    <div className={`inline-flex p-2 rounded-xl ${m.iconBg} mb-2`}>
                      {m.icon}
                    </div>
                    <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                      {m.label}
                    </p>
                    <p className="text-lg font-semibold text-stone-800 mt-0.5">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Section 2b: Kingdom Structure (Queens only) */}
              {isQueen && (
                <div className="px-6 pt-6">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-4">
                    Per Kingdom
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-rose-50/50 ring-1 ring-rose-100 rounded-2xl p-4">
                      <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        <TermTooltip term="genie">Genies</TermTooltip>
                      </p>
                      <p className="text-lg font-semibold text-stone-800 mt-0.5">8</p>
                    </div>
                    <div className="bg-rose-50/50 ring-1 ring-rose-100 rounded-2xl p-4">
                      <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        <TermTooltip term="bishop">Bishops</TermTooltip>
                      </p>
                      <p className="text-lg font-semibold text-stone-800 mt-0.5">2</p>
                    </div>
                    <div className="bg-rose-50/50 ring-1 ring-rose-100 rounded-2xl p-4">
                      <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        <TermTooltip term="joker">Joker</TermTooltip>
                      </p>
                      <p className="text-lg font-semibold text-stone-800 mt-0.5">1</p>
                    </div>
                    <div className="bg-rose-50/50 ring-1 ring-rose-100 rounded-2xl p-4">
                      <p className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        <TermTooltip term="account">Account</TermTooltip>
                      </p>
                      <p className="text-lg font-semibold text-stone-800 mt-0.5">1</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3: Core Responsibilities (SOP) */}
              <div className="px-6 pt-6 pb-6">
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-4">
                  Core Responsibilities (SOP)
                </h4>
                <div className="flex flex-col gap-3.5">
                  {sops.map((sop, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div
                        className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ring-4 ${bulletStyle}`}
                      />
                      <p className="text-sm leading-relaxed text-stone-600">{sop}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
