"use client";

import { Suspense, useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./NotificationBell";
import { ScoutSLAAlerts } from "@/components/sla/ScoutSLAAlerts";
import { useChatDrawer } from "@/components/chat/ChatProvider";
import { useProfile } from "@/components/sla/ProfileProvider";
import { DomainSwitcher } from "@/components/domain/DomainSwitcher";
import { useCommandPalette } from "@/components/providers/CommandPaletteProvider";

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  variant?: "default" | "dark";
}

function ChatTriggerButton({ dark }: { dark?: boolean }) {
  const { openChat, unreadCount } = useChatDrawer();
  return (
    <button
      type="button"
      onClick={openChat}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-xl transition-[color,transform] duration-150 hover:scale-[1.08] active:scale-[0.94] motion-reduce:transform-none",
        dark
          ? "text-white/40 hover:bg-white/8 hover:text-white/80"
          : "text-[#9E9E9E] hover:bg-black/[0.04] hover:text-[#1A1A1A]",
      )}
      aria-label="Open messages"
    >
      <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
      {unreadCount > 0 && (
        <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#D4AF37] rounded-full ring-2 ring-[#F9F9F6]" />
      )}
    </button>
  );
}

/*
 * Renders the title with a signature gold period if the string ends in ".".
 * e.g. "Good morning, Arfam." → "Good morning, Arfam" + <span class="gold">.</span>
 * For all other page titles (no trailing dot) the string renders plainly.
 */
function GoldDotTitle({ text }: { text: string }) {
  if (text.endsWith(".")) {
    const body = text.slice(0, -1);
    return (
      <>
        {body}
        <span className="text-[#D4AF37]">.</span>
      </>
    );
  }
  return <>{text}</>;
}

function SearchShortcutHint({ dark }: { dark?: boolean }) {
  const { openPalette } = useCommandPalette();
  const [modLabel, setModLabel] = useState("⌘");

  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform ?? navigator.userAgent);
    setModLabel(isMac ? "⌘" : "Ctrl");
  }, []);

  return (
    <button
      type="button"
      onClick={() => openPalette()}
      className={
        dark
          ? "hidden sm:flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left transition-colors hover:bg-white/[0.07] hover:border-white/15"
          : "hidden sm:flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white/60 px-3 py-2 text-left transition-colors hover:bg-white hover:border-black/[0.08]"
      }
      aria-label="Open search"
    >
      <span
        className={
          dark ? "text-[13px] text-white/35" : "text-[13px] text-stone-400"
        }
      >
        Search…
      </span>
      <kbd
        className={
          dark
            ? "inline-flex items-center rounded-md border border-white/12 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/50 tabular-nums"
            : "inline-flex items-center rounded-md border border-stone-200/80 bg-stone-50 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500 tabular-nums"
        }
      >
        {modLabel}
        {"K"}
      </kbd>
    </button>
  );
}

export function TopBar({
  title,
  subtitle,
  actions,
  variant = "default",
}: TopBarProps) {
  const profile = useProfile();
  const showSLA =
    profile && (profile.role === "scout" || profile.role === "admin");
  const isDark = variant === "dark";

  return (
    <header
      /*
       * Sits on top of the paper (#F9F9F6). The semi-transparent background
       * + backdrop-blur lets page content scroll gracefully beneath the bar.
       * The bottom separator is a hairline — 4 % black — just enough to
       * signal stickiness without a harsh line.
       */
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between border-b px-4 py-4 backdrop-blur-xl md:px-6 lg:px-8",
        "animate-in fade-in slide-in-from-top-2 duration-300",
        isDark
          ? "border-white/6 bg-[#0D0C0A]/90"
          : "border-black/[0.05] bg-[#F9F9F6]/80",
      )}
    >
      {/* Left: title + optional subtitle */}
      <div>
        <h1
          className={
            isDark
              ? "text-white/95 text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight tracking-tight"
              : "text-[#1A1A1A] text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight tracking-tight"
          }
          style={!isDark ? { fontFamily: "var(--font-playfair)" } : undefined}
        >
          <GoldDotTitle text={title} />
        </h1>

        {subtitle && (
          <p
            className={
              isDark
                ? "mt-0.5 text-[13px] font-normal tracking-wide text-white/45"
                : "mt-0.5 text-[13px] font-normal tracking-wide text-[#9E9E9E]"
            }
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* Right: search hint + domain switcher (scout/admin) + actions + chat + notification + SLA */}
      <div className="flex items-center gap-3">
        <SearchShortcutHint dark={isDark} />
        <Suspense fallback={null}>
          <DomainSwitcher variant={variant} />
        </Suspense>
        {actions}

        <ChatTriggerButton dark={isDark} />

        <NotificationBell />

        {showSLA && <ScoutSLAAlerts userId={profile!.id} inline />}
      </div>
    </header>
  );
}
