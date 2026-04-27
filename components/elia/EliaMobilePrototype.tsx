"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:          "#F9F9F6",
  bgWhite:     "#FFFFFF",
  gold:        "#D4AF37",
  goldLight:   "#FEF3C7",
  dark:        "#1A1814",
  darkMid:     "#3C3530",
  border:      "#E5E4DF",
  text:        "#1A1A1A",
  textSub:     "#6B6B6B",
  textMuted:   "#B5A99A",
  amberBg:     "#FFFBEB",
  amberBorder: "#FDE68A",
  amberText:   "#92400E",
  green:       "#166534",
  greenBg:     "#F0FDF4",
  greenBorder: "#BBF7D0",
  red:         "#991B1B",
  redBg:       "#FEF2F2",
  redBorder:   "#FED7D7",
} as const;

type Tab         = "profile" | "audit" | "workflow";
type ScanPhase   = "idle" | "scanning" | "complete";
type ApproveState = "idle" | "pending" | "done";

// ─── Mock data ────────────────────────────────────────────────────────────────
const TASTE_SCORES = [
  { label: "Yachting",     score: 95 },
  { label: "Wellness",     score: 92 },
  { label: "Fine Dining",  score: 88 },
  { label: "Adventure",    score: 41 },
];

const INTERACTIONS = [
  {
    channel: "WhatsApp",
    date:    "12 Apr 2026",
    icon:    "💬",
    color:   "#22C55E",
    text:    "Confirmed Monaco dates: 26–29 Apr. Requested champagne setup + birthday florals on arrival.",
  },
  {
    channel: "Freshdesk",
    date:    "3 Apr 2026",
    icon:    "🎫",
    color:   "#6366F1",
    text:    "VIP request: Private helicopter transfer Nice → Monaco. Budget approved.",
  },
];

const AUDIT_RESULTS = [
  {
    type:  "pass" as const,
    icon:  "✅",
    label: "Capacity confirmed",
    text:  "Serenity I: 12-guest capacity. Request: 8 guests. Full availability 26–29 Apr.",
  },
  {
    type:  "pass" as const,
    icon:  "✅",
    label: "Certification valid",
    text:  "MCA Large Yacht Code compliant. Insurance & safety certs valid through Dec 2026.",
  },
  {
    type:  "fail" as const,
    icon:  "❌",
    label: "Critical allergy conflict",
    text:  "Standard menu contains pine nut pesto in 3 dishes. CRITICAL conflict with client allergy profile.",
  },
];

const WORKFLOW_STEPS = [
  { done: true,  text: "Cross-referenced Vendor B (Azure Seas Charter). Zero pine nut contamination." },
  { done: true,  text: "Generated sub-task #AT-2848 → Concierge: secure wellness chef for 26–29 Apr." },
  { done: true,  text: "Routed $50,000 deposit request to Finance ledger (ref: MON-2026-042)." },
  { done: false, text: "Awaiting approval → dispatch WhatsApp confirmation to Advita Bihani." },
];

const SHEET_TABS: { id: Tab; label: string }[] = [
  { id: "profile",  label: "Profile"  },
  { id: "audit",    label: "Audit"    },
  { id: "workflow", label: "Workflow" },
];

// ─── Root component ───────────────────────────────────────────────────────────
export default function EliaMobilePrototype() {
  const [isOpen,        setIsOpen]        = useState(false);
  const [activeTab,     setActiveTab]     = useState<Tab>("profile");
  const [scanPhase,     setScanPhase]     = useState<ScanPhase>("idle");
  const [approveState,  setApproveState]  = useState<ApproveState>("idle");
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === "audit") {
      setScanPhase("scanning");
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      scanTimerRef.current = setTimeout(() => setScanPhase("complete"), 2800);
    }
  };

  const handleApprove = () => {
    setApproveState("pending");
    setTimeout(() => setApproveState("done"), 2200);
  };

  useEffect(() => () => { if (scanTimerRef.current) clearTimeout(scanTimerRef.current); }, []);

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      minHeight:      "100vh",
      background:     "radial-gradient(ellipse at 30% 20%, #2A2520 0%, #1A1814 55%, #0A0908 100%)",
      padding:        "40px 20px",
    }}>
      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes eliaPulse {
          0%,100%{ box-shadow: 0 0 0 0 rgba(212,175,55,.4), 0 0 0 7px rgba(212,175,55,.12), 0 20px 40px rgba(0,0,0,.55); }
          50%    { box-shadow: 0 0 0 5px rgba(212,175,55,.18), 0 0 0 12px rgba(212,175,55,.04), 0 20px 40px rgba(0,0,0,.55); }
        }
        @keyframes eliaOrb {
          0%,100%{ transform:scale(1);    opacity:.85; }
          50%    { transform:scale(1.09); opacity:1;   }
        }
        @keyframes eliaScanBar {
          0%  { left:-32%; }
          100%{ left:112%; }
        }
        @keyframes eliaFadeUp {
          from{ opacity:0; transform:translateY(10px); }
          to  { opacity:1; transform:translateY(0);    }
        }
        @keyframes eliaSlideIn {
          from{ opacity:0; transform:translateX(-8px); }
          to  { opacity:1; transform:translateX(0);    }
        }
        @keyframes eliaDot {
          0%,80%,100%{ opacity:.15; transform:scale(.75); }
          40%        { opacity:1;   transform:scale(1.1); }
        }
        @keyframes eliaBlink {
          0%,100%{ opacity:.7; }
          50%    { opacity:0;  }
        }
        @keyframes eliaGlow {
          0%,100%{ opacity:.55; }
          50%    { opacity:1;   }
        }
        .elia-pill-pulse{ animation:eliaPulse 2.8s ease-in-out infinite; }
        .elia-orb       { animation:eliaOrb   3.2s ease-in-out infinite; }
        .elia-dot-1{ animation:eliaDot 1.4s ease-in-out 0.0s infinite; }
        .elia-dot-2{ animation:eliaDot 1.4s ease-in-out 0.2s infinite; }
        .elia-dot-3{ animation:eliaDot 1.4s ease-in-out 0.4s infinite; }
        .elia-dot-4{ animation:eliaDot 1.4s ease-in-out 0.6s infinite; }
        .elia-dot-5{ animation:eliaDot 1.4s ease-in-out 0.8s infinite; }
      `}</style>

      {/* ── iPhone 15 Pro frame ── */}
      <div style={{
        position:     "relative",
        width:        393,
        height:       852,
        border:       "12px solid #1A1814",
        borderRadius: "3rem",
        overflow:     "hidden",
        background:   T.bg,
        boxShadow:    "0 70px 130px -20px rgba(0,0,0,.85), 0 0 0 1.5px #2D2820, inset 0 1px 0 rgba(255,255,255,.07)",
        fontFamily:   "-apple-system, BlinkMacSystemFont, 'Inter', 'Geist Sans', sans-serif",
        flexShrink:   0,
      }}>

        {/* Dynamic Island */}
        <div style={{
          position:     "absolute",
          top:          14,
          left:         "50%",
          transform:    "translateX(-50%)",
          width:        126,
          height:       37,
          background:   "#080706",
          borderRadius: 22,
          zIndex:       50,
          boxShadow:    "0 1px 4px rgba(0,0,0,.4)",
        }} />

        {/* Status bar */}
        <PhoneStatusBar />

        {/* Background CRM context */}
        <BackgroundCRMTicket />

        {/* Floating Elia pill */}
        <FloatingPill isOpen={isOpen} onToggle={() => setIsOpen(o => !o)} />

        {/* Bottom sheet */}
        <AnimatePresence>
          {isOpen && (
            <EliaBottomSheet
              onClose={() => setIsOpen(false)}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              scanPhase={scanPhase}
              setScanPhase={setScanPhase}
              scanTimerRef={scanTimerRef}
              approveState={approveState}
              onApprove={handleApprove}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Phone Status Bar ─────────────────────────────────────────────────────────
function PhoneStatusBar() {
  return (
    <div style={{
      position:       "absolute",
      top:            0,
      left:           0,
      right:          0,
      height:         54,
      display:        "flex",
      alignItems:     "flex-end",
      justifyContent: "space-between",
      padding:        "0 28px 8px",
      zIndex:         40,
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: T.dark, letterSpacing: "-.02em" }}>9:41</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Signal bars */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
          <rect x="0"    y="9" width="3" height="3" rx=".6" fill={T.dark} />
          <rect x="4.5"  y="6" width="3" height="6" rx=".6" fill={T.dark} />
          <rect x="9"    y="3" width="3" height="9" rx=".6" fill={T.dark} />
          <rect x="13.5" y="0" width="3" height="12" rx=".6" fill={T.dark} opacity=".25" />
        </svg>
        {/* WiFi */}
        <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
          <path d="M7.5 9a1 1 0 100-2 1 1 0 000 2z" fill={T.dark}/>
          <path d="M7.5 5.5C8.7 5.5 9.8 6 10.6 6.8L11.8 5.6C10.7 4.6 9.2 4 7.5 4S4.3 4.6 3.2 5.6l1.2 1.2C5.2 6 6.3 5.5 7.5 5.5z" fill={T.dark}/>
          <path d="M7.5 2.5c2.1 0 4 .85 5.4 2.2l1.3-1.3C12.5 1.8 10.1.8 7.5.8S2.5 1.8.8 3.4L2.1 4.7C3.5 3.35 5.4 2.5 7.5 2.5z" fill={T.dark}/>
        </svg>
        {/* Battery */}
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <div style={{ width: 22, height: 12, border: `1.5px solid ${T.dark}`, borderRadius: 3, padding: 2 }}>
            <div style={{ width: "82%", height: "100%", background: T.dark, borderRadius: 1 }} />
          </div>
          <div style={{ width: 2, height: 5, background: T.dark, borderRadius: 1, opacity: .45 }} />
        </div>
      </div>
    </div>
  );
}

// ─── Background CRM Ticket ────────────────────────────────────────────────────
function BackgroundCRMTicket() {
  return (
    <div style={{ position: "absolute", inset: 0, padding: "64px 14px 14px", overflowY: "hidden" }}>

      {/* Atlas CRM top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, opacity: .72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${T.dark}, ${T.darkMid})`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: T.gold, fontSize: 9, fontWeight: 700, letterSpacing: ".04em" }}>IG</span>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: T.dark, letterSpacing: ".07em" }}>ATLAS CRM</span>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {[T.border, T.border, T.border].map((c, i) => (
            <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
          ))}
        </div>
      </div>

      {/* Active ticket card */}
      <div style={{
        background:   T.bgWhite,
        border:       `1px solid ${T.border}`,
        borderRadius: 14,
        padding:      "14px",
        marginBottom: 10,
        opacity:      .78,
        boxShadow:    "0 2px 12px rgba(26,24,20,.07)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 8, fontWeight: 700, color: T.textMuted, letterSpacing: ".14em", marginBottom: 4 }}>
              ACTIVE REQUEST · #AT-2847
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: T.dark, letterSpacing: "-.02em", lineHeight: 1.15 }}>
              Advita Bihani
            </p>
            <p style={{ fontSize: 11, color: T.textSub, marginTop: 3 }}>
              26th Birthday Yacht Charter · Monaco
            </p>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: ".1em",
            color: "#A88B25", background: "#FEF3C7",
            border: "1px solid #FDE68A", borderRadius: 20, padding: "3px 9px",
            whiteSpace: "nowrap",
          }}>
            IN PROGRESS
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Monaco · 26–29 Apr", "8 Guests", "$50k Deposit"].map((tag, i) => (
            <span key={i} style={{
              fontSize: 9.5, color: T.textSub,
              background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: 20, padding: "3px 9px", fontWeight: 500,
            }}>{tag}</span>
          ))}
        </div>
      </div>

      {/* Detail rows */}
      {[
        { label: "Assigned to",   value: "Priya Sharma" },
        { label: "Vendor",        value: "Mediterranean Superyachts Ltd." },
        { label: "SLA Deadline",  value: "25 Apr 2026 · 6h remaining" },
      ].map((row, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "7px 2px",
          borderBottom: i < 2 ? `1px solid ${T.border}` : "none",
          opacity: .62,
        }}>
          <span style={{ fontSize: 10.5, color: T.textMuted }}>{row.label}</span>
          <span style={{ fontSize: 10.5, color: T.textSub, fontWeight: 500 }}>{row.value}</span>
        </div>
      ))}

      {/* Fade-out gradient — gives the illusion of content scrolling below the sheet */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 240,
        background: `linear-gradient(to bottom, transparent, ${T.bg})`,
        pointerEvents: "none",
      }} />
    </div>
  );
}

// ─── Floating Pill ────────────────────────────────────────────────────────────
function FloatingPill({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="elia-pill-pulse"
      style={{
        position:       "absolute",
        bottom:         28,
        right:          20,
        width:          58,
        height:         58,
        borderRadius:   "50%",
        background:     "rgba(20,18,14,.94)",
        backdropFilter: "blur(20px)",
        border:         `2px solid rgba(212,175,55,.55)`,
        cursor:         "pointer",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        zIndex:         60,
        transition:     "transform .2s ease, opacity .2s ease",
        transform:      isOpen ? "scale(.88)" : "scale(1)",
        opacity:        isOpen ? .5 : 1,
      }}
    >
      <div
        className="elia-orb"
        style={{
          width:  34, height: 34, borderRadius: "50%",
          background: `radial-gradient(circle at 38% 33%, rgba(212,175,55,.9), rgba(212,175,55,.25) 65%, transparent 85%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 17, color: T.gold, lineHeight: 1 }}>✦</span>
      </div>
    </button>
  );
}

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────
interface BottomSheetProps {
  onClose:      () => void;
  activeTab:    Tab;
  onTabChange:  (tab: Tab) => void;
  scanPhase:    ScanPhase;
  setScanPhase: (p: ScanPhase) => void;
  scanTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  approveState: ApproveState;
  onApprove:    () => void;
}

function EliaBottomSheet({
  onClose, activeTab, onTabChange, scanPhase, setScanPhase, scanTimerRef, approveState, onApprove,
}: BottomSheetProps) {
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 320, mass: .9 }}
      style={{
        position:      "absolute",
        bottom:        0, left: 0, right: 0,
        height:        "83%",
        background:    T.bgWhite,
        borderRadius:  "22px 22px 0 0",
        boxShadow:     "0 -24px 70px rgba(26,24,20,.28), 0 -2px 0 rgba(212,175,55,.1)",
        zIndex:        70,
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
      }}
    >
      {/* Drag handle */}
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
        <div style={{ width: 38, height: 4, background: T.border, borderRadius: 2 }} />
      </div>

      {/* Sticky header */}
      <SheetContextHeader onClose={onClose} />

      {/* Tab bar */}
      <SheetTabNav activeTab={activeTab} onTabChange={onTabChange} />

      {/* Scrollable tab content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative" }}>
        <AnimatePresence mode="wait" initial={false}>
          {activeTab === "profile" && (
            <motion.div key="profile"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: .18 }}>
              <ProfileTab />
            </motion.div>
          )}
          {activeTab === "audit" && (
            <motion.div key="audit"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: .18 }}>
              <AuditTab
                scanPhase={scanPhase}
                onRescan={() => {
                  setScanPhase("scanning");
                  if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
                  scanTimerRef.current = setTimeout(() => setScanPhase("complete"), 2800);
                }}
              />
            </motion.div>
          )}
          {activeTab === "workflow" && (
            <motion.div key="workflow"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: .18 }}>
              <WorkflowTab approveState={approveState} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Workflow FAB — sticky at bottom */}
      <AnimatePresence>
        {activeTab === "workflow" && approveState !== "done" && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            style={{
              padding:    "10px 16px 18px",
              borderTop:  `1px solid ${T.border}`,
              background: T.bgWhite,
              flexShrink: 0,
            }}
          >
            <WorkflowFAB approveState={approveState} onApprove={onApprove} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Sheet Context Header ─────────────────────────────────────────────────────
function SheetContextHeader({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ borderBottom: `1px solid ${T.border}`, background: T.bgWhite, flexShrink: 0 }}>

      {/* Elia branding row */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px 10px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: `linear-gradient(135deg, ${T.dark} 0%, ${T.darkMid} 100%)`,
            border: `2px solid rgba(212,175,55,.45)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 16px rgba(212,175,55,.2)`,
            flexShrink: 0,
          }}>
            <span style={{ color: T.gold, fontSize: 15 }}>✦</span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.dark, letterSpacing: ".08em" }}>ELIA</span>
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: ".1em",
                color: "#166534", background: T.greenBg,
                border: `1px solid ${T.greenBorder}`, borderRadius: 20, padding: "2px 8px",
              }}>ACTIVE</span>
            </div>
            <p style={{ fontSize: 9.5, color: T.textMuted, letterSpacing: ".04em", marginTop: 2 }}>
              Intelligence Layer Active
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 30, height: 30, borderRadius: "50%",
            background: T.bg, border: `1px solid ${T.border}`,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke={T.textSub} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Active client context bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "7px 16px 8px",
        borderTop: `1px solid ${T.border}`,
        background: T.bg,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          background: `linear-gradient(135deg, ${T.dark}, #5C4E3A)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, border: `1.5px solid rgba(212,175,55,.3)`,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: T.gold }}>AB</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
          <span style={{ fontSize: 10.5, color: T.textMuted }}>Active Client:</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.dark }}>Advita Bihani</span>
          <span style={{ fontSize: 9.5, color: T.textMuted, marginLeft: "auto" }}>Ticket #AT-2847</span>
        </div>
      </div>

      {/* Amber constraint bar */}
      <div style={{
        display: "flex", alignItems: "flex-start", gap: 8,
        padding: "7px 16px",
        background: T.amberBg,
        borderTop: `1px solid ${T.amberBorder}`,
      }}>
        <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>⚠️</span>
        <p style={{ fontSize: 10.5, color: T.amberText, fontWeight: 600, letterSpacing: ".02em", lineHeight: 1.45 }}>
          Severe pine nut allergy · WhatsApp only · No calls before 10 AM
        </p>
      </div>
    </div>
  );
}

// ─── Sheet Tab Nav ────────────────────────────────────────────────────────────
function SheetTabNav({ activeTab, onTabChange }: { activeTab: Tab; onTabChange: (t: Tab) => void }) {
  return (
    <div style={{
      display: "flex", background: T.bgWhite,
      borderBottom: `1px solid ${T.border}`,
      padding: "0 6px", flexShrink: 0,
    }}>
      {SHEET_TABS.map(({ id, label }) => {
        const active = id === activeTab;
        return (
          <button key={id} onClick={() => onTabChange(id)} style={{
            flex: 1, padding: "10px 6px 9px",
            border: "none",
            borderBottom: active ? `2.5px solid ${T.gold}` : "2.5px solid transparent",
            background: "transparent", cursor: "pointer",
            fontSize: 10.5, fontWeight: active ? 700 : 500,
            letterSpacing: ".08em", color: active ? T.dark : T.textMuted,
            textTransform: "uppercase" as const,
            transition: "all .2s ease", marginBottom: -1, outline: "none",
          }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Tab 1: Profile ───────────────────────────────────────────────────────────
function ProfileTab() {
  return (
    <div style={{ padding: "14px 16px 80px" }}>

      {/* Client header */}
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16, animation: "eliaFadeUp .4s ease" }}>
        <div style={{
          width: 54, height: 54, borderRadius: "50%",
          background: `linear-gradient(135deg, ${T.dark} 0%, #2E2820 55%, #5C4E3A 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, border: `2.5px solid ${T.border}`,
          boxShadow: `0 3px 14px rgba(26,24,20,.22)`,
        }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: T.gold }}>AB</span>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: T.dark, letterSpacing: "-.02em", lineHeight: 1.15 }}>
            Advita Bihani
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
            <span style={{
              fontSize: 9.5, fontWeight: 700, letterSpacing: ".14em",
              color: "#A88B25", background: "#FEF3C7",
              border: "1px solid #FDE68A", borderRadius: 20, padding: "3px 9px",
            }}>DIAMOND</span>
            <span style={{ fontSize: 10.5, color: T.textMuted }}>Member since 2022</span>
          </div>
        </div>
      </div>

      <Rule />

      {/* Taste scores */}
      <SectionLabel>Taste Profile</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 16 }}>
        {TASTE_SCORES.map(({ label, score }) => <TasteBar key={label} label={label} score={score} />)}
      </div>

      <Rule />

      {/* Interactions */}
      <SectionLabel>Recent Interactions</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {INTERACTIONS.map((item, i) => <InteractionCard key={i} {...item} />)}
      </div>
    </div>
  );
}

function TasteBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? T.gold : score >= 60 ? "#10B981" : "#94A3B8";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 74, fontSize: 11, color: T.textSub, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${score}%`, borderRadius: 99,
          background: `linear-gradient(90deg, ${color}80, ${color})`,
          transition: "width 1s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>
      <span style={{ width: 34, fontSize: 11, fontWeight: 700, color, textAlign: "right" as const, flexShrink: 0 }}>
        {score}%
      </span>
    </div>
  );
}

function InteractionCard({ channel, date, icon, color, text }: {
  channel: string; date: string; icon: string; color: string; text: string;
}) {
  return (
    <div style={{
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", color }}>{channel.toUpperCase()}</span>
        <span style={{ fontSize: 9.5, color: T.textMuted, marginLeft: "auto" }}>{date}</span>
      </div>
      <p style={{ fontSize: 11.5, color: T.textSub, lineHeight: 1.55 }}>{text}</p>
    </div>
  );
}

// ─── Tab 2: Audit ─────────────────────────────────────────────────────────────
function AuditTab({ scanPhase, onRescan }: { scanPhase: ScanPhase; onRescan: () => void }) {
  return (
    <div style={{ padding: "14px 16px 80px" }}>

      {/* Vendor identity */}
      <div style={{
        background: T.bg, border: `1px solid ${T.border}`, borderRadius: 12, padding: "13px 14px",
        marginBottom: 14, animation: "eliaFadeUp .3s ease",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".14em", color: T.textMuted, textTransform: "uppercase" as const, marginBottom: 4 }}>
              VENDOR UNDER SCAN
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: T.dark, letterSpacing: "-.01em", lineHeight: 1.25 }}>
              Mediterranean Superyachts Ltd.
            </p>
            <p style={{ fontSize: 9.5, color: T.textMuted, marginTop: 3, fontFamily: "ui-monospace, monospace" }}>
              medyachts.co/vessels/serenity-i
            </p>
          </div>
          <button
            onClick={onRescan}
            style={{
              background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8,
              padding: "5px 11px", fontSize: 9.5, fontWeight: 600, letterSpacing: ".07em",
              color: T.textMuted, cursor: "pointer", flexShrink: 0,
              textTransform: "uppercase" as const,
            }}
          >
            Rescan
          </button>
        </div>
      </div>

      {/* Scanning animation */}
      {scanPhase === "scanning" && (
        <div style={{
          background: T.bgWhite, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: "22px 16px", marginBottom: 14, textAlign: "center",
          animation: "eliaFadeUp .3s ease",
        }}>
          <div style={{ position: "relative", height: 3, background: T.border, borderRadius: 99, overflow: "hidden", marginBottom: 18 }}>
            <div style={{
              position: "absolute", top: 0, height: "100%", width: "30%",
              background: `linear-gradient(90deg, transparent, ${T.gold}, transparent)`,
              borderRadius: 99, animation: "eliaScanBar 1.3s ease-in-out infinite",
            }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 12 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} className={`elia-dot-${i}`} style={{ width: 7, height: 7, borderRadius: "50%", background: T.gold }} />
            ))}
          </div>
          <p style={{ fontSize: 10.5, color: T.textSub, letterSpacing: ".06em", fontWeight: 600, textTransform: "uppercase" as const }}>
            Scanning Vendor Profile…
          </p>
          <p style={{ fontSize: 9.5, color: T.textMuted, marginTop: 5, letterSpacing: ".02em" }}>
            Cross-referencing against Advita Bihani's constraint profile
          </p>
        </div>
      )}

      {/* Results */}
      {scanPhase === "complete" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, animation: "eliaFadeUp .4s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <SectionLabel noMargin>Audit Results</SectionLabel>
            <span style={{ fontSize: 9.5, color: T.textMuted, fontStyle: "italic" }}>3 findings</span>
          </div>
          {AUDIT_RESULTS.map((r, i) => <AuditResultCard key={i} {...r} delay={i * 130} />)}
          <p style={{ fontSize: 9.5, color: T.textMuted, textAlign: "center" as const, marginTop: 6 }}>
            Scan completed · Just now
          </p>
        </div>
      )}
    </div>
  );
}

function AuditResultCard({ type, icon, label, text, delay }: {
  type: "pass" | "warn" | "fail"; icon: string; label: string; text: string; delay: number;
}) {
  const S = {
    pass: { bg: T.greenBg, border: T.greenBorder, label: T.green,    body: "#15803D" },
    warn: { bg: T.amberBg, border: T.amberBorder, label: T.amberText, body: T.amberText },
    fail: { bg: T.redBg,   border: T.redBorder,   label: T.red,      body: "#B91C1C" },
  }[type];
  return (
    <div style={{
      background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: "11px 12px",
      animation: `eliaSlideIn .4s ease ${delay}ms both`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
        <div>
          <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".09em", color: S.label, textTransform: "uppercase" as const, marginBottom: 3 }}>
            {label}
          </p>
          <p style={{ fontSize: 11.5, color: S.body, lineHeight: 1.52 }}>{text}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 3: Workflow ──────────────────────────────────────────────────────────
function WorkflowTab({ approveState }: { approveState: ApproveState }) {
  return (
    <div style={{ padding: "14px 16px 24px" }}>

      {/* macOS-style terminal chrome */}
      <div style={{
        background: T.dark, borderRadius: "11px 11px 0 0", padding: "9px 14px",
        display: "flex", alignItems: "center", gap: 7,
        animation: "eliaFadeUp .3s ease",
      }}>
        <div style={{ display: "flex", gap: 5 }}>
          {["#FF5F57","#FFBD2E","#28C840"].map((c,i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
          ))}
        </div>
        <span style={{ fontSize: 9.5, color: "rgba(255,255,255,.35)", letterSpacing: ".07em", marginLeft: 4, fontFamily: "ui-monospace, monospace" }}>
          elia · workflow · ticket/AT-2847
        </span>
      </div>

      {/* Terminal body */}
      <div style={{
        background: "#0F0E0C",
        border: `1px solid rgba(212,175,55,.14)`, borderTop: "none",
        borderRadius: "0 0 11px 11px", padding: "14px",
        marginBottom: 14, animation: "eliaFadeUp .4s ease .08s both",
      }}>
        {/* Process header */}
        <p style={{
          fontSize: 9.5, letterSpacing: ".04em", marginBottom: 12,
          fontFamily: "ui-monospace, monospace",
          color: "rgba(212,175,55,.65)",
        }}>
          <span style={{ color: "#22C55E" }}>●</span>
          {" "}Executing Agentic Workflow
          {" "}<span style={{ color: "rgba(255,255,255,.2)" }}>— {new Date().toLocaleTimeString("en-GB", { hour12: false })}</span>
        </p>

        {/* Step list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {WORKFLOW_STEPS.map((step, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * .16 }}
              style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
            >
              <span style={{
                fontSize: 11, flexShrink: 0, marginTop: 1,
                color: step.done ? "#22C55E" : "rgba(212,175,55,.65)",
                fontFamily: "ui-monospace, monospace",
              }}>
                {step.done ? "✓" : "○"}
              </span>
              <p style={{
                fontSize: 11, fontFamily: "ui-monospace, monospace", lineHeight: 1.52, letterSpacing: ".005em",
                color: step.done ? "rgba(255,255,255,.75)" : "rgba(212,175,55,.8)",
              }}>
                {step.text}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Cursor / status line */}
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.06)" }}>
          {approveState === "idle" && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 11, color: T.gold, fontFamily: "ui-monospace, monospace" }}>›</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,.28)", fontFamily: "ui-monospace, monospace", letterSpacing: ".04em" }}>
                awaiting_approval
              </span>
              <div style={{
                width: 6, height: 13, background: T.gold, opacity: .75,
                animation: "eliaBlink 1s ease-in-out infinite",
              }} />
            </div>
          )}
          {approveState === "pending" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[1,2,3].map(i => (
                  <div key={i} className={`elia-dot-${i}`} style={{ width: 5, height: 5, borderRadius: "50%", background: T.gold }} />
                ))}
              </div>
              <span style={{ fontSize: 10, color: "rgba(212,175,55,.75)", fontFamily: "ui-monospace, monospace" }}>
                dispatching_confirmation…
              </span>
            </motion.div>
          )}
          {approveState === "done" && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <p style={{ fontSize: 11, color: "#22C55E", fontFamily: "ui-monospace, monospace", marginBottom: 4 }}>
                ✓ WhatsApp confirmation dispatched to Advita Bihani.
              </p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,.28)", fontFamily: "ui-monospace, monospace" }}>
                Workflow complete · All 4 steps executed.
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Pending action summary card */}
      {approveState !== "done" && (
        <div style={{
          background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px",
          animation: "eliaFadeUp .4s ease .28s both",
        }}>
          <SectionLabel>Pending Actions</SectionLabel>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.gold, marginTop: 4, flexShrink: 0 }} />
            <p style={{ fontSize: 11.5, color: T.textSub, lineHeight: 1.5 }}>
              Dispatch WhatsApp confirmation to Advita Bihani to finalise the Monaco yacht charter and wellness chef booking.
            </p>
          </div>
        </div>
      )}

      {approveState === "done" && (
        <motion.div
          initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}
          style={{
            background: T.greenBg, border: `1.5px solid ${T.greenBorder}`,
            borderRadius: 12, padding: "14px",
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <span style={{ fontSize: 20 }}>✅</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 2 }}>Workflow Executed</p>
            <p style={{ fontSize: 11, color: "#15803D", lineHeight: 1.45 }}>
              All steps dispatched. Advita will receive a WhatsApp message shortly.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Workflow FAB ─────────────────────────────────────────────────────────────
function WorkflowFAB({ approveState, onApprove }: { approveState: ApproveState; onApprove: () => void }) {
  const isPending = approveState === "pending";
  return (
    <button
      onClick={onApprove}
      disabled={isPending}
      style={{
        width: "100%", padding: "13px",
        background:   isPending
          ? "rgba(26,24,20,.55)"
          : `linear-gradient(135deg, ${T.dark} 0%, #2E2820 100%)`,
        border: `1.5px solid rgba(212,175,55,${isPending ? ".15" : ".42"})`,
        borderRadius: 13,
        cursor: isPending ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        boxShadow: isPending ? "none" : "0 5px 22px rgba(26,24,20,.38), 0 0 0 1px rgba(212,175,55,.1)",
        transition: "all .2s ease",
      }}
    >
      <span style={{ fontSize: 15, color: T.gold, animation: isPending ? "none" : "eliaGlow 2s ease-in-out infinite" }}>
        {isPending ? "⏳" : "✦"}
      </span>
      <span style={{
        fontSize: 11.5, fontWeight: 700, letterSpacing: ".12em",
        color: isPending ? "rgba(212,175,55,.4)" : T.gold,
        textTransform: "uppercase" as const,
      }}>
        {isPending ? "Dispatching…" : "Approve & Execute"}
      </span>
    </button>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────
function Rule() {
  return <div style={{ height: 1, background: T.border, margin: "0 0 14px" }} />;
}

function SectionLabel({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <p style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: ".13em",
      color: T.textMuted, textTransform: "uppercase" as const,
      marginBottom: noMargin ? 0 : 10,
    }}>
      {children}
    </p>
  );
}
