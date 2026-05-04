"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientOverviewTab } from "@/components/clients/overview/ClientOverviewTab";
import { FreshdeskTab } from "@/components/clients/FreshdeskTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfoRow } from "@/components/ui/info-row";
import { IndulgeField } from "@/components/ui/indulge-field";
import { Textarea } from "@/components/ui/textarea";
import { IndulgeButton } from "@/components/ui/indulge-button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getClientById,
  updateClientNotes,
  type ClientDetail,
} from "@/lib/actions/clients";
import { formatPhoneForDisplay } from "@/lib/utils/format-phone-display";
import { formatIST } from "@/lib/utils/time";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Cake,
  Heart,
  Plane,
  UtensilsCrossed,
  Trophy,
  Phone,
  Mail,
  Copy,
  Sparkles,
  CalendarRange,
  CreditCard,
  Building2,
  Hash,
  Wine,
  Car,
  Watch,
  Users,
  Globe,
  Ticket,
} from "lucide-react";
import { parseISO, isAfter } from "date-fns";
import { toast } from "sonner";

interface ClientDetailViewProps {
  initialDetail: ClientDetail;
}

function np(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "Not provided";
  return String(value);
}

function fmtDate(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "Not provided";
  try {
    return formatIST(parseISO(`${value}T12:00:00`), "d MMM yyyy");
  } catch {
    return String(value);
  }
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
  if (t === "Premium") return "border bg-[#D4AF37]/12 text-[#9A7B2E] border-[#D4AF37]/35";
  if (t === "Celebrity") return "border bg-[#EBE8E2] text-stone-700 border-[#D4D0C8]";
  if (t === "Standard") return "border bg-stone-100 text-stone-700 border-stone-200";
  if (t === "Genie") return "border bg-emerald-50 text-emerald-900 border-emerald-200";
  if (t === "Monthly Trial") return "border bg-orange-50 text-orange-900 border-orange-200";
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

  const amountLabel =
    d.membership_amount_paid != null
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        }).format(Number(d.membership_amount_paid))
      : "Not provided";

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
        <div className="shrink-0 border-b border-[#E5E4DF]/80 bg-[#F9F9F6] px-8 pt-4">
          <TabsList className="w-auto justify-start bg-[#F2F2EE]">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="membership">Membership</TabsTrigger>
            <TabsTrigger value="freshdesk">
              <Ticket className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Service History
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-8 pb-12 pt-4">
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
            <section>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                Personal
              </p>
              <div className="space-y-4 rounded-2xl border border-[#E5E4DF] bg-white p-4">
                <InfoRow icon={Cake} label="Date of birth" value={fmtDate(d.date_of_birth)} />
                <InfoRow icon={Heart} label="Blood group" value={np(d.blood_group)} />
                <InfoRow
                  icon={CalendarRange}
                  label="Wedding anniversary"
                  value={fmtDate(d.wedding_anniversary)}
                />
                <InfoRow icon={Sparkles} label="Social handles" value={np(d.social_handles)} />
              </div>
            </section>

            <section>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                Travel
              </p>
              <div className="space-y-4 rounded-2xl border border-[#E5E4DF] bg-white p-4">
                <InfoRow icon={Plane} label="Seat preference" value={np(d.travel?.seat_preference)} />
                <InfoRow
                  icon={Building2}
                  label="Stay preferences"
                  value={
                    d.travel?.stay_preferences?.length
                      ? d.travel.stay_preferences.join(", ")
                      : "Not provided"
                  }
                />
                <InfoRow icon={Globe} label="Favourite country" value={np(d.travel?.go_to_country)} />
                <InfoRow icon={Users} label="Assistance needed" value={np(d.travel?.needs_assistance_with)} />
              </div>
            </section>

            <section>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                Lifestyle
              </p>
              <div className="space-y-4 rounded-2xl border border-[#E5E4DF] bg-white p-4">
                <InfoRow icon={UtensilsCrossed} label="Diet" value={np(d.lifestyle?.dietary_preference)} />
                <InfoRow
                  icon={UtensilsCrossed}
                  label="Favourite cuisine"
                  value={
                    d.lifestyle?.favourite_cuisine?.length
                      ? d.lifestyle.favourite_cuisine.join(", ")
                      : "Not provided"
                  }
                />
                <InfoRow icon={UtensilsCrossed} label="Favourite food" value={np(d.lifestyle?.favourite_food)} />
                <InfoRow icon={Wine} label="Favourite drink" value={np(d.lifestyle?.favourite_drink)} />
                <InfoRow
                  icon={Building2}
                  label="Go-to restaurants"
                  value={
                    d.lifestyle?.go_to_restaurant?.length
                      ? d.lifestyle.go_to_restaurant.join(", ")
                      : "Not provided"
                  }
                />
                <InfoRow
                  icon={Sparkles}
                  label="Favourite brands"
                  value={
                    d.lifestyle?.favourite_brands?.length
                      ? d.lifestyle.favourite_brands.join(", ")
                      : "Not provided"
                  }
                />
              </div>
            </section>

            <section>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                Passions
              </p>
              <div className="space-y-4 rounded-2xl border border-[#E5E4DF] bg-white p-4">
                <InfoRow
                  icon={Trophy}
                  label="Favourite sports"
                  value={
                    d.passions?.favourite_sports?.length
                      ? d.passions.favourite_sports.join(", ")
                      : "Not provided"
                  }
                />
                <InfoRow icon={Car} label="Favourite car" value={np(d.passions?.favourite_car)} />
                <InfoRow icon={Watch} label="Favourite watch" value={np(d.passions?.favourite_watch)} />
              </div>
            </section>
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
              {d.updated_at ? formatIST(d.updated_at, "dd MMM yyyy, HH:mm") : "—"}
            </p>
          </TabsContent>

          <TabsContent
            value="membership"
            className="mt-4 min-h-0 flex-1 space-y-8 overflow-y-auto focus-visible:outline-none data-[state=inactive]:hidden"
          >
            <section className="rounded-2xl border border-[#E5E4DF] bg-white p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow icon={CreditCard} label="Membership type" value={np(d.membership_type)} />
                <InfoRow icon={CalendarRange} label="Plan interval" value={np(d.membership_interval)} />
                <InfoRow icon={CreditCard} label="Amount paid" value={amountLabel} />
                <InfoRow icon={Heart} label="Membership status" value={np(d.membership_status)} />
              </div>

              <div className="mt-6">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  Timeline
                </p>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-stone-400">Start</p>
                    <p className="font-mono text-sm text-stone-800">
                      {d.membership_start
                        ? formatIST(parseISO(`${d.membership_start}T12:00:00`), "MMM yyyy")
                        : "—"}
                    </p>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-[#D4AF37]/40 via-[#D4AF37] to-[#D4AF37]/40" />
                  <div className="text-center">
                    <p className="text-[10px] uppercase text-stone-400">End</p>
                    <p className="font-mono text-sm text-stone-800">
                      {d.membership_end
                        ? formatIST(parseISO(`${d.membership_end}T12:00:00`), "MMM yyyy")
                        : "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <InfoRow
                  icon={Hash}
                  label="External ID"
                  value={
                    <span className="font-mono text-xs text-stone-700">
                      {d.external_id?.trim() ? d.external_id : "Not provided"}
                    </span>
                  }
                />
              </div>

              <div className="mt-4">
                <InfoRow icon={Sparkles} label="Former queendom" value={np(d.former_queendom)} />
              </div>
            </section>

            <section className="rounded-2xl border border-[#E5E4DF] bg-white p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                Contact
              </p>
              <div className="space-y-4">
                <InfoRow
                  icon={Phone}
                  label="Phone"
                  value={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm">
                        {formatPhoneForDisplay(d.phone_number)}
                      </span>
                      <IndulgeButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        leftIcon={<Copy className="h-3.5 w-3.5" />}
                        onClick={() => {
                          void navigator.clipboard.writeText(d.phone_number);
                          toast.success("Copied phone");
                        }}
                      >
                        Copy
                      </IndulgeButton>
                    </span>
                  }
                />
                <InfoRow
                  icon={Mail}
                  label="Email"
                  value={
                    d.email ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm">{d.email}</span>
                        <IndulgeButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          leftIcon={<Copy className="h-3.5 w-3.5" />}
                          onClick={() => {
                            void navigator.clipboard.writeText(d.email ?? "");
                            toast.success("Copied email");
                          }}
                        >
                          Copy
                        </IndulgeButton>
                      </span>
                    ) : (
                      <span className="italic text-stone-400">Not provided</span>
                    )
                  }
                />
              </div>
            </section>
          </TabsContent>

          <TabsContent
            value="freshdesk"
            className="mt-4 min-h-0 flex-1 overflow-y-auto focus-visible:outline-none data-[state=inactive]:hidden"
          >
            <FreshdeskTab
              clientId={clientId}
              clientPhone={d.phone_number}
              clientName={[d.first_name, d.last_name].filter(Boolean).join(" ").trim()}
              isActive={activeTab === "freshdesk"}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
