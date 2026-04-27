"use client";

import { useState, useEffect, useRef } from "react";

// ─── Design tokens (Indulge Atlas "Light Quiet Luxury") ──────────────────────
const T = {
  bg:           "#F9F9F6",
  bgWhite:      "#FFFFFF",
  gold:         "#D4AF37",
  goldLight:    "#FEF3C7",
  dark:         "#1A1814",
  darkMid:      "#3C3530",
  border:       "#E5E4DF",
  borderLight:  "#EAEAEA",
  text:         "#1A1A1A",
  textSub:      "#6B6B6B",
  textMuted:    "#B5A99A",
  amberBg:      "#FFFBEB",
  amberBorder:  "#FDE68A",
  amberText:    "#92400E",
  amberIcon:    "#D97706",
  green:        "#166534",
  greenBg:      "#F0FDF4",
  greenBorder:  "#BBF7D0",
  red:          "#991B1B",
  redBg:        "#FEF2F2",
  redBorder:    "#FED7D7",
  scanLine:     "rgba(212,175,55,0.6)",
};

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TABS = [
  { id: "profile", label: "Profile" },
  { id: "audit",   label: "Vendor Audit" },
  { id: "chat",    label: "Ask Elia" },
];

// ─── Taste score data ─────────────────────────────────────────────────────────
const TASTE_SCORES = [
  { label: "Wellness",     score: 92 },
  { label: "Fine Dining",  score: 88 },
  { label: "Adventure",    score: 41 },
];

// ─── Interaction history ──────────────────────────────────────────────────────
const INTERACTIONS = [
  {
    channel: "WhatsApp",
    date:    "16 Mar 2024",
    icon:    "💬",
    color:   "#22C55E",
    text:    "Confirmed: Aman Tokyo booking (12–16 Mar). Requested floral arrangement in room.",
  },
  {
    channel: "Freshdesk",
    date:    "22 Mar 2024",
    icon:    "🎫",
    color:   "#6366F1",
    text:    "Request: Sourcing rare vintage watch (Patek Philippe Nautilus) for anniversary. Budget $150k.",
  },
];

// ─── Vendor audit results ─────────────────────────────────────────────────────
const AUDIT_RESULTS = [
  {
    type:  "pass",
    icon:  "✅",
    label: "Capacity match",
    text:  "Vessel capacity matches request (12 guests).",
  },
  {
    type:  "warn",
    icon:  "⚠️",
    label: "Gap identified",
    text:  "No dedicated wellness chef listed on crew manifesto.",
  },
  {
    type:  "fail",
    icon:  "❌",
    label: "Critical conflict",
    text:  "Standard menu includes pine nut pesto in 3 dishes. CRITICAL allergy conflict.",
  },
];

// ─── Chat history ─────────────────────────────────────────────────────────────
const CHAT_HISTORY = [
  {
    role: "user",
    text: "What are his fine dining preferences?",
  },
  {
    role: "elia",
    text: "Based on previous WhatsApp interactions from Mar 2024, Mr. Rao strongly prefers high-end Omakase and modern European dining. He highly prioritises privacy and exclusive table access.",
    source: "WhatsApp · 14 Mar 2024",
  },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function EliaSidePanel() {
  const [activeTab,    setActiveTab]    = useState("profile");
  const [visible,      setVisible]      = useState(true);
  const [scanPhase,    setScanPhase]    = useState("idle"); // idle | scanning | complete
  const [chatInput,    setChatInput]    = useState("");
  const scanTimerRef = useRef(null);

  const handleTabChange = (tab) => {
    if (tab === activeTab) return;
    setVisible(false);
    setTimeout(() => {
      setActiveTab(tab);
      setVisible(true);
      // Reset scan state when switching to audit tab
      if (tab === "audit") {
        setScanPhase("scanning");
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = setTimeout(() => setScanPhase("complete"), 2800);
      }
    }, 200);
  };

  // Start scanning automatically when audit tab mounts
  useEffect(() => {
    if (activeTab === "audit" && scanPhase === "idle") {
      setScanPhase("scanning");
      scanTimerRef.current = setTimeout(() => setScanPhase("complete"), 2800);
    }
    return () => clearTimeout(scanTimerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div style={panelStyle}>

      {/* ── Keyframe animations ── */}
      <style>{`
        @keyframes eliaFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes eliaDot {
          0%, 80%, 100% { opacity: 0.15; transform: scale(0.75); }
          40%            { opacity: 1;    transform: scale(1.1);  }
        }
        @keyframes eliaScanBar {
          0%   { left: -30%; opacity: 0.5; }
          50%  { opacity: 1; }
          100% { left: 110%; opacity: 0.5; }
        }
        @keyframes eliaResultIn {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        .elia-dot-1 { animation: eliaDot 1.4s ease-in-out 0.0s infinite; }
        .elia-dot-2 { animation: eliaDot 1.4s ease-in-out 0.2s infinite; }
        .elia-dot-3 { animation: eliaDot 1.4s ease-in-out 0.4s infinite; }
        .elia-dot-4 { animation: eliaDot 1.4s ease-in-out 0.6s infinite; }
        .elia-dot-5 { animation: eliaDot 1.4s ease-in-out 0.8s infinite; }
      `}</style>

      {/* ── Panel header ── */}
      <PanelHeader />

      {/* ── Tab navigation ── */}
      <TabNav tabs={TABS} activeTab={activeTab} onTabChange={handleTabChange} />

      {/* ── Screen content (fade transition) ── */}
      <div style={{
        flex:       1,
        overflowY:  "auto",
        transition: "opacity 0.3s ease",
        opacity:    visible ? 1 : 0,
      }}>
        {activeTab === "profile" && <ProfileScreen />}
        {activeTab === "audit"   && <VendorAuditScreen scanPhase={scanPhase} onRescan={() => {
          setScanPhase("scanning");
          clearTimeout(scanTimerRef.current);
          scanTimerRef.current = setTimeout(() => setScanPhase("complete"), 2800);
        }} />}
        {activeTab === "chat"    && (
          <ChatScreen
            chatInput={chatInput}
            setChatInput={setChatInput}
          />
        )}
      </div>

      {/* ── Sticky chat input for Ask Elia tab ── */}
      {activeTab === "chat" && (
        <ChatInputBar value={chatInput} onChange={setChatInput} />
      )}

      {/* ── Panel footer ── */}
      <PanelFooter />
    </div>
  );
}

// ─── Panel Header ─────────────────────────────────────────────────────────────
function PanelHeader() {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      padding:        "16px 18px 14px",
      borderBottom:   `1px solid ${T.border}`,
      background:     T.bgWhite,
    }}>
      {/* Left: wordmark */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width:        32,
          height:       32,
          borderRadius: "50%",
          background:   `linear-gradient(135deg, ${T.dark} 0%, ${T.darkMid} 100%)`,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          flexShrink:   0,
          border:       `1px solid rgba(212,175,55,0.3)`,
          boxShadow:    `0 0 0 2px rgba(212,175,55,0.08)`,
        }}>
          <span style={{ color: T.gold, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>IG</span>
        </div>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.dark, lineHeight: 1 }}>
            INDULGE GLOBAL
          </p>
          <p style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.06em", marginTop: 2, lineHeight: 1 }}>
            CONCIERGE INTELLIGENCE
          </p>
        </div>
      </div>

      {/* Right: Elia badge */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          5,
        background:   `linear-gradient(135deg, ${T.dark}ee, ${T.darkMid}cc)`,
        border:       `1px solid rgba(212,175,55,0.35)`,
        borderRadius: 20,
        padding:      "4px 10px 4px 7px",
      }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   "#22C55E",
          display:      "inline-block",
          boxShadow:    "0 0 6px #22C55E99",
          animation:    "eliaDot 2s ease-in-out infinite",
        }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: T.gold }}>ELIA</span>
      </div>
    </div>
  );
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────
function TabNav({ tabs, activeTab, onTabChange }) {
  return (
    <div style={{
      display:      "flex",
      background:   T.bgWhite,
      borderBottom: `1px solid ${T.border}`,
      padding:      "0 6px",
    }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              flex:           1,
              padding:        "11px 6px 10px",
              border:         "none",
              borderBottom:   isActive ? `2px solid ${T.gold}` : "2px solid transparent",
              background:     "transparent",
              cursor:         "pointer",
              fontSize:       11,
              fontWeight:     isActive ? 700 : 500,
              letterSpacing:  "0.07em",
              color:          isActive ? T.dark : T.textMuted,
              textTransform:  "uppercase",
              transition:     "all 0.2s ease",
              marginBottom:   -1,
              outline:        "none",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Screen 1: Client Profile ─────────────────────────────────────────────────
function ProfileScreen() {
  return (
    <div style={{ padding: "0 0 24px" }}>

      {/* Absolute Constraints Bar */}
      <div style={{
        margin:       "14px 16px 0",
        background:   T.amberBg,
        border:       `1px solid ${T.amberBorder}`,
        borderRadius: 10,
        padding:      "9px 12px",
        display:      "flex",
        alignItems:   "flex-start",
        gap:          7,
        animation:    "eliaFadeUp 0.4s ease",
      }}>
        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>⚠</span>
        <p style={{
          fontSize:     11,
          color:        T.amberText,
          letterSpacing: "0.02em",
          lineHeight:   1.55,
          fontWeight:   500,
        }}>
          Severe pine nut allergy · WhatsApp only · No early morning calls
        </p>
      </div>

      {/* Client Header */}
      <div style={{
        display:     "flex",
        alignItems:  "center",
        gap:         14,
        padding:     "18px 16px 4px",
        animation:   "eliaFadeUp 0.4s ease 0.05s both",
      }}>
        {/* Avatar */}
        <div style={{
          width:          52,
          height:         52,
          borderRadius:   "50%",
          background:     `linear-gradient(135deg, ${T.dark} 0%, #2E2820 60%, #5C4E3A 100%)`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          border:         `2px solid ${T.border}`,
          boxShadow:      `0 2px 12px rgba(26,24,20,0.18)`,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.gold, letterSpacing: "0.04em" }}>AR</span>
        </div>

        {/* Name + tier */}
        <div style={{ flex: 1 }}>
          <p style={{
            fontSize:   18,
            fontWeight: 600,
            color:      T.dark,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}>
            Arjun Rao
          </p>
          <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize:     10,
              fontWeight:   700,
              letterSpacing: "0.14em",
              color:        "#A88B25",
              background:   "#FEF3C7",
              border:       "1px solid #FDE68A",
              borderRadius: 20,
              padding:      "3px 9px",
            }}>
              PLATINUM
            </span>
            <span style={{ fontSize: 11, color: T.textMuted, letterSpacing: "0.04em" }}>
              Member since 2021
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <Divider />

      {/* Taste Scores */}
      <div style={{
        padding:   "4px 16px 0",
        animation: "eliaFadeUp 0.4s ease 0.1s both",
      }}>
        <SectionLabel>Taste Profile</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {TASTE_SCORES.map(({ label, score }) => (
            <TasteBar key={label} label={label} score={score} />
          ))}
        </div>
      </div>

      <Divider />

      {/* Last 2 Interactions */}
      <div style={{
        padding:   "4px 16px 0",
        animation: "eliaFadeUp 0.4s ease 0.15s both",
      }}>
        <SectionLabel>Recent Interactions</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {INTERACTIONS.map((item, i) => (
            <InteractionCard key={i} {...item} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Taste Score Bar ──────────────────────────────────────────────────────────
function TasteBar({ label, score }) {
  const getColor = (s) => {
    if (s >= 80) return T.gold;
    if (s >= 60) return "#10B981";
    return "#94A3B8";
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <p style={{
        width:         82,
        fontSize:      11,
        color:         T.textSub,
        letterSpacing: "0.04em",
        flexShrink:    0,
      }}>
        {label}
      </p>
      <div style={{
        flex:          1,
        height:        5,
        background:    T.border,
        borderRadius:  99,
        overflow:      "hidden",
      }}>
        <div style={{
          height:       "100%",
          width:        `${score}%`,
          background:   `linear-gradient(90deg, ${getColor(score)}99, ${getColor(score)})`,
          borderRadius: 99,
          transition:   "width 0.8s cubic-bezier(0.4,0,0.2,1)",
        }} />
      </div>
      <p style={{
        width:         28,
        fontSize:      11,
        fontWeight:    600,
        color:         getColor(score),
        textAlign:     "right",
        flexShrink:    0,
        letterSpacing: "0.02em",
      }}>
        {score}%
      </p>
    </div>
  );
}

// ─── Interaction Card ─────────────────────────────────────────────────────────
function InteractionCard({ channel, date, icon, color, text }) {
  return (
    <div style={{
      background:   T.bg,
      border:       `1px solid ${T.border}`,
      borderRadius: 10,
      padding:      "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{
          fontSize:     10,
          fontWeight:   700,
          letterSpacing: "0.08em",
          color,
        }}>
          {channel.toUpperCase()}
        </span>
        <span style={{
          fontSize: 10,
          color:    T.textMuted,
          marginLeft: "auto",
          letterSpacing: "0.02em",
        }}>
          {date}
        </span>
      </div>
      <p style={{
        fontSize:   12,
        color:      T.textSub,
        lineHeight: 1.55,
      }}>
        {text}
      </p>
    </div>
  );
}

// ─── Screen 2: Vendor Audit ───────────────────────────────────────────────────
function VendorAuditScreen({ scanPhase, onRescan }) {
  const isScanning = scanPhase === "scanning";
  const isComplete = scanPhase === "complete";

  return (
    <div style={{ padding: "14px 16px 24px" }}>

      {/* Vendor identity */}
      <div style={{
        background:   T.bg,
        border:       `1px solid ${T.border}`,
        borderRadius: 12,
        padding:      "14px",
        marginBottom: 14,
        animation:    "eliaFadeUp 0.4s ease",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <p style={{
              fontSize:     13,
              fontWeight:   700,
              color:        T.dark,
              letterSpacing: "-0.01em",
              lineHeight:   1.2,
            }}>
              Mediterranean Superyachts Ltd.
            </p>
            <p style={{
              fontSize:     10,
              color:        T.textMuted,
              marginTop:    4,
              fontFamily:   "ui-monospace, SFMono-Regular, monospace",
              letterSpacing: "0.02em",
            }}>
              www.medyachts.co/vessels/serenity
            </p>
          </div>
          <button
            onClick={onRescan}
            style={{
              background:   "transparent",
              border:       `1px solid ${T.border}`,
              borderRadius: 8,
              padding:      "5px 10px",
              fontSize:     10,
              fontWeight:   600,
              letterSpacing: "0.06em",
              color:        T.textMuted,
              cursor:       "pointer",
              flexShrink:   0,
              textTransform: "uppercase",
            }}
          >
            Rescan
          </button>
        </div>
      </div>

      {/* Scanning animation */}
      {isScanning && (
        <div style={{
          background:   T.bgWhite,
          border:       `1px solid ${T.border}`,
          borderRadius: 12,
          padding:      "20px 16px",
          marginBottom: 14,
          animation:    "eliaFadeUp 0.3s ease",
          textAlign:    "center",
        }}>
          {/* Scan bar */}
          <div style={{
            position:     "relative",
            height:       3,
            background:   T.border,
            borderRadius: 99,
            overflow:     "hidden",
            marginBottom: 16,
          }}>
            <div style={{
              position:     "absolute",
              top:          0,
              height:       "100%",
              width:        "30%",
              background:   `linear-gradient(90deg, transparent, ${T.gold}, transparent)`,
              borderRadius: 99,
              animation:    "eliaScanBar 1.5s ease-in-out infinite",
            }} />
          </div>

          {/* Pulsing dots */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginBottom: 12 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`elia-dot-${i}`}
                style={{
                  width:        7,
                  height:       7,
                  borderRadius: "50%",
                  background:   T.gold,
                }}
              />
            ))}
          </div>

          <p style={{
            fontSize:      11,
            color:         T.textSub,
            letterSpacing: "0.06em",
            fontWeight:    500,
            textTransform: "uppercase",
          }}>
            Analysing vendor text DOM…
          </p>
          <p style={{
            fontSize:   10,
            color:      T.textMuted,
            marginTop:  4,
            letterSpacing: "0.02em",
          }}>
            Cross-referencing against client preference profile
          </p>
        </div>
      )}

      {/* Results */}
      {isComplete && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <SectionLabel noMargin>Audit Results</SectionLabel>
            <span style={{
              fontSize:     10,
              color:        T.textMuted,
              letterSpacing: "0.04em",
              fontStyle:    "italic",
            }}>
              3 findings
            </span>
          </div>
          {AUDIT_RESULTS.map((result, i) => (
            <AuditResultCard key={i} {...result} delay={i * 100} />
          ))}
          <p style={{
            fontSize:   10,
            color:      T.textMuted,
            textAlign:  "center",
            marginTop:  8,
            letterSpacing: "0.04em",
          }}>
            Scan completed · Just now
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Audit Result Card ────────────────────────────────────────────────────────
function AuditResultCard({ type, icon, label, text, delay }) {
  const styles = {
    pass: { bg: T.greenBg,  border: T.greenBorder, labelColor: "#166534", textColor: "#15803D" },
    warn: { bg: T.amberBg,  border: T.amberBorder, labelColor: T.amberText, textColor: "#92400E" },
    fail: { bg: T.redBg,    border: T.redBorder,   labelColor: T.red, textColor: "#B91C1C" },
  };
  const s = styles[type];

  return (
    <div style={{
      background:   s.bg,
      border:       `1px solid ${s.border}`,
      borderRadius: 10,
      padding:      "11px 12px",
      animation:    `eliaResultIn 0.4s ease ${delay}ms both`,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{icon}</span>
        <div>
          <p style={{
            fontSize:      10,
            fontWeight:    700,
            letterSpacing: "0.08em",
            color:         s.labelColor,
            textTransform: "uppercase",
            marginBottom:  3,
          }}>
            {label}
          </p>
          <p style={{
            fontSize:   12,
            color:      s.textColor,
            lineHeight: 1.5,
          }}>
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 3: Ask Elia ───────────────────────────────────────────────────────
function ChatScreen({ chatInput, setChatInput }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <div style={{ padding: "14px 16px 8px" }}>

      {/* Welcome header */}
      <div style={{
        textAlign:    "center",
        paddingBottom: 16,
        animation:    "eliaFadeUp 0.4s ease",
      }}>
        <div style={{
          width:          38,
          height:         38,
          borderRadius:   "50%",
          background:     `linear-gradient(135deg, ${T.dark}, #5C4E3A)`,
          border:         `2px solid rgba(212,175,55,0.3)`,
          margin:         "0 auto 10px",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          boxShadow:      `0 0 16px rgba(212,175,55,0.15)`,
        }}>
          <span style={{ fontSize: 16 }}>✦</span>
        </div>
        <p style={{
          fontSize:      12,
          color:         T.textSub,
          letterSpacing: "0.03em",
          lineHeight:    1.6,
          maxWidth:      260,
          margin:        "0 auto",
        }}>
          Elia Intelligence Layer Active.<br />
          <span style={{ color: T.textMuted }}>Ask me about Arjun Rao&apos;s preferences.</span>
        </p>
      </div>

      <Divider />

      {/* Q&A History */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {CHAT_HISTORY.map((msg, i) => (
          <ChatMessage key={i} {...msg} delay={i * 80} />
        ))}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}

// ─── Chat Message ─────────────────────────────────────────────────────────────
function ChatMessage({ role, text, source, delay }) {
  if (role === "user") {
    return (
      <div style={{
        display:   "flex",
        justifyContent: "flex-end",
        animation: `eliaFadeUp 0.4s ease ${delay}ms both`,
      }}>
        <div style={{
          maxWidth:     "75%",
          background:   T.bg,
          border:       `1px solid ${T.border}`,
          borderRadius: "12px 12px 4px 12px",
          padding:      "9px 13px",
        }}>
          <p style={{ fontSize: 12, color: T.dark, lineHeight: 1.55 }}>
            {text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      animation: `eliaFadeUp 0.4s ease ${delay + 40}ms both`,
    }}>
      {/* Elia label */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        gap:           5,
        marginBottom:  6,
      }}>
        <div style={{
          width:        18,
          height:       18,
          borderRadius: "50%",
          background:   `linear-gradient(135deg, ${T.dark}, ${T.darkMid})`,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          border:       `1px solid rgba(212,175,55,0.3)`,
          flexShrink:   0,
        }}>
          <span style={{ fontSize: 8, color: T.gold }}>✦</span>
        </div>
        <span style={{
          fontSize:     10,
          fontWeight:   700,
          letterSpacing: "0.1em",
          color:        T.gold,
        }}>
          ELIA
        </span>
      </div>

      {/* Response body — terminal/intel style */}
      <div style={{
        background:   T.dark,
        border:       `1px solid rgba(212,175,55,0.2)`,
        borderRadius: "4px 12px 12px 12px",
        padding:      "12px 14px",
        position:     "relative",
        overflow:     "hidden",
      }}>
        {/* Subtle gold accent line */}
        <div style={{
          position:   "absolute",
          top:        0,
          left:       0,
          width:      3,
          height:     "100%",
          background: `linear-gradient(180deg, ${T.gold}88, transparent)`,
        }} />
        <p style={{
          fontSize:   12.5,
          color:      "rgba(255,255,255,0.88)",
          lineHeight: 1.65,
          paddingLeft: 8,
          letterSpacing: "0.01em",
        }}>
          {text}
        </p>
      </div>

      {/* Source chip */}
      {source && (
        <div style={{
          display:      "inline-flex",
          alignItems:   "center",
          gap:          5,
          marginTop:    7,
          background:   T.bg,
          border:       `1px solid ${T.border}`,
          borderRadius: 20,
          padding:      "3px 9px 3px 7px",
        }}>
          <span style={{ fontSize: 9 }}>📎</span>
          <span style={{
            fontSize:     10,
            color:        T.textSub,
            letterSpacing: "0.04em",
            fontWeight:   500,
          }}>
            Source: {source}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Chat Input Bar ───────────────────────────────────────────────────────────
function ChatInputBar({ value, onChange }) {
  return (
    <div style={{
      borderTop:    `1px solid ${T.border}`,
      background:   T.bgWhite,
      padding:      "10px 14px",
    }}>
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          8,
        background:   T.bg,
        border:       `1px solid ${T.border}`,
        borderRadius: 10,
        padding:      "8px 12px",
      }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ask Elia…"
          style={{
            flex:        1,
            border:      "none",
            background:  "transparent",
            outline:     "none",
            fontSize:    12.5,
            color:       T.dark,
            letterSpacing: "0.01em",
          }}
        />
        <div style={{
          display:    "flex",
          alignItems: "center",
          gap:        6,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize:     9,
            color:        T.textMuted,
            letterSpacing: "0.04em",
            fontFamily:   "ui-monospace, SFMono-Regular, monospace",
            background:   T.border,
            borderRadius: 4,
            padding:      "2px 5px",
          }}>
            ⌘↵
          </span>
          <button style={{
            width:          26,
            height:         26,
            borderRadius:   "50%",
            background:     T.dark,
            border:         "none",
            cursor:         "pointer",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 6H11M11 6L7 2M11 6L7 10" stroke={T.gold} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel Footer ─────────────────────────────────────────────────────────────
function PanelFooter() {
  return (
    <div style={{
      borderTop:      `1px solid ${T.border}`,
      background:     T.bg,
      padding:        "8px 16px",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      borderRadius:   "0 0 16px 16px",
    }}>
      <p style={{
        fontSize:     9.5,
        color:        T.textMuted,
        letterSpacing: "0.05em",
      }}>
        ELIA v1.0 · INDULGE GLOBAL
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{
          width:        5,
          height:       5,
          borderRadius: "50%",
          background:   "#22C55E",
          boxShadow:    "0 0 4px #22C55E88",
        }} />
        <p style={{
          fontSize:     9.5,
          color:        T.textMuted,
          letterSpacing: "0.04em",
        }}>
          Connected
        </p>
      </div>
    </div>
  );
}

// ─── Shared: Section Label ────────────────────────────────────────────────────
function SectionLabel({ children, noMargin }) {
  return (
    <p style={{
      fontSize:     10,
      fontWeight:   700,
      letterSpacing: "0.12em",
      color:        T.textMuted,
      textTransform: "uppercase",
      marginBottom: noMargin ? 0 : 10,
    }}>
      {children}
    </p>
  );
}

// ─── Shared: Divider ──────────────────────────────────────────────────────────
function Divider() {
  return (
    <div style={{
      height:     1,
      background: T.border,
      margin:     "14px 16px",
    }} />
  );
}

// ─── Panel style ──────────────────────────────────────────────────────────────
const panelStyle = {
  width:        380,
  minHeight:    600,
  maxHeight:    700,
  display:      "flex",
  flexDirection: "column",
  background:   T.bgWhite,
  border:       `1px solid ${T.border}`,
  borderRadius: 16,
  boxShadow:    "0 20px 60px -12px rgba(26,24,20,0.22), 0 4px 16px -4px rgba(26,24,20,0.1), 0 0 0 1px rgba(26,24,20,0.04)",
  fontFamily:   "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
  overflow:     "hidden",
  position:     "relative",
};
