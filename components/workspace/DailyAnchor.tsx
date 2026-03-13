"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface DailyAnchorProps {
  greeting:  string;
  firstName: string;
}

export function DailyAnchor({ greeting, firstName }: DailyAnchorProps) {
  const [value,    setValue]    = useState("");
  const [locked,   setLocked]   = useState(false);
  const [isDone,   setIsDone]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore today's saved intention from localStorage
  const storageKey = `workspace-intention-${new Date().toISOString().slice(0, 10)}`;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      setValue(saved);
      setLocked(true);
    }
  }, [storageKey]);

  const handleLock = useCallback(() => {
    if (!value.trim()) return;
    localStorage.setItem(storageKey, value.trim());
    setLocked(true);
  }, [value, storageKey]);

  function handleUnlock() {
    setLocked(false);
    setIsDone(false);
    setTimeout(() => inputRef.current?.focus(), 80);
  }

  return (
    <div className="px-7 py-7">
      {/* ── Greeting ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Date whisper */}
        <p className="text-[10px] font-semibold text-[#B0ADA8] uppercase tracking-[0.28em] mb-3">
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day:     "numeric",
            month:   "long",
          })}
        </p>

        {/* Main greeting */}
        <h2
          className="text-[#1A1A1A] leading-tight"
          style={{
            fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
            fontSize:   "clamp(1.5rem, 2.2vw, 2rem)",
            fontWeight: 400,
          }}
        >
          {greeting},{" "}
          <span className="text-[#1A1A1A]">{firstName}</span>
          <span className="text-[#D4AF37]">.</span>
        </h2>
      </motion.div>

      {/* ── Divider ──────────────────────────────────── */}
      <div className="my-5 h-px bg-black/[0.05]" />

      {/* ── Intention area ───────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* Input state */}
        {!locked && (
          <motion.div
            key="input"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
          >
            <p className="text-[10px] font-semibold text-[#C0BDB5] uppercase tracking-[0.22em] mb-3">
              Primary Focus
            </p>

            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLock();
              }}
              placeholder="What is your primary focus today?"
              className="
                w-full bg-transparent border-none outline-none
                text-[#1A1A1A] text-[15px] leading-relaxed
                placeholder:text-[#C8C4BE] placeholder:italic
                caret-[#D4AF37]
              "
              style={{
                fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
              }}
              autoComplete="off"
              spellCheck={false}
            />

            {value.trim() && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="mt-4"
              >
                <button
                  onClick={handleLock}
                  className="text-[10px] font-semibold text-[#B0ADA8] uppercase tracking-[0.2em]
                             hover:text-[#D4AF37] transition-colors duration-200"
                >
                  Set intention  ↵
                </button>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Locked / intention set state */}
        {locked && (
          <motion.div
            key="locked"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[10px] font-semibold text-[#C0BDB5] uppercase tracking-[0.22em] mb-4">
              Today&rsquo;s Intention
            </p>

            <div className="flex items-start gap-4">
              {/* Custom olive checkbox */}
              <button
                onClick={() => setIsDone(!isDone)}
                className="flex-shrink-0 mt-0.5 w-5 h-5 focus:outline-none"
                aria-label={isDone ? "Mark incomplete" : "Mark complete"}
              >
                <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle
                    cx="10" cy="10" r="9"
                    stroke={isDone ? "#4A7C59" : "#C0BDB5"}
                    strokeWidth="1.5"
                    className="transition-colors duration-300"
                  />
                  <AnimatePresence>
                    {isDone && (
                      <motion.path
                        key="check"
                        d="M6 10.5 L9 13.5 L14 7.5"
                        stroke="#4A7C59"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        exit={{ pathLength: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                      />
                    )}
                  </AnimatePresence>
                </svg>
              </button>

              {/* The intention text */}
              <div className="relative flex-1">
                <motion.p
                  animate={{ opacity: isDone ? 0.3 : 1 }}
                  transition={{ duration: 0.4 }}
                  className="text-[#1A1A1A] text-[16px] leading-relaxed"
                  style={{
                    fontFamily: "var(--font-playfair), 'Playfair Display', Georgia, serif",
                  }}
                >
                  {value}
                  <span className="text-[#D4AF37]">.</span>
                </motion.p>
                {/* GPU-compositable strikethrough — scale-x from 0→1 on isDone */}
                <motion.span
                  className="absolute left-0 top-1/2 h-px bg-[#4A7C59] pointer-events-none"
                  style={{ width: "100%", transformOrigin: "left center" }}
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: isDone ? 1 : 0, opacity: isDone ? 0.6 : 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>

            {/* Edit affordance */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              onClick={handleUnlock}
              className="mt-5 text-[10px] text-[#C0BDB5] uppercase tracking-[0.2em]
                         hover:text-[#9E9E9E] transition-colors duration-200"
            >
              Edit intention
            </motion.button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
