"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { cn } from "@/lib/utils";
import type { ClientWithProfile } from "@/lib/actions/clients";
import type { UnmappedFilter } from "@/components/clients/ClientFilters";
import { Check, ExternalLink } from "lucide-react";

interface ClientListRowProps {
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

export function ClientListRow({
  client,
  unmappedMode = "none",
  onSave,
}: ClientListRowProps) {
  const name = displayName(client);
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
    unmappedMode === "chetto" ? "e.g. 120363…" : "e.g. +91 98…";
  const label =
    unmappedMode === "chetto" ? "Chetto group id" : "Phone number";

  const identityBlock = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
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
    </div>
  );

  if (!isEditMode) {
    return (
      <Link
        href={`/clients/${client.id}`}
        className={cn(
          "flex w-full items-center gap-3 border-b border-[#E5E4DF]/90 px-4 py-3 text-left transition-colors",
          "hover:bg-[#F9F9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F9F6]",
        )}
      >
        {identityBlock}
      </Link>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-3 border-b border-amber-100/80 bg-amber-50/30 px-4 py-3">
      {identityBlock}

      <div className="flex min-w-[280px] flex-1 items-center gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-amber-700">
            {label}
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
        <div className="mt-5 flex items-center gap-1.5">
          <IndulgeButton
            type="button"
            variant="gold"
            size="sm"
            loading={isSaving}
            disabled={draft === initialValue}
            onClick={() => void handleSave()}
            className="h-8 text-xs"
          >
            {saved ? <Check className="h-3.5 w-3.5" /> : "Save"}
          </IndulgeButton>
          <Link
            href={`/clients/${client.id}`}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E4DF] bg-white px-2 text-[11px] text-stone-500 transition-colors hover:text-stone-800"
            title="Open profile"
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
