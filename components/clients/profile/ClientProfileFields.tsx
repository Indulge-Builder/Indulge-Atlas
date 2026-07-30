"use client";

import { useEffect, useState, type ReactNode } from "react";
import { differenceInYears, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  AtSign,
  Briefcase,
  Cake,
  Car,
  Check,
  Droplets,
  Flame,
  Globe,
  Heart,
  HelpCircle,
  Hotel,
  Leaf,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Pencil,
  Phone,
  Plane,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Trophy,
  User,
  Utensils,
  UtensilsCrossed,
  Watch,
  Wine,
  X,
} from "lucide-react";
import type { ClientDetail } from "@/lib/actions/clients";
import {
  updateClientProfile,
  updateClientPhone,
  updateClientChettoGroupId,
} from "@/lib/actions/clients";
import type { EliaProfile } from "@/lib/types/database";
import { formatIST } from "@/lib/utils/time";
import { toEditablePhone } from "@/lib/utils/phone";
import { ExpandableText } from "./ExpandableText";
import { ProfilePhoneCopy } from "./ProfilePhoneCopy";
import { ProfileSection } from "./ProfileSection";
import { EliaProfileAnalyseButton } from "./EliaProfileAnalyseButton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── helpers ─────────────────────────────────────────────────────────────────

function hasText(v: unknown): boolean {
  return v != null && String(v).trim() !== "";
}

function nonEmptyList(arr: string[] | null | undefined): string[] {
  if (!arr?.length) return [];
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

function fmtYmd(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === "") return null;
  try {
    return formatIST(parseISO(`${value.trim()}T12:00:00`), "d MMM yyyy");
  } catch {
    return String(value);
  }
}

function isMarriedStatus(status: string | null | undefined): boolean {
  if (!hasText(status)) return false;
  const s = String(status).trim().toLowerCase();
  return s === "married" || s.includes("married");
}

function personalityUi(raw: string | null): {
  kind: "sunrise" | "sunset" | "plain";
  label: string;
} {
  if (!hasText(raw)) return { kind: "plain", label: "" };
  const t = String(raw).trim();
  const lower = t.toLowerCase();
  if (lower.includes("sunrise")) return { kind: "sunrise", label: t };
  if (lower.includes("sunset")) return { kind: "sunset", label: t };
  return { kind: "plain", label: t };
}

// ── display sub-components ────────────────────────────────────────────────

function ArrayPills({ items }: { items: string[] }) {
  const clean = items.map((s) => String(s).trim()).filter(Boolean);
  if (clean.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {clean.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className="inline-flex items-center rounded-full border border-[#E5E4DF] bg-[#FAF8F5] px-2.5 py-0.5 text-[11px] font-normal text-stone-600 transition-colors hover:border-[#D4AF3740] hover:bg-[#D4AF3710] hover:text-amber-900"
        >
          {item}
        </span>
      ))}
    </span>
  );
}

function PersonalityValue({ raw }: { raw: string | null }) {
  const ui = personalityUi(raw);
  if (!hasText(raw)) return null;
  if (ui.kind === "sunrise") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-normal text-orange-700">
        <Sun className="h-3 w-3 shrink-0 text-orange-500" aria-hidden />
        {ui.label}
      </span>
    );
  }
  if (ui.kind === "sunset") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-normal text-violet-700">
        <Moon className="h-3 w-3 shrink-0 text-violet-500" aria-hidden />
        {ui.label}
      </span>
    );
  }
  return <span className="text-[13px] text-[#1C1917]">{ui.label}</span>;
}

// ── editable field row ─────────────────────────────────────────────────────

interface EditableFieldRowProps {
  label: string;
  icon: LucideIcon;
  /** display value when not editing */
  displayValue: ReactNode;
  isEmpty?: boolean;
  labelIconClassName?: string;
  /** when true, the row shows an input instead of display value */
  editing: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSave: () => Promise<void>;
  isSaving?: boolean;
  placeholder?: string;
  inputHint?: string;
}

function EditableFieldRow({
  label,
  icon: Icon,
  displayValue,
  isEmpty,
  labelIconClassName,
  editing,
  inputValue,
  onInputChange,
  onSave,
  isSaving,
  placeholder,
  inputHint,
}: EditableFieldRowProps) {
  const [localSaved, setLocalSaved] = useState(false);

  async function handleSave() {
    await onSave();
    setLocalSaved(true);
    setTimeout(() => setLocalSaved(false), 1500);
  }

  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-0 px-4 py-[11px]">
      <div className="flex items-center gap-1.5 pt-px text-[12px] font-medium text-stone-800">
        <Icon
          className={cn("h-3 w-3 shrink-0 text-stone-600", labelIconClassName)}
          aria-hidden
        />
        <span>{label}</span>
      </div>

      <div className="min-w-0">
        {editing ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <input
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSave();
                }}
                placeholder={placeholder ?? label}
                className={cn(
                  "h-7 w-full rounded-md border border-[#E5E4DF] bg-white px-2.5 text-[13px] text-stone-800 outline-none transition-colors",
                  "focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20",
                )}
              />
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                title="Save"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : localSaved ? (
                  <Check className="h-3 w-3 text-emerald-600" aria-hidden />
                ) : (
                  <Check className="h-3 w-3" aria-hidden />
                )}
              </button>
            </div>
            {inputHint && (
              <span className="text-[10px] leading-snug text-stone-400">
                {inputHint}
              </span>
            )}
          </div>
        ) : (
          <div className="text-[13px] font-normal leading-[1.5] text-[#1C1917]">
            {isEmpty ? (
              <span className="text-[12px] font-normal italic leading-normal text-[#C4BEB8]">
                Not provided
              </span>
            ) : (
              displayValue
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── editable section header (with pencil toggle) ──────────────────────────

function EditableSectionHeader({
  title,
  icon: SectionIcon,
  editing,
  onToggle,
  onCancel,
  canEdit = true,
}: {
  title: string;
  icon: LucideIcon;
  editing: boolean;
  onToggle: () => void;
  onCancel: () => void;
  /** When false, the Edit toggle is hidden (user cannot save this client). */
  canEdit?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-[#E5E4DF] bg-[#F5F3EE] px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <SectionIcon className="h-3.5 w-3.5 shrink-0 text-brand-gold" aria-hidden />
        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-600">
          {title}
        </span>
        {editing && (
          <span className="rounded-full bg-brand-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-gold">
            Editing
          </span>
        )}
      </div>
      {editing ? (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-[10px] font-medium text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700"
          title="Cancel editing"
        >
          <X className="h-3 w-3" aria-hidden />
          Cancel
        </button>
      ) : canEdit ? (
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 rounded-md border border-[#E5E4DF] bg-white px-2 py-1 text-[10px] font-medium text-stone-500 transition-colors hover:border-brand-gold/40 hover:text-stone-800"
          title={`Edit ${title}`}
        >
          <Pencil className="h-3 w-3" aria-hidden />
          Edit
        </button>
      ) : null}
    </div>
  );
}

// ── props ─────────────────────────────────────────────────────────────────

export interface ClientProfileFieldsProps {
  detail: ClientDetail;
  /** When false, per-section Edit toggles are hidden (user cannot save this client). */
  canEdit?: boolean;
  eliaProfile?: EliaProfile | null;
  eliaAnalyzedAt?: string | null;
  eliaVersion?: number;
  eliaProfileLoading?: boolean;
  onEliaAnalysisSuccess?: () => void | Promise<void>;
  onProfileUpdated?: () => void | Promise<void>;
}

// ── main component ─────────────────────────────────────────────────────────

export function ClientProfileFields({
  detail: d,
  canEdit = true,
  eliaProfile,
  eliaAnalyzedAt,
  eliaVersion = 0,
  eliaProfileLoading = false,
  onEliaAnalysisSuccess,
  onProfileUpdated,
}: ClientProfileFieldsProps) {
  const clientId = d.id;

  // ── per-section edit mode ─────────────────────────────────────────────
  const [editingSection, setEditingSection] = useState<
    "contact" | "personal" | "travel" | "lifestyle" | "passions" | null
  >(null);

  // ── draft state for every editable field ──────────────────────────────
  const [drafts, setDrafts] = useState({
    phone: toEditablePhone(d.phone_number),
    email: d.email ?? "",
    chetto_group_id: d.chetto_group_id ?? "",
    date_of_birth: d.date_of_birth ?? "",
    blood_group: d.blood_group ?? "",
    marital_status: d.marital_status ?? "",
    wedding_anniversary: d.wedding_anniversary ?? "",
    personality_type: d.personality_type ?? "",
    primary_city: d.primary_city ?? "",
    company_designation: d.company_designation ?? "",
    social_handles: d.social_handles ?? "",
    seat_preference: d.travel?.seat_preference ?? "",
    stay_preferences: nonEmptyList(d.travel?.stay_preferences).join(", "),
    go_to_country: d.travel?.go_to_country ?? "",
    needs_assistance_with: d.travel?.needs_assistance_with ?? "",
    dietary_preference: d.lifestyle?.dietary_preference ?? "",
    favourite_cuisine: nonEmptyList(d.lifestyle?.favourite_cuisine).join(", "),
    favourite_food: d.lifestyle?.favourite_food ?? "",
    favourite_drink: d.lifestyle?.favourite_drink ?? "",
    go_to_restaurant: nonEmptyList(d.lifestyle?.go_to_restaurant).join(", "),
    favourite_brands: nonEmptyList(d.lifestyle?.favourite_brands).join(", "),
    favourite_sports: nonEmptyList(d.passions?.favourite_sports).join(", "),
    favourite_car: d.passions?.favourite_car ?? "",
    favourite_watch: d.passions?.favourite_watch ?? "",
  });

  const [savingField, setSavingField] = useState<string | null>(null);

  // Re-sync drafts whenever the detail prop changes (after a successful save
  // triggers onProfileUpdated → getClientById → setDetail in parent).
  // We only do this when NOT currently editing, so in-progress edits aren't clobbered.
  useEffect(() => {
    if (editingSection !== null) return;
    setDrafts({
      phone: toEditablePhone(d.phone_number),
      email: d.email ?? "",
      chetto_group_id: d.chetto_group_id ?? "",
      date_of_birth: d.date_of_birth ?? "",
      blood_group: d.blood_group ?? "",
      marital_status: d.marital_status ?? "",
      wedding_anniversary: d.wedding_anniversary ?? "",
      personality_type: d.personality_type ?? "",
      primary_city: d.primary_city ?? "",
      company_designation: d.company_designation ?? "",
      social_handles: d.social_handles ?? "",
      seat_preference: d.travel?.seat_preference ?? "",
      stay_preferences: nonEmptyList(d.travel?.stay_preferences).join(", "),
      go_to_country: d.travel?.go_to_country ?? "",
      needs_assistance_with: d.travel?.needs_assistance_with ?? "",
      dietary_preference: d.lifestyle?.dietary_preference ?? "",
      favourite_cuisine: nonEmptyList(d.lifestyle?.favourite_cuisine).join(", "),
      favourite_food: d.lifestyle?.favourite_food ?? "",
      favourite_drink: d.lifestyle?.favourite_drink ?? "",
      go_to_restaurant: nonEmptyList(d.lifestyle?.go_to_restaurant).join(", "),
      favourite_brands: nonEmptyList(d.lifestyle?.favourite_brands).join(", "),
      favourite_sports: nonEmptyList(d.passions?.favourite_sports).join(", "),
      favourite_car: d.passions?.favourite_car ?? "",
      favourite_watch: d.passions?.favourite_watch ?? "",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  function setDraft(key: keyof typeof drafts, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }

  function cancelEditing() {
    // Reset drafts to current detail values
    setDrafts({
      phone: toEditablePhone(d.phone_number),
      email: d.email ?? "",
      chetto_group_id: d.chetto_group_id ?? "",
      date_of_birth: d.date_of_birth ?? "",
      blood_group: d.blood_group ?? "",
      marital_status: d.marital_status ?? "",
      wedding_anniversary: d.wedding_anniversary ?? "",
      personality_type: d.personality_type ?? "",
      primary_city: d.primary_city ?? "",
      company_designation: d.company_designation ?? "",
      social_handles: d.social_handles ?? "",
      seat_preference: d.travel?.seat_preference ?? "",
      stay_preferences: nonEmptyList(d.travel?.stay_preferences).join(", "),
      go_to_country: d.travel?.go_to_country ?? "",
      needs_assistance_with: d.travel?.needs_assistance_with ?? "",
      dietary_preference: d.lifestyle?.dietary_preference ?? "",
      favourite_cuisine: nonEmptyList(d.lifestyle?.favourite_cuisine).join(", "),
      favourite_food: d.lifestyle?.favourite_food ?? "",
      favourite_drink: d.lifestyle?.favourite_drink ?? "",
      go_to_restaurant: nonEmptyList(d.lifestyle?.go_to_restaurant).join(", "),
      favourite_brands: nonEmptyList(d.lifestyle?.favourite_brands).join(", "),
      favourite_sports: nonEmptyList(d.passions?.favourite_sports).join(", "),
      favourite_car: d.passions?.favourite_car ?? "",
      favourite_watch: d.passions?.favourite_watch ?? "",
    });
    setEditingSection(null);
  }

  // ── save helpers ──────────────────────────────────────────────────────

  async function savePhone() {
    setSavingField("phone");
    try {
      const res = await updateClientPhone(clientId, drafts.phone.trim());
      if (!res.success) { toast.error(res.error ?? "Failed to save"); return; }
      toast.success("Phone saved");
      setEditingSection(null);   // exit edit mode so useEffect can re-sync drafts
      await onProfileUpdated?.();
    } finally { setSavingField(null); }
  }

  async function saveChettoGroupId() {
    setSavingField("chetto_group_id");
    try {
      const res = await updateClientChettoGroupId(
        clientId,
        drafts.chetto_group_id.trim() || null,
      );
      if (!res.success) { toast.error(res.error ?? "Failed to save"); return; }
      toast.success("Chetto group id saved");
      setEditingSection(null);   // exit edit mode so useEffect can re-sync drafts
      await onProfileUpdated?.();
    } finally { setSavingField(null); }
  }

  async function saveProfileField(
    field: string,
    payload: Parameters<typeof updateClientProfile>[1],
  ) {
    setSavingField(field);
    try {
      const res = await updateClientProfile(clientId, payload);
      if (!res.success) { toast.error(res.error ?? "Failed to save"); return; }
      toast.success("Saved");
      setEditingSection(null);   // exit edit mode so useEffect can re-sync drafts
      await onProfileUpdated?.();
    } finally { setSavingField(null); }
  }

  // ── comma-separated → array helper ───────────────────────────────────
  function toArray(csv: string): string[] {
    return csv.split(",").map((s) => s.trim()).filter(Boolean);
  }

  // ── display values ────────────────────────────────────────────────────
  const dobFmt = fmtYmd(d.date_of_birth);
  let dobValue: ReactNode = null;
  let dobEmpty = true;
  if (d.date_of_birth?.trim() && dobFmt) {
    dobEmpty = false;
    try {
      const dob = parseISO(`${d.date_of_birth.trim()}T12:00:00`);
      const age = differenceInYears(new Date(), dob);
      dobValue = (
        <span>
          <span className="text-[13px] text-[#1C1917]">{dobFmt}</span>
          <span className="ml-1.5 text-[11px] font-normal text-stone-400">
            ({age} yrs)
          </span>
        </span>
      );
    } catch {
      dobValue = <span className="text-[13px] text-[#1C1917]">{dobFmt}</span>;
      dobEmpty = false;
    }
  }

  const weddingFmt = fmtYmd(d.wedding_anniversary);
  let weddingNode: ReactNode = null;
  let weddingEmpty = true;
  if (d.wedding_anniversary?.trim() && weddingFmt) {
    weddingEmpty = false;
    const married = isMarriedStatus(d.marital_status);
    let together: ReactNode = null;
    if (married) {
      try {
        const ann = parseISO(`${d.wedding_anniversary.trim()}T12:00:00`);
        const yrs = differenceInYears(new Date(), ann);
        together = (
          <span className="ml-1.5 text-[11px] font-normal text-stone-400">
            ({yrs} {yrs === 1 ? "year" : "years"} together)
          </span>
        );
      } catch { together = null; }
    }
    weddingNode = (
      <span>
        <span className="text-[13px] text-[#1C1917]">{weddingFmt}</span>
        {together}
      </span>
    );
  }

  const personality = personalityUi(d.personality_type);
  const personalityIcon: LucideIcon = personality.kind === "sunset" ? Moon : Sun;
  const travel = d.travel;
  const lifestyle = d.lifestyle;
  const passions = d.passions;
  const socialText = d.social_handles?.trim() ?? "";
  const assistanceText = travel?.needs_assistance_with?.trim() ?? "";
  const stayPrefs = nonEmptyList(travel?.stay_preferences);
  const cuisineList = nonEmptyList(lifestyle?.favourite_cuisine);
  const restaurantList = nonEmptyList(lifestyle?.go_to_restaurant);
  const brandsList = nonEmptyList(lifestyle?.favourite_brands);
  const sportsList = nonEmptyList(passions?.favourite_sports);

  const isEditing = (s: typeof editingSection) => editingSection === s;

  // ── render ─────────────────────────────────────────────────────────────

  return (
    <div className="pb-2">
      {/* ── Contact ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <EditableSectionHeader
          title="Contact"
          icon={Phone}
          editing={isEditing("contact")}
          onToggle={() => setEditingSection("contact")}
          onCancel={cancelEditing}
          canEdit={canEdit}
        />
        <div className="divide-y divide-[#F5F3EF] rounded-b-lg border border-t-0 border-[#E5E4DF] bg-white">
          <EditableFieldRow
            label="Phone"
            icon={Phone}
            editing={isEditing("contact")}
            inputValue={drafts.phone}
            onInputChange={(v) => setDraft("phone", v)}
            onSave={savePhone}
            isSaving={savingField === "phone"}
            placeholder="9876543210, +91 98…, or +1 650…"
            inputHint="Indian numbers: 10 digits without +91 is fine. For other countries use +1, +44, etc."
            isEmpty={!d.phone_number?.trim()}
            displayValue={<ProfilePhoneCopy rawPhone={d.phone_number} />}
          />
          <EditableFieldRow
            label="Chetto WhatsApp group"
            icon={MessageCircle}
            editing={isEditing("contact")}
            inputValue={drafts.chetto_group_id}
            onInputChange={(v) => setDraft("chetto_group_id", v)}
            onSave={saveChettoGroupId}
            isSaving={savingField === "chetto_group_id"}
            placeholder="e.g. 120363… or search by group name in Chetto mapping"
            inputHint="Joule group_id from app.chetto.ai, or set via Chetto mapping (name search). Powers the WhatsApp tab and Elia analysis."
            isEmpty={!d.chetto_group_id?.trim()}
            displayValue={
              d.chetto_group_id?.trim() ? (
                <span className="flex flex-col gap-0.5">
                  {d.chetto_group_name?.trim() ? (
                    <span className="text-[13px] font-medium text-[#1C1917]">
                      {d.chetto_group_name.trim()}
                    </span>
                  ) : null}
                  <span className="break-all font-mono text-[11px] text-stone-500">
                    {d.chetto_group_id.trim()}
                  </span>
                </span>
              ) : null
            }
          />
          <EditableFieldRow
            label="Email"
            icon={Mail}
            editing={isEditing("contact")}
            inputValue={drafts.email}
            onInputChange={(v) => setDraft("email", v)}
            onSave={async () => {
              // email lives on clients.email — not client_profiles
              // updateClientEmail is not yet wired; show a note for now
              toast("Email updates coming soon — edit via the unmapped page or DB directly");
            }}
            isSaving={savingField === "email"}
            placeholder="name@domain.com"
            isEmpty={!d.email?.trim()}
            displayValue={
              d.email?.trim() ? (
                <a
                  href={`mailto:${d.email.trim()}`}
                  className="break-all text-[13px] font-normal text-[#D4AF37] hover:underline"
                >
                  {d.email.trim()}
                </a>
              ) : null
            }
          />
        </div>
      </div>

      {/* ── Personal ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <EditableSectionHeader
          title="Personal"
          icon={User}
          editing={isEditing("personal")}
          onToggle={() => setEditingSection("personal")}
          onCancel={cancelEditing}
          canEdit={canEdit}
        />
        <div className="divide-y divide-[#F5F3EF] rounded-b-lg border border-t-0 border-[#E5E4DF] bg-white">
          <EditableFieldRow
            label="Date of birth"
            icon={Cake}
            editing={isEditing("personal")}
            inputValue={drafts.date_of_birth}
            onInputChange={(v) => setDraft("date_of_birth", v)}
            onSave={() => saveProfileField("date_of_birth", { date_of_birth: drafts.date_of_birth || null })}
            isSaving={savingField === "date_of_birth"}
            placeholder="YYYY-MM-DD"
            inputHint="YYYY-MM-DD"
            isEmpty={dobEmpty}
            displayValue={dobValue}
          />
          <EditableFieldRow
            label="Blood group"
            icon={Droplets}
            editing={isEditing("personal")}
            inputValue={drafts.blood_group}
            onInputChange={(v) => setDraft("blood_group", v)}
            onSave={() => saveProfileField("blood_group", { blood_group: drafts.blood_group || null })}
            isSaving={savingField === "blood_group"}
            placeholder="e.g. O+"
            isEmpty={!hasText(d.blood_group)}
            displayValue={hasText(d.blood_group) ? d.blood_group : null}
          />
          <EditableFieldRow
            label="Marital status"
            icon={Heart}
            editing={isEditing("personal")}
            inputValue={drafts.marital_status}
            onInputChange={(v) => setDraft("marital_status", v)}
            onSave={() => saveProfileField("marital_status", { marital_status: drafts.marital_status || null })}
            isSaving={savingField === "marital_status"}
            placeholder="Married / Single…"
            isEmpty={!hasText(d.marital_status)}
            displayValue={hasText(d.marital_status) ? d.marital_status : null}
          />
          <EditableFieldRow
            label="Anniversary"
            icon={Star}
            editing={isEditing("personal")}
            inputValue={drafts.wedding_anniversary}
            onInputChange={(v) => setDraft("wedding_anniversary", v)}
            onSave={() => saveProfileField("wedding_anniversary", { wedding_anniversary: drafts.wedding_anniversary || null })}
            isSaving={savingField === "wedding_anniversary"}
            placeholder="YYYY-MM-DD"
            inputHint="YYYY-MM-DD"
            isEmpty={weddingEmpty}
            displayValue={weddingNode}
          />
          <EditableFieldRow
            label="Personality"
            icon={personalityIcon}
            editing={isEditing("personal")}
            inputValue={drafts.personality_type}
            onInputChange={(v) => setDraft("personality_type", v)}
            onSave={() => saveProfileField("personality_type", { personality_type: drafts.personality_type || null })}
            isSaving={savingField === "personality_type"}
            placeholder="Sunrise / Sunset"
            isEmpty={!hasText(d.personality_type)}
            displayValue={<PersonalityValue raw={d.personality_type} />}
          />
          <EditableFieldRow
            label="Primary city"
            icon={MapPin}
            editing={isEditing("personal")}
            inputValue={drafts.primary_city}
            onInputChange={(v) => setDraft("primary_city", v)}
            onSave={() => saveProfileField("primary_city", { primary_city: drafts.primary_city || null })}
            isSaving={savingField === "primary_city"}
            placeholder="Mumbai, Delhi…"
            isEmpty={!hasText(d.primary_city)}
            displayValue={hasText(d.primary_city) ? d.primary_city : null}
          />
          <EditableFieldRow
            label="Company"
            icon={Briefcase}
            editing={isEditing("personal")}
            inputValue={drafts.company_designation}
            onInputChange={(v) => setDraft("company_designation", v)}
            onSave={() => saveProfileField("company_designation", { company_designation: drafts.company_designation || null })}
            isSaving={savingField === "company_designation"}
            isEmpty={!hasText(d.company_designation)}
            displayValue={hasText(d.company_designation) ? d.company_designation : null}
          />
          <EditableFieldRow
            label="Social handles"
            icon={AtSign}
            editing={isEditing("personal")}
            inputValue={drafts.social_handles}
            onInputChange={(v) => setDraft("social_handles", v)}
            onSave={() => saveProfileField("social_handles", { social_handles: drafts.social_handles || null })}
            isSaving={savingField === "social_handles"}
            placeholder="@handle or URL"
            isEmpty={!socialText}
            displayValue={socialText ? <ExpandableText text={socialText} /> : null}
          />
        </div>
      </div>

      {/* ── Elia Intelligence ───────────────────────────────────────── */}
      <ProfileSection title="Elia Summary from WhatsApp chats" icon={Sparkles}>
        <div className="px-4 py-3">
          <EliaProfileAnalyseButton
            clientId={d.id}
            eliaAnalyzedAt={eliaAnalyzedAt ?? null}
            eliaVersion={eliaVersion}
            hasProfile={!!eliaProfile}
            onAnalysisSuccess={onEliaAnalysisSuccess}
          />
        </div>

        {eliaProfileLoading && !eliaProfile ? (
          <div className="flex items-center gap-2 border-t border-[#F5F3EF] px-4 py-4 text-sm text-stone-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading Elia intelligence…
          </div>
        ) : null}

        {eliaProfile && (
          <>
            {eliaProfile.summary && (
              <div className="border-t border-[#F5F3EF] px-4 py-3">
                <p className="text-[13px] leading-relaxed text-[#1C1917]">
                  {eliaProfile.summary}
                </p>
              </div>
            )}

            {(eliaProfile.identity?.sentiment ||
              eliaProfile.identity?.relationship_strength) && (
              <div className="flex flex-wrap items-center gap-3 border-t border-[#F5F3EF] px-4 py-3">
                {eliaProfile.identity.sentiment && (
                  <span
                    className={
                      eliaProfile.identity.sentiment === "positive"
                        ? "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700"
                        : eliaProfile.identity.sentiment === "needs_attention"
                          ? "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700"
                          : "inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] font-medium text-stone-600"
                    }
                  >
                    {eliaProfile.identity.sentiment === "positive"
                      ? "Positive"
                      : eliaProfile.identity.sentiment === "needs_attention"
                        ? "Needs attention"
                        : "Neutral"}
                  </span>
                )}
                {eliaProfile.identity.relationship_strength && (
                  <span className="text-[12px] text-stone-500">
                    Relationship:{" "}
                    <span className="font-medium capitalize text-stone-700">
                      {eliaProfile.identity.relationship_strength.replace(/_/g, " ")}
                    </span>
                  </span>
                )}
              </div>
            )}

            {(eliaProfile.travel?.preferred_operators?.length > 0 ||
              eliaProfile.travel?.preferred_cabin ||
              eliaProfile.travel?.usual_group_size) && (
              <div className="border-t border-[#F5F3EF] px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Travel Preferences
                </p>
                <div className="flex flex-col gap-1.5">
                  {eliaProfile.travel.preferred_operators?.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="min-w-[90px] text-[11px] text-stone-400">Operators</span>
                      <ArrayPills items={eliaProfile.travel.preferred_operators} />
                    </div>
                  )}
                  {eliaProfile.travel.preferred_cabin && (
                    <div className="flex items-start gap-2">
                      <span className="min-w-[90px] text-[11px] text-stone-400">Cabin</span>
                      <span className="text-[12px] capitalize text-stone-700">{eliaProfile.travel.preferred_cabin}</span>
                    </div>
                  )}
                  {eliaProfile.travel.usual_group_size && (
                    <div className="flex items-start gap-2">
                      <span className="min-w-[90px] text-[11px] text-stone-400">Group size</span>
                      <span className="text-[12px] capitalize text-stone-700">{eliaProfile.travel.usual_group_size}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {eliaProfile.requests?.recent?.length > 0 && (
              <div className="border-t border-[#F5F3EF] px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Recent Requests
                </p>
                <div className="flex flex-col gap-2">
                  {[...eliaProfile.requests.recent]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 3)
                    .map((req, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 w-[26px] shrink-0 text-[13px] leading-none">
                          {req.status === "completed" ? "✓" : req.status === "cancelled" ? "✕" : "⧗"}
                        </span>
                        <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-stone-700">
                          {req.description}
                          <span className="ml-1.5 text-[11px] text-stone-400">({req.date})</span>
                        </span>
                        <span className={req.status === "completed" ? "ml-auto shrink-0 text-[10px] text-emerald-600" : req.status === "cancelled" ? "ml-auto shrink-0 text-[10px] text-stone-400" : "ml-auto shrink-0 text-[10px] text-amber-600"}>
                          {req.status}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </ProfileSection>

      {/* ── Travel ──────────────────────────────────────────────────── */}
      <div className="mb-6">
        <EditableSectionHeader
          title="Travel"
          icon={Plane}
          editing={isEditing("travel")}
          onToggle={() => setEditingSection("travel")}
          onCancel={cancelEditing}
          canEdit={canEdit}
        />
        <div className="divide-y divide-[#F5F3EF] rounded-b-lg border border-t-0 border-[#E5E4DF] bg-white">
          <EditableFieldRow
            label="Seat preference"
            icon={Armchair}
            editing={isEditing("travel")}
            inputValue={drafts.seat_preference}
            onInputChange={(v) => setDraft("seat_preference", v)}
            onSave={() => saveProfileField("seat_preference", { travel: { seat_preference: drafts.seat_preference || undefined } })}
            isSaving={savingField === "seat_preference"}
            placeholder="Window / Aisle…"
            isEmpty={!hasText(travel?.seat_preference)}
            displayValue={hasText(travel?.seat_preference) ? travel?.seat_preference : null}
          />
          <EditableFieldRow
            label="Stay preferences"
            icon={Hotel}
            editing={isEditing("travel")}
            inputValue={drafts.stay_preferences}
            onInputChange={(v) => setDraft("stay_preferences", v)}
            onSave={() => saveProfileField("stay_preferences", { travel: { stay_preferences: toArray(drafts.stay_preferences) } })}
            isSaving={savingField === "stay_preferences"}
            placeholder="Resort, Villa… (comma separated)"
            inputHint="comma separated"
            isEmpty={stayPrefs.length === 0}
            displayValue={stayPrefs.length > 0 ? <ArrayPills items={stayPrefs} /> : null}
          />
          <EditableFieldRow
            label="Go-to country"
            icon={Globe}
            editing={isEditing("travel")}
            inputValue={drafts.go_to_country}
            onInputChange={(v) => setDraft("go_to_country", v)}
            onSave={() => saveProfileField("go_to_country", { travel: { go_to_country: drafts.go_to_country || undefined } })}
            isSaving={savingField === "go_to_country"}
            isEmpty={!hasText(travel?.go_to_country)}
            displayValue={hasText(travel?.go_to_country) ? travel?.go_to_country : null}
          />
          <EditableFieldRow
            label="Needs assistance"
            icon={HelpCircle}
            editing={isEditing("travel")}
            inputValue={drafts.needs_assistance_with}
            onInputChange={(v) => setDraft("needs_assistance_with", v)}
            onSave={() => saveProfileField("needs_assistance_with", { travel: { needs_assistance_with: drafts.needs_assistance_with || undefined } })}
            isSaving={savingField === "needs_assistance_with"}
            isEmpty={!assistanceText}
            displayValue={assistanceText ? <ExpandableText text={assistanceText} /> : null}
          />
        </div>
      </div>

      {/* ── Lifestyle ───────────────────────────────────────────────── */}
      <div className="mb-6">
        <EditableSectionHeader
          title="Lifestyle"
          icon={Sparkles}
          editing={isEditing("lifestyle")}
          onToggle={() => setEditingSection("lifestyle")}
          onCancel={cancelEditing}
          canEdit={canEdit}
        />
        <div className="divide-y divide-[#F5F3EF] rounded-b-lg border border-t-0 border-[#E5E4DF] bg-white">
          <EditableFieldRow
            label="Dietary"
            icon={Leaf}
            editing={isEditing("lifestyle")}
            inputValue={drafts.dietary_preference}
            onInputChange={(v) => setDraft("dietary_preference", v)}
            onSave={() => saveProfileField("dietary_preference", { lifestyle: { dietary_preference: drafts.dietary_preference || undefined } })}
            isSaving={savingField === "dietary_preference"}
            placeholder="Veg / Non-veg…"
            isEmpty={!hasText(lifestyle?.dietary_preference)}
            displayValue={hasText(lifestyle?.dietary_preference) ? lifestyle?.dietary_preference : null}
          />
          <EditableFieldRow
            label="Favourite cuisine"
            icon={UtensilsCrossed}
            editing={isEditing("lifestyle")}
            inputValue={drafts.favourite_cuisine}
            onInputChange={(v) => setDraft("favourite_cuisine", v)}
            onSave={() => saveProfileField("favourite_cuisine", { lifestyle: { favourite_cuisine: toArray(drafts.favourite_cuisine) } })}
            isSaving={savingField === "favourite_cuisine"}
            placeholder="Indian, Japanese… (comma separated)"
            inputHint="comma separated"
            isEmpty={cuisineList.length === 0}
            displayValue={cuisineList.length > 0 ? <ArrayPills items={cuisineList} /> : null}
          />
          <EditableFieldRow
            label="Favourite food"
            icon={Utensils}
            editing={isEditing("lifestyle")}
            inputValue={drafts.favourite_food}
            onInputChange={(v) => setDraft("favourite_food", v)}
            onSave={() => saveProfileField("favourite_food", { lifestyle: { favourite_food: drafts.favourite_food || undefined } })}
            isSaving={savingField === "favourite_food"}
            isEmpty={!hasText(lifestyle?.favourite_food)}
            displayValue={hasText(lifestyle?.favourite_food) ? lifestyle?.favourite_food : null}
          />
          <EditableFieldRow
            label="Favourite drink"
            icon={Wine}
            editing={isEditing("lifestyle")}
            inputValue={drafts.favourite_drink}
            onInputChange={(v) => setDraft("favourite_drink", v)}
            onSave={() => saveProfileField("favourite_drink", { lifestyle: { favourite_drink: drafts.favourite_drink || undefined } })}
            isSaving={savingField === "favourite_drink"}
            isEmpty={!hasText(lifestyle?.favourite_drink)}
            displayValue={hasText(lifestyle?.favourite_drink) ? lifestyle?.favourite_drink : null}
          />
          <EditableFieldRow
            label="Go-to restaurant"
            icon={MapPin}
            labelIconClassName="text-emerald-700/45"
            editing={isEditing("lifestyle")}
            inputValue={drafts.go_to_restaurant}
            onInputChange={(v) => setDraft("go_to_restaurant", v)}
            onSave={() => saveProfileField("go_to_restaurant", { lifestyle: { go_to_restaurant: toArray(drafts.go_to_restaurant) } })}
            isSaving={savingField === "go_to_restaurant"}
            placeholder="Nusr-Et, Nobu… (comma separated)"
            inputHint="comma separated"
            isEmpty={restaurantList.length === 0}
            displayValue={restaurantList.length > 0 ? <ArrayPills items={restaurantList} /> : null}
          />
          <EditableFieldRow
            label="Favourite brands"
            icon={ShoppingBag}
            editing={isEditing("lifestyle")}
            inputValue={drafts.favourite_brands}
            onInputChange={(v) => setDraft("favourite_brands", v)}
            onSave={() => saveProfileField("favourite_brands", { lifestyle: { favourite_brands: toArray(drafts.favourite_brands) } })}
            isSaving={savingField === "favourite_brands"}
            placeholder="LV, Rolex… (comma separated)"
            inputHint="comma separated"
            isEmpty={brandsList.length === 0}
            displayValue={brandsList.length > 0 ? <ArrayPills items={brandsList} /> : null}
          />
        </div>
      </div>

      {/* ── Passions ─────────────────────────────────────────────────── */}
      <div className="mb-6">
        <EditableSectionHeader
          title="Passions"
          icon={Flame}
          editing={isEditing("passions")}
          onToggle={() => setEditingSection("passions")}
          onCancel={cancelEditing}
          canEdit={canEdit}
        />
        <div className="divide-y divide-[#F5F3EF] rounded-b-lg border border-t-0 border-[#E5E4DF] bg-white">
          <EditableFieldRow
            label="Favourite sports"
            icon={Trophy}
            editing={isEditing("passions")}
            inputValue={drafts.favourite_sports}
            onInputChange={(v) => setDraft("favourite_sports", v)}
            onSave={() => saveProfileField("favourite_sports", { passions: { favourite_sports: toArray(drafts.favourite_sports) } })}
            isSaving={savingField === "favourite_sports"}
            placeholder="Tennis, Golf… (comma separated)"
            inputHint="comma separated"
            isEmpty={sportsList.length === 0}
            displayValue={sportsList.length > 0 ? <ArrayPills items={sportsList} /> : null}
          />
          <EditableFieldRow
            label="Favourite car"
            icon={Car}
            editing={isEditing("passions")}
            inputValue={drafts.favourite_car}
            onInputChange={(v) => setDraft("favourite_car", v)}
            onSave={() => saveProfileField("favourite_car", { passions: { favourite_car: drafts.favourite_car || undefined } })}
            isSaving={savingField === "favourite_car"}
            placeholder="Ferrari, G-Wagon…"
            isEmpty={!hasText(passions?.favourite_car)}
            displayValue={hasText(passions?.favourite_car) ? passions?.favourite_car : null}
          />
          <EditableFieldRow
            label="Favourite watch"
            icon={Watch}
            editing={isEditing("passions")}
            inputValue={drafts.favourite_watch}
            onInputChange={(v) => setDraft("favourite_watch", v)}
            onSave={() => saveProfileField("favourite_watch", { passions: { favourite_watch: drafts.favourite_watch || undefined } })}
            isSaving={savingField === "favourite_watch"}
            placeholder="Patek, AP…"
            isEmpty={!hasText(passions?.favourite_watch)}
            displayValue={hasText(passions?.favourite_watch) ? passions?.favourite_watch : null}
          />
        </div>
      </div>
    </div>
  );
}
