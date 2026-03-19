"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { User, ExternalLink } from "lucide-react";
import type { MessageLeadPreview } from "@/lib/types/database";
import { LEAD_STATUS_CONFIG } from "@/lib/types/database";

export const ROLE_GRADIENT: Record<string, string> = {
  scout:   "linear-gradient(135deg, #D4AF37, #B8942E)",
  admin:   "linear-gradient(135deg, #8B5CF6, #6D28D9)",
  agent:   "linear-gradient(135deg, #059669, #047857)",
  finance: "linear-gradient(135deg, #0EA5E9, #0284C7)",
};

export function avatarGradient(role: string) {
  return ROLE_GRADIENT[role] ?? "linear-gradient(135deg, #9E9E9E, #6B6B6B)";
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function PulseDot() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <span className="relative flex h-2 w-2">
      <motion.span
        className="absolute inline-flex h-full w-full rounded-full bg-[#D4AF37] opacity-50"
        animate={prefersReducedMotion ? { opacity: 0.5 } : { scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
        transition={prefersReducedMotion ? {} : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#D4AF37]" />
    </span>
  );
}

export function Avatar({
  name,
  role,
  size = "sm",
}: {
  name: string;
  role: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "lg" ? "w-10 h-10 text-[13px]"
    : size === "md" ? "w-8 h-8 text-[11px]"
    : "w-7 h-7 text-[10px]";
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}
      style={{ background: avatarGradient(role) }}
    >
      {getInitials(name)}
    </div>
  );
}

export function LeadCard({
  lead,
  isMine,
}: {
  lead: MessageLeadPreview;
  isMine: boolean;
}) {
  const statusCfg = LEAD_STATUS_CONFIG[lead.status] ?? { color: "#9E9E9E", bgColor: "#F5F5F5" };

  return (
    <Link
      href={`/leads/${lead.id}`}
      className={`
        flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-1.5
        border transition-opacity hover:opacity-80
        ${isMine
          ? "bg-white/[0.12] border-white/20"
          : "bg-[#7B5B3A]/[0.06] border-[#7B5B3A]/20"
        }
      `}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${statusCfg.color}18` }}
      >
        <User className="w-3.5 h-3.5" style={{ color: statusCfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-semibold truncate leading-tight ${isMine ? "text-white" : "text-[#2A1F14]"}`}>
          {lead.full_name}
        </p>
        <p className={`text-[10px] mt-0.5 capitalize truncate ${isMine ? "text-white/60" : "text-[#9E9E9E]"}`}>
          <span
            className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
            style={{ backgroundColor: statusCfg.color }}
          />
          {lead.status.replace(/_/g, " ")}
          {lead.city ? ` · ${lead.city}` : ""}
        </p>
      </div>
      <ExternalLink className={`w-3 h-3 shrink-0 ${isMine ? "text-white/30" : "text-[#C0BDB5]"}`} />
    </Link>
  );
}
