"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { ClientWithProfile } from "@/lib/actions/clients";

interface ClientListRowProps {
  client: ClientWithProfile;
}

function displayName(c: ClientWithProfile): string {
  const parts = [c.first_name, c.last_name].filter(Boolean);
  return parts.join(" ").trim() || "—";
}

function initials(c: ClientWithProfile): string {
  const f = (c.first_name ?? "").trim().charAt(0);
  const l = (c.last_name ?? "").trim().charAt(0);
  const s = `${f}${l}`.toUpperCase();
  return s || "?";
}

function membershipBadgeClass(type: string | null): string {
  const t = type ?? "";
  if (t === "Premium")
    return "bg-[#D4AF37]/10 text-[#B8941E] border border-[#D4AF37]/25";
  if (t === "Celebrity")
    return "bg-[#EBE8E2] text-stone-700 border border-[#D4D0C8]";
  if (t === "Standard")
    return "bg-stone-100 text-stone-600 border border-stone-200";
  if (t === "Genie")
    return "bg-emerald-50 text-emerald-800 border border-emerald-200";
  if (t === "Monthly Trial")
    return "bg-orange-50 text-orange-800 border border-orange-200";
  return "bg-stone-100 text-stone-500 border border-stone-200";
}

function completenessTone(pct: number): string {
  if (pct <= 30) return "text-red-600";
  if (pct <= 70) return "text-amber-600";
  if (pct < 100) return "text-emerald-600";
  return "text-[#D4AF37]";
}

export function ClientListRow({ client }: ClientListRowProps) {
  const name = displayName(client);
  const pct = Math.min(
    100,
    Math.max(0, client.profile_completeness ?? 0),
  );
  const active = client.client_status === "active";

  return (
    <Link
      href={`/clients/${client.id}`}
      className={cn(
        "flex w-full items-center gap-3 border-b border-[#E5E4DF]/90 px-4 py-3 text-left transition-colors",
        "hover:bg-[#F9F9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F9F6]",
      )}
    >
      <Avatar
        className={cn(
          "h-11 w-11 shrink-0 border-2 border-[#D4AF37]/70",
          "bg-gradient-to-br from-[#EDEAE4] to-[#E0DDD6]",
        )}
      >
        <AvatarImage src={client.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-transparent font-[family-name:var(--font-playfair)] text-xs font-semibold text-[#9A855C]">
          {initials(client)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-[family-name:var(--font-playfair)] text-[15px] font-semibold text-stone-900">
            {name}
          </span>
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              active ? "bg-emerald-400" : "bg-stone-400",
            )}
            aria-hidden
          />
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
              membershipBadgeClass(client.membership_type),
            )}
          >
            {client.membership_type ?? "—"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-stone-500">
          <span className="text-stone-600">{client.queendom ?? "—"}</span>
          {" · "}
          <span>{client.primary_city ?? "—"}</span>
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-0.5 pr-1">
        <span
          className={cn(
            "font-[family-name:var(--font-playfair)] text-lg tabular-nums leading-none",
            completenessTone(pct),
          )}
        >
          {pct}%
        </span>
        <span className="text-[9px] font-medium uppercase tracking-wider text-stone-400">
          Profile
        </span>
      </div>
    </Link>
  );
}
