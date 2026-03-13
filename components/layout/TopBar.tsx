"use client";

import { motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { useChatDrawer } from "@/components/chat/ChatProvider";

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

function ChatTriggerButton() {
  const { openChat, unreadCount } = useChatDrawer();
  return (
    <motion.button
      onClick={openChat}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.94 }}
      className="relative w-9 h-9 rounded-xl flex items-center justify-center text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-black/[0.04] transition-colors duration-150"
      aria-label="Open messages"
    >
      <MessageSquare className="w-4 h-4" strokeWidth={1.75} />
      {unreadCount > 0 && (
        <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-[#D4AF37] rounded-full ring-2 ring-[#F9F9F6]" />
      )}
    </motion.button>
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

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      /*
       * Sits on top of the paper (#F9F9F6). The semi-transparent background
       * + backdrop-blur lets page content scroll gracefully beneath the bar.
       * The bottom separator is a hairline — 4 % black — just enough to
       * signal stickiness without a harsh line.
       */
      className="
        sticky top-0 z-30
        bg-[#F9F9F6]/80 backdrop-blur-xl
        border-b border-black/[0.05]
        px-8 py-4
        flex items-center justify-between
      "
    >
      {/* Left: title + optional subtitle */}
      <div>
        <h1
          className="
            text-[#1A1A1A] text-xl font-semibold leading-tight tracking-tight
          "
          style={{ fontFamily: "var(--font-playfair)" }}
        >
          <GoldDotTitle text={title} />
        </h1>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-[13px] text-[#9E9E9E] mt-0.5 font-normal tracking-wide"
          >
            {subtitle}
          </motion.p>
        )}
      </div>

      {/* Right: page-specific actions + chat drawer trigger + notification bell */}
      <div className="flex items-center gap-3">
        {actions}

        <ChatTriggerButton />

        <NotificationBell />
      </div>
    </motion.header>
  );
}
