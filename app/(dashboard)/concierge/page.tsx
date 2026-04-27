import { ConciergeClient } from "@/components/concierge/ConciergeClient";

export const metadata = {
  title: "Elia · Concierge Intelligence — Indulge Atlas",
};

export default function ConciergePage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F9F9F6]">
      {/* Top bar */}
      <header
        className="flex shrink-0 items-center justify-between border-b px-6 py-4"
        style={{
          borderColor: "#E5E4DF",
          background: "rgba(249,249,246,0.97)",
        }}
      >
        <div>
          <div className="flex items-center gap-3">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg"
              style={{
                background: "rgba(212,175,55,0.10)",
                border: "1px solid rgba(212,175,55,0.22)",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#D4AF37"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.98-3 2.5 2.5 0 0 1-1.32-4.24 3 3 0 0 1 .34-5.58 2.5 2.5 0 0 1 1.96-3.38A2.5 2.5 0 0 1 9.5 2Z" />
                <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.98-3 2.5 2.5 0 0 0 1.32-4.24 3 3 0 0 0-.34-5.58 2.5 2.5 0 0 0-1.96-3.38A2.5 2.5 0 0 0 14.5 2Z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-[#1A1A1A] tracking-tight">
              Elia
              <span className="text-[#D4AF37]">.</span>
            </h1>
            <span
              className="hidden sm:inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider"
              style={{
                background: "rgba(212,175,55,0.08)",
                color: "#B8973A",
                border: "1px solid rgba(212,175,55,0.20)",
              }}
            >
              Prototype · Intelligence Layer
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[#B5A99A] tracking-wide">
            RAG-native concierge intelligence — Indulge Global
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium"
            style={{
              background: "rgba(74,124,89,0.07)",
              color: "#4A7C59",
              border: "1px solid rgba(74,124,89,0.15)",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#4A7C59] animate-pulse" />
            All Systems Operational
          </div>
        </div>
      </header>

      {/* 3-pane workspace */}
      <div className="flex-1 overflow-hidden">
        <ConciergeClient />
      </div>
    </div>
  );
}
