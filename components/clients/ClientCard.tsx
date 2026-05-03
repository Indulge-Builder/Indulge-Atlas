"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ClientWithProfile } from "@/lib/actions/clients";
import { formatInTimeZone } from "date-fns-tz";
import { SYSTEM_TIMEZONE } from "@/lib/utils/time";

interface ClientCardProps {
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

export function ClientCard({ client }: ClientCardProps) {
  const name = displayName(client);
  const membershipLabel = client.membership_type ?? "—";
  const queendom = client.queendom ?? "—";
  const city = client.primary_city ?? "—";
  const company = client.company_designation ?? "—";
  const personality = client.personality_type ?? "—";
  const diet =
    client.lifestyle?.dietary_preference &&
    String(client.lifestyle.dietary_preference).trim() !== ""
      ? client.lifestyle.dietary_preference
      : "—";
  const cuisines =
    client.lifestyle?.favourite_cuisine?.filter(Boolean).join(", ") || "—";
  const destination =
    client.travel?.go_to_country &&
    String(client.travel.go_to_country).trim() !== ""
      ? client.travel.go_to_country
      : "—";

  const expiryLabel =
    client.membership_end != null && client.membership_end !== ""
      ? formatInTimeZone(
          new Date(`${client.membership_end}T12:00:00`),
          SYSTEM_TIMEZONE,
          "MMM yyyy",
        )
      : "—";

  const active = client.client_status === "active";

  return (
    <Link
      href={`/clients/${client.id}`}
      className={cn(
        surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
        "group block w-full text-left transition-all duration-300",
        "hover:-translate-y-0.5 hover:border-[#D4AF37]/35 hover:shadow-[0_8px_28px_-8px_rgb(90_85_75/0.12)]",
      )}
    >
      <div className="p-4">
        <div className="flex gap-3">
          <Avatar
            className={cn(
              "h-14 w-14 shrink-0 border-2 border-[#D4AF37]/70",
              "bg-gradient-to-br from-[#EDEAE4] to-[#E0DDD6]",
            )}
          >
            <AvatarImage src={client.avatar_url ?? undefined} alt="" className="object-cover" />
            <AvatarFallback className="bg-transparent font-[family-name:var(--font-playfair)] text-sm font-semibold text-[#9A855C]">
              {initials(client)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <p
              className="truncate font-[family-name:var(--font-playfair)] text-base font-semibold text-stone-900"
              style={{ fontSize: "16px" }}
            >
              {name}
            </p>
            <span className="mt-1 inline-block max-w-full truncate rounded-full bg-[#F4F1EA] px-2 py-0.5 text-[10px] font-medium text-stone-700 ring-1 ring-[#E5E4DF]/90">
              {queendom}
            </span>
            <p className="mt-1 truncate text-xs text-stone-600">
              {city} · {company}
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-[#E5E4DF]/80 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  active ? "bg-emerald-400" : "bg-stone-400",
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "truncate rounded-full px-2 py-0.5 text-[11px] font-medium",
                  membershipBadgeClass(client.membership_type),
                )}
              >
                {membershipLabel}
              </span>
            </div>
            <span className="shrink-0 text-[11px] text-stone-500">
              {expiryLabel !== "—" ? `Ends ${expiryLabel}` : "—"}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-[#F9F9F6] px-2 py-0.5 text-[11px] text-stone-700 ring-1 ring-[#E5E4DF]">
              {personality}
            </span>
            <span className="rounded-full bg-[#F9F9F6] px-2 py-0.5 text-[11px] text-stone-700 ring-1 ring-[#E5E4DF]">
              {diet}
            </span>
          </div>

          <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-stone-500">
            <span className="text-stone-700">{cuisines}</span>
            {" · "}
            <span className="text-stone-700">{destination}</span>
          </p>
        </div>

      </div>
    </Link>
  );
}
