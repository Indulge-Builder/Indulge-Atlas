"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type TermId =
  | "joker"
  | "genie"
  | "queendom"
  | "channels"
  | "bishop"
  | "account";

const TERMS: Record<
  TermId,
  { emoji: string; label: string; description: string }
> = {
  joker: {
    emoji: "🃏",
    label: "Joker",
    description:
      "Curators who post daily suggestions based on your profiled interests — sports, music, food, travel. Predictive curation for special dates & anniversaries.",
  },
  genie: {
    emoji: "🧞",
    label: "Genie",
    description:
      "The wish-fulfillment engine. Clients make requests; Genies source and deliver — from rare items to villa access.",
  },
  queendom: {
    emoji: "👑",
    label: "Queendom",
    description:
      "Your assigned concierge team. Each client is placed in a Queendom for personalized, high-touch service.",
  },
  channels: {
    emoji: "🌐",
    label: "Channels",
    description:
      "Instagram, Facebook, WhatsApp, referrals, events, and more — every way someone can find Indulge.",
  },
  bishop: {
    emoji: "♟",
    label: "Bishop",
    description:
      "Senior concierge coordinators who oversee Queendom operations and ensure seamless client delivery.",
  },
  account: {
    emoji: "📋",
    label: "Account",
    description:
      "The primary client relationship holder for each Queendom, ensuring continuity and white-glove service.",
  },
};

interface TermTooltipProps {
  term: TermId;
  children: React.ReactNode;
}

export function TermTooltip({ term, children }: TermTooltipProps) {
  const { emoji, label, description } = TERMS[term];
  return (
    <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted decoration-stone-300/50 underline-offset-2">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[260px] rounded-xl border-0 bg-white/95 px-4 py-3 shadow-[0_4px_20px_rgb(0,0,0,0.06)] ring-1 ring-stone-200/40 backdrop-blur-sm"
        >
          <p className="text-xs font-medium text-stone-600">
            <span className="mr-1.5">{emoji}</span>
            {label}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-stone-500/90">
            {description}
          </p>
        </TooltipContent>
      </Tooltip>
  );
}
