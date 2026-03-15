"use client";

/**
 * Semantic inline badges for platform/keyword micro-coloring.
 * Used across Indulge World views for instant visual scanning.
 */

type BadgeVariant = "whatsapp" | "instagram" | "indulge" | "data";

const BADGE_STYLES: Record<BadgeVariant, string> = {
  whatsapp:
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50/90 text-teal-600 ring-1 ring-inset ring-teal-400/15",
  instagram:
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-50/90 text-rose-500 ring-1 ring-inset ring-rose-400/15",
  indulge:
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50/90 text-sky-600 ring-1 ring-inset ring-sky-400/15",
  data: "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50/90 text-violet-600 ring-1 ring-inset ring-violet-400/15",
};

export const ICON_COLORS = {
  whatsapp: "text-teal-500",
  instagram: "text-rose-400",
  indulge: "text-sky-400",
  data: "text-violet-400",
} as const;

interface SemanticBadgeProps {
  children: React.ReactNode;
  variant: BadgeVariant;
  icon?: React.ReactNode;
}

export function SemanticBadge({ children, variant, icon }: SemanticBadgeProps) {
  return (
    <span className={BADGE_STYLES[variant]}>
      {icon}
      {children}
    </span>
  );
}
