"use client";

import { CreditCard, MessageSquare, User } from "lucide-react";
import { isAfter, parseISO } from "date-fns";
import { surfaceCardVariants } from "@/components/ui/card";
import type { ClientDetail } from "@/lib/actions/clients";
import { cn } from "@/lib/utils";

export interface ClientFreshdeskMetricState {
  loading: boolean;
  error: boolean;
  found: boolean;
  total: number;
  open: number;
}

export interface ClientMetricPillsProps {
  detail: ClientDetail;
  freshdesk: ClientFreshdeskMetricState;
}

function membershipActive(detail: ClientDetail): boolean {
  if (!detail.membership_end?.trim()) {
    return detail.client_status === "active";
  }
  try {
    return isAfter(parseISO(`${detail.membership_end}T12:00:00`), new Date());
  } catch {
    return false;
  }
}

function profileCompletenessValue(detail: ClientDetail): number {
  const n = detail.profile_completeness;
  if (n == null || Number.isNaN(Number(n))) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(n))));
}

function profileSubClass(
  pct: number,
): { label: string; className: string } {
  if (pct >= 100) {
    return { label: "Complete", className: "text-emerald-400" };
  }
  if (pct >= 50) {
    return { label: "Partial", className: "text-amber-400" };
  }
  return { label: "Needs attention", className: "text-red-400" };
}

export function ClientMetricPills({ detail, freshdesk }: ClientMetricPillsProps) {
  const active = membershipActive(detail);
  const pct = profileCompletenessValue(detail);
  const profileSub = profileSubClass(pct);

  const ticketValue = freshdesk.loading
    ? "…"
    : freshdesk.error || !freshdesk.found
      ? "—"
      : String(freshdesk.total);

  const ticketSub = (() => {
    if (freshdesk.loading) {
      return <span className="text-xs text-stone-400">Loading…</span>;
    }
    if (freshdesk.error) {
      return <span className="text-xs text-stone-400">Unavailable</span>;
    }
    if (!freshdesk.found) {
      return <span className="text-xs text-stone-400">No history</span>;
    }
    if (freshdesk.open > 0) {
      return (
        <span className="text-xs text-amber-400">{freshdesk.open} open</span>
      );
    }
    return (
      <span className="text-xs text-emerald-400">All resolved</span>
    );
  })();

  return (
    <div className="flex min-h-[80px] shrink-0 gap-3">
      <div
        className={cn(
          surfaceCardVariants({ tone: "subtle", elevation: "sm" }),
          "group flex flex-1 flex-col justify-center rounded-xl border-l-2 border-[#D4AF37]/30 p-3 transition-[border-color] hover:border-[#D4AF37]",
        )}
      >
        <div className="flex items-start gap-2">
          <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Membership
            </p>
            <p className="text-lg font-semibold leading-tight text-stone-900">
              {detail.membership_type?.trim() || "—"}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  active ? "bg-emerald-400" : "bg-stone-400",
                )}
                aria-hidden
              />
              <span className={active ? "text-emerald-400" : "text-stone-400"}>
                {active ? "Active" : "Expired"}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div
        className={cn(
          surfaceCardVariants({ tone: "subtle", elevation: "sm" }),
          "group flex flex-1 flex-col justify-center rounded-xl border-l-2 border-[#D4AF37]/30 p-3 transition-[border-color] hover:border-[#D4AF37]",
        )}
      >
        <div className="flex items-start gap-2">
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Tickets
            </p>
            <p className="text-lg font-semibold leading-tight text-stone-900">
              {ticketValue}
            </p>
            <div className="mt-1">{ticketSub}</div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          surfaceCardVariants({ tone: "subtle", elevation: "sm" }),
          "group flex flex-1 flex-col justify-center rounded-xl border-l-2 border-[#D4AF37]/30 p-3 transition-[border-color] hover:border-[#D4AF37]",
        )}
      >
        <div className="flex items-start gap-2">
          <User className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Profile
            </p>
            <p className="text-lg font-semibold leading-tight text-stone-900">
              {pct}%
            </p>
            <p className={cn("mt-1 text-xs", profileSub.className)}>
              {profileSub.label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
