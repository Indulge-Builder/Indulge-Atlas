"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { surfaceCardVariants } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ClientWithProfile } from "@/lib/actions/clients";
import type { UnmappedFilter } from "@/components/clients/ClientFilters";
import { formatInTimeZone } from "date-fns-tz";
import { SYSTEM_TIMEZONE } from "@/lib/utils/time";
import { Check, ExternalLink } from "lucide-react";
import { ClientIntegrationIcons } from "@/components/clients/ClientIntegrationIcons";

interface ClientCardProps {
  client: ClientWithProfile;
  unmappedMode?: UnmappedFilter;
  onSave?: (clientId: string, value: string) => Promise<void>;
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

export function ClientCard({
  client,
  unmappedMode = "none",
  onSave,
}: ClientCardProps) {
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
  const isEditMode = unmappedMode === "chetto" || unmappedMode === "freshdesk";

  const initialValue =
    unmappedMode === "chetto"
      ? (client.chetto_group_id ?? "")
      : (client.phone_number ?? "");
  const [draft, setDraft] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(client.id, draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  }

  const placeholder =
    unmappedMode === "chetto" ? "e.g. 120363…" : "9876543210, +91 98…, or +1 650…";
  const fieldLabel =
    unmappedMode === "chetto" ? "Chetto group id" : "Phone number";

  const header = (
    <div className="flex gap-3">
      <Avatar
        className={cn(
          "h-14 w-14 shrink-0 border-2 border-[#D4AF37]/70",
          "bg-gradient-to-br from-[#EDEAE4] to-[#E0DDD6]",
        )}
      >
        <AvatarImage
          src={client.avatar_url ?? undefined}
          alt=""
          className="object-cover"
        />
        <AvatarFallback className="bg-transparent font-[family-name:var(--font-playfair)] text-sm font-semibold text-[#9A855C]">
          {initials(client)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className="truncate font-[family-name:var(--font-playfair)] text-base font-semibold text-stone-900"
            style={{ fontSize: "16px" }}
          >
            {name}
          </p>
          <ClientIntegrationIcons client={client} />
        </div>
        <span className="mt-1 inline-block max-w-full truncate rounded-full bg-[#F4F1EA] px-2 py-0.5 text-[10px] font-medium text-stone-700 ring-1 ring-[#E5E4DF]/90">
          {queendom}
        </span>
        <p className="mt-1 truncate text-xs text-stone-600">
          {city} · {company}
        </p>
      </div>
    </div>
  );

  if (isEditMode) {
    return (
      <div
        className={cn(
          surfaceCardVariants({ tone: "luxury", elevation: "sm" }),
          "w-full overflow-hidden border-amber-200/60 bg-amber-50/20",
        )}
      >
        <div className="p-4">
          {header}

          <div className="mt-4 border-t border-amber-100/80 pt-3">
            <div className="flex items-center justify-between gap-2">
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
              <span className="ml-auto shrink-0 text-[11px] text-stone-500">
                {expiryLabel !== "—" ? `Ends ${expiryLabel}` : "—"}
              </span>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-amber-700">
                {fieldLabel}
              </label>
              <Input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSaved(false);
                }}
                placeholder={placeholder}
                className="h-8 border-amber-200 bg-white font-mono text-xs focus-visible:ring-amber-400/40"
                spellCheck={false}
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <IndulgeButton
                type="button"
                variant="gold"
                size="sm"
                loading={isSaving}
                disabled={draft === initialValue}
                onClick={() => void handleSave()}
                className="flex-1 text-xs"
              >
                {saved ? (
                  <span className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" /> Saved
                  </span>
                ) : (
                  "Save"
                )}
              </IndulgeButton>
              <Link
                href={`/clients/${client.id}`}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E4DF] bg-white px-2.5 text-[11px] text-stone-500 transition-colors hover:text-stone-800"
                title="Open profile"
              >
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                Profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        {header}

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
