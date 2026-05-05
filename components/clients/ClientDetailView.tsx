"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientOverviewTab } from "@/components/clients/overview/ClientOverviewTab";
import { ClientProfileFields } from "@/components/clients/profile/ClientProfileFields";
import { ClientMembershipTab } from "@/components/clients/membership/ClientMembershipTab";
import { ChettoTab } from "@/components/clients/chetto/ChettoTab";
import { FreshdeskTab } from "@/components/clients/FreshdeskTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getClientById,
  updateClientNotes,
  type ClientDetail,
} from "@/lib/actions/clients";
import { formatIST } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  MessageCircle,
  Ticket,
} from "lucide-react";
import { isAfter, parseISO } from "date-fns";
import { toast } from "sonner";

interface ClientDetailViewProps {
  initialDetail: ClientDetail;
}

function np(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "Not provided";
  return String(value);
}

function dash(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "—";
  return String(value);
}

function initials(d: ClientDetail): string {
  const f = (d.first_name ?? "").trim().charAt(0);
  const l = (d.last_name ?? "").trim().charAt(0);
  const s = `${f}${l}`.toUpperCase();
  return s || "?";
}

function membershipBadgeClass(type: string | null): string {
  const t = type ?? "";
  if (t === "Premium")
    return "border bg-[#D4AF37]/12 text-[#9A7B2E] border-[#D4AF37]/35";
  if (t === "Celebrity")
    return "border bg-[#EBE8E2] text-stone-700 border-[#D4D0C8]";
  if (t === "Standard")
    return "border bg-stone-100 text-stone-700 border-stone-200";
  if (t === "Genie")
    return "border bg-emerald-50 text-emerald-900 border-emerald-200";
  if (t === "Monthly Trial")
    return "border bg-orange-50 text-orange-900 border-orange-200";
  return "border bg-[#F4F1EA] text-stone-600 border-[#E5E4DF]";
}

export function ClientDetailView({ initialDetail }: ClientDetailViewProps) {
  const [detail, setDetail] = useState(initialDetail);
  const [activeTab, setActiveTab] = useState("overview");
  const [notesLocal, setNotesLocal] = useState(initialDetail.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    setDetail(initialDetail);
    setNotesLocal(initialDetail.notes ?? "");
    setNotesDirty(false);
    setActiveTab("overview");
  }, [initialDetail]);

  const d = detail;
  const clientId = d.id;

  async function handleNotesBlur() {
    if (!clientId || !notesDirty) return;
    const res = await updateClientNotes(clientId, notesLocal);
    if (res.success) {
      setNotesDirty(false);
      const refresh = await getClientById(clientId);
      if (refresh.success && refresh.data) setDetail(refresh.data);
    } else {
      toast.error(res.error ?? "Save failed");
    }
  }

  const membershipWindow = (() => {
    if (!d.membership_end) return "Not provided";
    const end = parseISO(`${d.membership_end}T12:00:00`);
    const active = isAfter(end, new Date());
    const label = formatIST(end, "MMMM yyyy");
    return active ? `Active until ${label}` : `Expired ${label}`;
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[#E5E4DF] bg-[#F9F9F6] px-8 py-4">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to Clients
        </Link>
      </div>

      <div className="relative border-b border-[#E5E4DF] bg-gradient-to-b from-[#F5F3EE] via-[#FAFAF8] to-[#F9F9F6] px-8 pb-8 pt-8 text-stone-900">
        <div className="mx-auto max-w-5xl">
          <div className="flex gap-4">
            <Avatar className="h-20 w-20 border-2 border-[#D4AF37]/70 bg-gradient-to-br from-[#EDEAE4] to-[#E0DDD6] shadow-sm">
              <AvatarImage src={d.avatar_url ?? undefined} alt="" />
              <AvatarFallback className="bg-transparent font-[family-name:var(--font-playfair)] text-xl text-[#9A855C]">
                {initials(d)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1
                className="font-[family-name:var(--font-playfair)] text-2xl font-semibold leading-tight text-stone-900"
                style={{ fontSize: "24px" }}
              >
                {[d.first_name, d.last_name].filter(Boolean).join(" ").trim() ||
                  "—"}
              </h1>
              <p className="mt-1 text-sm text-stone-600">
                <span className="italic text-stone-700">
                  {np(d.company_designation)}
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {d.queendom ? (
                  <Badge
                    variant="outline"
                    className="border-[#E5E4DF] bg-white/90 text-[11px] text-stone-700 shadow-sm"
                  >
                    {d.queendom}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-[#E5E4DF] bg-[#FBFAF7] text-[11px] text-stone-400"
                  >
                    —
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px]",
                    membershipBadgeClass(d.membership_type),
                  )}
                >
                  {dash(d.membership_type)}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-stone-600">
                {dash(d.primary_city)}
                {" · "}
                {np(d.personality_type)}
                {" · "}
                {np(d.marital_status)}
              </p>
              <p className="mt-2 text-sm font-medium text-[#9A7B2E]">
                {membershipWindow}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col bg-[#F9F9F6]"
      >
        <div className="shrink-0 overflow-x-auto border-b border-[#E5E4DF]/80 bg-[#F9F9F6] px-8 pt-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="w-max min-w-full justify-start bg-[#F2F2EE] sm:min-w-0 sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="freshdesk">
              <Ticket className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Service History
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-1.5">
              <MessageCircle
                className="h-3.5 w-3.5 text-emerald-500"
                aria-hidden
              />
              WhatsApp
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-5xl flex-1 flex-col px-8 pb-12 pt-4">
          <TabsContent
            value="overview"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden focus-visible:outline-none data-[state=inactive]:hidden"
          >
            <ClientOverviewTab
              clientId={clientId}
              detail={d}
              isActive={activeTab === "overview"}
            />
          </TabsContent>

          <TabsContent
            value="profile"
            className="mt-4 min-h-0 flex-1 space-y-8 overflow-y-auto focus-visible:outline-none data-[state=inactive]:hidden"
          >
            <ClientProfileFields detail={d} />
            <div className="border-t border-[#E5E4DF] pt-10">
              <p className="mb-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                Membership
              </p>
              <ClientMembershipTab detail={d} showContact={false} />
            </div>
          </TabsContent>

          <TabsContent
            value="notes"
            className="mt-4 min-h-0 flex-1 overflow-y-auto focus-visible:outline-none data-[state=inactive]:hidden"
          >
            <IndulgeField
              label="Agent notes"
              hint="Private scratchpad · saves when you click away"
            >
              <Textarea
                value={notesLocal}
                onChange={(e) => {
                  setNotesLocal(e.target.value);
                  setNotesDirty(true);
                }}
                onBlur={() => void handleNotesBlur()}
                rows={12}
                className="min-h-[240px] resize-y border-[#E5E4DF] bg-white text-sm"
                placeholder="Capture preferences, promises, and context…"
              />
            </IndulgeField>
            <p className="mt-3 text-xs italic text-stone-400">
              Last updated ·{" "}
              {d.updated_at
                ? formatIST(d.updated_at, "dd MMM yyyy, HH:mm")
                : "—"}
            </p>
          </TabsContent>

          <TabsContent
            value="freshdesk"
            className="mt-4 min-h-0 flex-1 overflow-y-auto focus-visible:outline-none data-[state=inactive]:hidden"
          >
            <FreshdeskTab
              clientId={clientId}
              clientPhone={d.phone_number}
              clientName={[d.first_name, d.last_name]
                .filter(Boolean)
                .join(" ")
                .trim()}
              isActive={activeTab === "freshdesk"}
            />
          </TabsContent>

          <TabsContent
            value="whatsapp"
            className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col focus-visible:outline-none data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#E5E4DF] bg-[#F9F9F6] shadow-sm">
              <ChettoTab
                clientPhone={d.phone_number}
                queendom={d.queendom ?? "Unassigned"}
                isActive={activeTab === "whatsapp"}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
