"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ScoutSLAAlerts } from "@/components/sla/ScoutSLAAlerts";
import { useChatDrawer } from "@/components/chat/ChatProvider";
import { useProfile } from "@/components/sla/ProfileProvider";

interface MetricCard {
  label: string;
  value: number;
}

interface DashboardHeroProps {
  firstName: string;
  timeOfDay: "Morning" | "Afternoon" | "Evening";
  metrics: {
    newLeads: number;
    active: number;
    tasksToday: number;
    won: number;
  };
}

function ChatButton() {
  const { openChat, unreadCount } = useChatDrawer();
  return (
    <motion.button
      onClick={openChat}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className="relative w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors duration-300"
      aria-label="Open messages"
    >
      <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
      {unreadCount > 0 && (
        <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-brand-gold rounded-full ring-2 ring-[#0A0A0A]" />
      )}
    </motion.button>
  );
}

// ── Ambient orb animation config (staggered durations for organic feel) ─
const ORB_ANIMATIONS = [
  {
    duration: 20,
    x: [0, 30, -20, 0],
    y: [0, -40, 20, 0],
    scale: [1, 1.1, 0.9, 1],
  },
  {
    duration: 25,
    x: [0, -25, 15, 0],
    y: [0, 30, -25, 0],
    scale: [1, 0.95, 1.08, 1],
  },
  {
    duration: 30,
    x: [0, 20, -30, 0],
    y: [0, -20, 35, 0],
    scale: [1, 1.05, 0.92, 1],
  },
];

export function DashboardHero({
  firstName,
  timeOfDay,
  metrics,
}: DashboardHeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const profile = useProfile();
  const showSLA =
    profile && (profile.role === "admin" || profile.role === "founder" || profile.role === "manager");

  const cards: MetricCard[] = [
    { label: "New Leads", value: metrics.newLeads },
    { label: "Active", value: metrics.active },
    { label: "Tasks Today", value: metrics.tasksToday },
    { label: "Won", value: metrics.won },
  ];

  return (
    <div className="relative overflow-hidden bg-[#0A0A0A]">
      {/* ── Phase 2: Ambient mood-lifting orbs (behind grain) ─ */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-[100px] bg-[#D4AF37]/10 will-change-transform"
          animate={
            prefersReducedMotion
              ? {}
              : {
                  x: ORB_ANIMATIONS[0].x,
                  y: ORB_ANIMATIONS[0].y,
                  scale: ORB_ANIMATIONS[0].scale,
                }
          }
          transition={
            prefersReducedMotion
              ? {}
              : {
                  duration: ORB_ANIMATIONS[0].duration,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />
        <motion.div
          className="absolute -bottom-32 -right-32 w-[30rem] h-[30rem] rounded-full blur-[100px] bg-emerald-900/10 will-change-transform"
          animate={
            prefersReducedMotion
              ? {}
              : {
                  x: ORB_ANIMATIONS[1].x,
                  y: ORB_ANIMATIONS[1].y,
                  scale: ORB_ANIMATIONS[1].scale,
                }
          }
          transition={
            prefersReducedMotion
              ? {}
              : {
                  duration: ORB_ANIMATIONS[1].duration,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 right-8 w-72 h-72 rounded-full blur-[100px] bg-indigo-900/10 will-change-transform"
          animate={
            prefersReducedMotion
              ? {}
              : {
                  x: ORB_ANIMATIONS[2].x,
                  y: ORB_ANIMATIONS[2].y,
                  scale: ORB_ANIMATIONS[2].scale,
                }
          }
          transition={
            prefersReducedMotion
              ? {}
              : {
                  duration: ORB_ANIMATIONS[2].duration,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
        />
      </div>

      {/* ── Phase 1: Tactile noise overlay (digital grain, matte paper feel) ─ */}
      <div
        className="absolute inset-0 z-0 opacity-[0.15] mix-blend-overlay pointer-events-none"
        aria-hidden
      >
        <svg
          className="w-full h-full opacity-100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <filter id="grain">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.8"
              numOctaves="4"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </div>

      {/* ── Soft bottom fade → blends into the paper below ──── */}
      <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-[#0A0A0A]/80 to-transparent pointer-events-none z-0" />

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="relative z-10 px-8 pt-8 pb-8 space-y-8">
        {/* Utility bar: chat + notifications + SLA (scout/admin) */}
        <div className="flex justify-end items-center gap-1 -mt-1 -mr-1">
          <ChatButton />
          <NotificationBell />
          {showSLA && <ScoutSLAAlerts userId={profile!.id} inline darkBg />}
        </div>

        {/* Editorial greeting */}
        <motion.div
          className="flex items-end gap-0 -mt-2"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Left column: GOOD / MORNING stacked */}
          <div className="flex flex-col items-center justify-end mr-4">
            <span className="text-xs font-sans uppercase tracking-[0.3em] text-white/60 leading-none mb-1">
              Good
            </span>
            <span className="text-xl font-mono text-white/60 leading-none mb-3">
              {timeOfDay}
            </span>
          </div>

          {/* Name — the centrepiece */}
          <h1 className="text-5xl md:text-7xl font-serif tracking-tight text-white/90 font-leading-none">
            {firstName.toUpperCase()}
          </h1>

          {/* Pulsing accent dot */}
          <motion.div
            className="w-3 h-3 rounded-full bg-rose-200/60 mb-2 ml-2 shrink-0"
            animate={
              prefersReducedMotion
                ? { opacity: 0.6 }
                : { opacity: [0.3, 1, 0.3] }
            }
            transition={
              prefersReducedMotion
                ? {}
                : { duration: 3, repeat: Infinity, ease: "easeInOut" }
            }
          />
        </motion.div>

        {/* Metric bento cards — Phase 3: glassmorphism */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {cards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                delay: 0.1 + i * 0.06,
                duration: 0.45,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-xl px-4 py-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:bg-white/[0.04] hover:border-white/10 transition-colors duration-300"
            >
              <p className="text-4xl font-serif text-white/90 leading-none tabular-nums">
                {card.value}
              </p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/35 mt-2">
                {card.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
