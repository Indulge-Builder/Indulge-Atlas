"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useChatDrawer } from "@/components/chat/ChatProvider";

// ── Zen backgrounds — one per day of the week (0 = Sunday) ─
// Curated minimalist scenes: sparse, dark, meditative.
const ZEN_IMAGES: string[] = [
  // Sun — sparse winter birch forest, monochrome
  "https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=1920&q=80&auto=format&fit=crop",
  // Mon — serene misty lake reflection
  "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=1920&q=80&auto=format&fit=crop",
  // Tue — dark rolling sand dunes, minimal horizon
  "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&q=80&auto=format&fit=crop",
  // Wed — mountain ridge dissolving into mist
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80&auto=format&fit=crop",
  // Thu — pine forest in early morning fog
  "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80&auto=format&fit=crop",
  // Fri — dark volcanic rock, abstract texture
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80&auto=format&fit=crop",
  // Sat — tranquil open ocean horizon at dusk
  "https://images.unsplash.com/photo-1505459668311-8dfac7952bf0?w=1920&q=80&auto=format&fit=crop",
];

interface MetricCard {
  label: string;
  value: number;
}

interface DashboardHeroProps {
  firstName: string;
  timeOfDay: "Morning" | "Afternoon" | "Evening";
  dayOfWeek: number; // 0–6
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

export function DashboardHero({
  firstName,
  timeOfDay,
  dayOfWeek,
  metrics,
}: DashboardHeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const zenImage = ZEN_IMAGES[dayOfWeek] ?? ZEN_IMAGES[0];

  const cards: MetricCard[] = [
    { label: "New Leads", value: metrics.newLeads },
    { label: "Active", value: metrics.active },
    { label: "Tasks Today", value: metrics.tasksToday },
    { label: "Won", value: metrics.won },
  ];

  return (
    <div className="relative overflow-hidden bg-[#080807]">
      {/* ── Zen texture layer ─── image at whisper opacity ───── */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-[0.18]"
        style={{ backgroundImage: `url(${zenImage})` }}
      />

      {/* ── Dark overlay — kills the photo, leaves texture ──── */}
      <div className="absolute inset-0 bg-cyan-300/10 backdrop-blur-[2px]" />

      {/* ── Soft bottom fade → blends into the paper below ──── */}
      <div className="absolute bottom-0 inset-x-0 h-16 bg-linear-to-t from-surface/[0.07] to-transparent pointer-events-none" />

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="relative z-10 px-8 pt-8 pb-8 space-y-8">
        {/* Utility bar: chat + notifications */}
        <div className="flex justify-end items-center gap-1 -mt-1 -mr-1">
          <ChatButton />
          <NotificationBell />
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
            animate={prefersReducedMotion ? { opacity: 0.6 } : { opacity: [0.3, 1, 0.3] }}
            transition={prefersReducedMotion ? {} : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>

        {/* Metric bento cards */}
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
              className="bg-white/5 backdrop-blur-sm border border-white/8 rounded-xl px-4 py-4 hover:bg-white/8 hover:border-white/13 transition-colors duration-300"
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
