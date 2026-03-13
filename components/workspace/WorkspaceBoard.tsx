"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DailyAnchor } from "./DailyAnchor";
import { TodaysPath } from "./TodaysPath";
import { Scratchpad } from "./Scratchpad";
import { WhisperBox } from "./WhisperBox";
import type { TaskWithLead } from "@/lib/types/database";

// ── Minimalist Bodhi tree SVG ─────────────────────────────
// Rendered as a large abstract silhouette positioned bottom-right.
// The opacity is kept extremely low (0.07) so it reads as a warm
// watermark on the #F9F9F6 paper. Framer Motion adds a 12-second
// "breeze" loop: a barely perceptible scale + opacity swell.

function TreeBackground() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      className="pointer-events-none absolute bottom-0 right-[-60px] select-none"
      style={{ transformOrigin: "bottom right" }}
      animate={
        prefersReducedMotion
          ? { scale: 1, opacity: 0.07 }
          : { scale: [1, 1.018, 1], opacity: [0.07, 0.1, 0.07] }
      }
      transition={
        prefersReducedMotion
          ? {}
          : { duration: 12, repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }
      }
      aria-hidden
    >
      <svg
        viewBox="0 0 420 580"
        width="420"
        height="580"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── Trunk ────────────────────────────────────── */}
        <path
          d="M200 580 C202 530 196 475 198 420 C200 375 197 340 196 298"
          stroke="#6B4F2A"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* ── Primary branches ─────────────────────────── */}
        <path
          d="M198 370 C168 352 132 336 88 310"
          stroke="#6B4F2A"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M197 355 C232 333 272 315 316 290"
          stroke="#6B4F2A"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* ── Secondary branches ──────────────────────── */}
        <path
          d="M199 410 C178 400 155 394 128 386"
          stroke="#6B4F2A"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M198 395 C222 382 248 372 272 360"
          stroke="#6B4F2A"
          strokeWidth="1.8"
          strokeLinecap="round"
        />

        {/* ── Upper branches ──────────────────────────── */}
        <path
          d="M197 340 C178 326 158 314 138 300"
          stroke="#6B4F2A"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M197 335 C218 318 240 305 262 290"
          stroke="#6B4F2A"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* ── Crown ───────────────────────────────────── */}
        <path
          d="M196 310 C180 288 168 262 162 225"
          stroke="#6B4F2A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M197 308 C212 285 222 260 226 220"
          stroke="#6B4F2A"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M196 298 C194 268 190 235 188 195"
          stroke="#6B4F2A"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* ── Fine terminal twigs ─────────────────────── */}
        <path
          d="M88 310 C72 302 58 292 44 278"
          stroke="#6B4F2A"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M88 310 C78 298 72 284 66 268"
          stroke="#6B4F2A"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M316 290 C332 280 346 268 355 254"
          stroke="#6B4F2A"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M128 386 C115 380 104 374 96 368"
          stroke="#6B4F2A"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        <path
          d="M272 360 C284 352 292 345 298 338"
          stroke="#6B4F2A"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
        <path
          d="M162 225 C154 205 148 185 146 162"
          stroke="#6B4F2A"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M226 220 C232 200 235 178 232 158"
          stroke="#6B4F2A"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M188 195 C186 170 184 148 183 122"
          stroke="#6B4F2A"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* ── Leaf clusters ─────────────────────────── */}
        {/* Far left */}
        <g fill="#4A5A2A">
          <circle cx="46" cy="274" r="5.5" />
          <circle cx="38" cy="266" r="4.5" />
          <circle cx="55" cy="266" r="4" />
          <circle cx="42" cy="257" r="4" />
          <circle cx="58" cy="258" r="5" />
          <circle cx="32" cy="278" r="3.5" />
          <circle cx="64" cy="270" r="4" />
          <circle cx="50" cy="250" r="3" />
          <circle cx="30" cy="268" r="3" />
        </g>

        {/* Far right */}
        <g fill="#4A5A2A">
          <circle cx="356" cy="250" r="5.5" />
          <circle cx="366" cy="258" r="4.5" />
          <circle cx="362" cy="242" r="4" />
          <circle cx="348" cy="246" r="5" />
          <circle cx="370" cy="248" r="3.5" />
          <circle cx="352" cy="238" r="3.5" />
          <circle cx="374" cy="260" r="3" />
          <circle cx="344" cy="258" r="4" />
        </g>

        {/* Top crown */}
        <g fill="#4A5A2A">
          <circle cx="183" cy="115" r="6.5" />
          <circle cx="193" cy="108" r="5.5" />
          <circle cx="174" cy="108" r="5" />
          <circle cx="186" cy="97" r="5" />
          <circle cx="200" cy="102" r="5.5" />
          <circle cx="168" cy="118" r="4" />
          <circle cx="204" cy="120" r="4.5" />
          <circle cx="177" cy="92" r="3.5" />
          <circle cx="196" cy="88" r="4.5" />
          <circle cx="188" cy="80" r="4" />
          <circle cx="210" cy="112" r="3.5" />
          <circle cx="162" cy="110" r="3.5" />
        </g>

        {/* Left crown */}
        <g fill="#4A5A2A">
          <circle cx="146" cy="158" r="5" />
          <circle cx="136" cy="152" r="4.5" />
          <circle cx="155" cy="152" r="4" />
          <circle cx="140" cy="143" r="4" />
          <circle cx="155" cy="144" r="4.5" />
          <circle cx="130" cy="162" r="3.5" />
          <circle cx="162" cy="162" r="3.5" />
        </g>

        {/* Right crown */}
        <g fill="#4A5A2A">
          <circle cx="232" cy="152" r="5" />
          <circle cx="242" cy="158" r="4.5" />
          <circle cx="224" cy="148" r="4" />
          <circle cx="238" cy="144" r="4.5" />
          <circle cx="218" cy="156" r="3.5" />
          <circle cx="248" cy="150" r="3.5" />
          <circle cx="228" cy="138" r="4" />
        </g>

        {/* Left mid */}
        <g fill="#4A5A2A">
          <circle cx="107" cy="372" r="4" />
          <circle cx="116" cy="366" r="3.5" />
          <circle cx="100" cy="366" r="3" />
          <circle cx="110" cy="358" r="3.5" />
          <circle cx="120" cy="374" r="3" />
        </g>

        {/* Right mid */}
        <g fill="#4A5A2A">
          <circle cx="292" cy="342" r="4" />
          <circle cx="302" cy="348" r="3.5" />
          <circle cx="286" cy="350" r="3" />
          <circle cx="298" cy="336" r="3.5" />
          <circle cx="280" cy="344" r="3" />
        </g>

        {/* Upper left */}
        <g fill="#4A5A2A">
          <circle cx="120" cy="298" r="4" />
          <circle cx="130" cy="292" r="3.5" />
          <circle cx="112" cy="292" r="3" />
          <circle cx="125" cy="284" r="3.5" />
        </g>

        {/* Upper right */}
        <g fill="#4A5A2A">
          <circle cx="264" cy="288" r="4" />
          <circle cx="274" cy="282" r="3.5" />
          <circle cx="256" cy="284" r="3" />
          <circle cx="268" cy="276" r="3.5" />
        </g>

        {/* Fine scattered leaves */}
        <g fill="#5C4A2A">
          <circle cx="70" cy="266" r="2.5" />
          <circle cx="76" cy="275" r="2" />
          <circle cx="344" cy="270" r="2.5" />
          <circle cx="376" cy="254" r="2" />
          <circle cx="140" cy="302" r="2" />
          <circle cx="148" cy="296" r="2.5" />
          <circle cx="248" cy="296" r="2" />
          <circle cx="256" cy="290" r="2.5" />
          <circle cx="128" cy="390" r="2" />
          <circle cx="136" cy="382" r="2" />
          <circle cx="278" cy="362" r="2" />
          <circle cx="268" cy="366" r="2" />
          <circle cx="166" cy="228" r="2" />
          <circle cx="228" cy="224" r="2" />
          <circle cx="195" cy="185" r="2" />
          <circle cx="182" cy="130" r="2" />
          <circle cx="196" cy="125" r="2" />
        </g>
      </svg>
    </motion.div>
  );
}

// ── Frosted-glass card wrapper ────────────────────────────
// All bento boxes share this container so the design language
// is perfectly consistent across every panel.

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function GlassCard({ children, className = "", style }: CardProps) {
  return (
    <div
      className={`
        relative bg-white/50 backdrop-blur-sm
        border border-white/35
        rounded-2xl
        shadow-[0_2px_16px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.85)]
        ${className}
      `}
      style={style}
    >
      {children}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────

interface WorkspaceBoardProps {
  greeting:      string;
  firstName:     string;
  todaysTasks:   TaskWithLead[];
  currentUserId: string;
}

// ── Component ─────────────────────────────────────────────

export function WorkspaceBoard({
  greeting,
  firstName,
  todaysTasks,
  currentUserId,
}: WorkspaceBoardProps) {
  return (
    /*
     * position: relative so the absolute-positioned tree stays
     * within this container and is clipped by the parent <main>'s
     * overflow-hidden + rounded-2xl — creating the elegant
     * "emerging from the corner" paper watermark effect.
     */
    <div className="relative overflow-hidden px-7 py-7 min-h-[calc(100vh-72px)]">
      {/* ── Background tree ──────────────────────────── */}
      <TreeBackground />

      {/* ── Bento grid ───────────────────────────────── */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ── Left column (7/12) ─── stacked panels ─── */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Panel 1: Daily Anchor — greeting + intention */}
          <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
          >
            <GlassCard>
              <DailyAnchor greeting={greeting} firstName={firstName} />
            </GlassCard>
          </motion.div>

          {/* Panel 2: Today's Path — today's tasks */}
          <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.65,
              delay: 0.08,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <GlassCard>
              <TodaysPath tasks={todaysTasks} />
            </GlassCard>
          </motion.div>

          {/* Panel 3: Scratchpad — free-form brain dump (self-contained dark widget) */}
          <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.65,
              delay: 0.16,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="flex-1"
          >
            <Scratchpad />
          </motion.div>
        </div>

        {/* ── Right column (5/12) ─── Whisper Box ─────── */}
        <motion.div
          layout
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="lg:col-span-5 lg:sticky lg:top-0"
        >
          <GlassCard
            className="flex flex-col overflow-hidden"
            style={{ height: "calc(100vh - 250px)" }}
          >
            <WhisperBox currentUserId={currentUserId} />
          </GlassCard>
        </motion.div>
      </div>

      {/* Bottom spacer */}
      <div className="h-10" />
    </div>
  );
}
