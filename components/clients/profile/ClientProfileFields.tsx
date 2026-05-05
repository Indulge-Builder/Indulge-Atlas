import type { ReactNode } from "react";
import { differenceInYears, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  Armchair,
  AtSign,
  Briefcase,
  Cake,
  Car,
  Droplets,
  Flame,
  Globe,
  Heart,
  HelpCircle,
  Hotel,
  Leaf,
  Mail,
  MapPin,
  Moon,
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
} from "lucide-react";
import type { ClientDetail } from "@/lib/actions/clients";
import { formatIST } from "@/lib/utils/time";
import { ExpandableText } from "./ExpandableText";
import { ProfileFieldRow } from "./ProfileFieldRow";
import { ProfilePhoneCopy } from "./ProfilePhoneCopy";
import { ProfileSection } from "./ProfileSection";

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

export interface ClientProfileFieldsProps {
  detail: ClientDetail;
}

export function ClientProfileFields({ detail: d }: ClientProfileFieldsProps) {
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
      } catch {
        together = null;
      }
    }
    weddingNode = (
      <span>
        <span className="text-[13px] text-[#1C1917]">{weddingFmt}</span>
        {together}
      </span>
    );
  }

  const personality = personalityUi(d.personality_type);
  const personalityIcon: LucideIcon =
    personality.kind === "sunset" ? Moon : Sun;

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

  return (
    <div className="pb-2">
      <ProfileSection title="Contact" icon={Phone}>
        <ProfileFieldRow
          label="Phone"
          icon={Phone}
          isEmpty={!d.phone_number?.trim()}
          value={<ProfilePhoneCopy rawPhone={d.phone_number} />}
        />
        <ProfileFieldRow
          label="Email"
          icon={Mail}
          isEmpty={!d.email?.trim()}
          value={
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
      </ProfileSection>

      <ProfileSection title="Personal" icon={User}>
        <ProfileFieldRow
          label="Date of birth"
          icon={Cake}
          isEmpty={dobEmpty}
          value={dobValue}
        />
        <ProfileFieldRow
          label="Blood group"
          icon={Droplets}
          isEmpty={!hasText(d.blood_group)}
          value={hasText(d.blood_group) ? d.blood_group : null}
        />
        <ProfileFieldRow
          label="Marital status"
          icon={Heart}
          isEmpty={!hasText(d.marital_status)}
          value={hasText(d.marital_status) ? d.marital_status : null}
        />
        <ProfileFieldRow
          label="Wedding anniversary"
          icon={Star}
          isEmpty={weddingEmpty}
          value={weddingNode}
        />
        <ProfileFieldRow
          label="Personality type"
          icon={personalityIcon}
          isEmpty={!hasText(d.personality_type)}
          value={<PersonalityValue raw={d.personality_type} />}
        />
        <ProfileFieldRow
          label="Primary city"
          icon={MapPin}
          isEmpty={!hasText(d.primary_city)}
          value={hasText(d.primary_city) ? d.primary_city : null}
        />
        <ProfileFieldRow
          label="Company designation"
          icon={Briefcase}
          isEmpty={!hasText(d.company_designation)}
          value={hasText(d.company_designation) ? d.company_designation : null}
        />
        <ProfileFieldRow
          label="Social handles"
          icon={AtSign}
          isEmpty={!socialText}
          value={
            socialText ? (
              <ExpandableText text={socialText} />
            ) : null
          }
        />
      </ProfileSection>

      <ProfileSection title="Travel" icon={Plane}>
        <ProfileFieldRow
          label="Seat preference"
          icon={Armchair}
          isEmpty={!hasText(travel?.seat_preference)}
          value={hasText(travel?.seat_preference) ? travel?.seat_preference : null}
        />
        <ProfileFieldRow
          label="Stay preferences"
          icon={Hotel}
          isEmpty={stayPrefs.length === 0}
          value={stayPrefs.length > 0 ? <ArrayPills items={stayPrefs} /> : null}
        />
        <ProfileFieldRow
          label="Go-to country"
          icon={Globe}
          isEmpty={!hasText(travel?.go_to_country)}
          value={hasText(travel?.go_to_country) ? travel?.go_to_country : null}
        />
        <ProfileFieldRow
          label="Needs assistance with"
          icon={HelpCircle}
          isEmpty={!assistanceText}
          value={assistanceText ? <ExpandableText text={assistanceText} /> : null}
        />
      </ProfileSection>

      <ProfileSection title="Lifestyle" icon={Sparkles}>
        <ProfileFieldRow
          label="Dietary preference"
          icon={Leaf}
          isEmpty={!hasText(lifestyle?.dietary_preference)}
          value={
            hasText(lifestyle?.dietary_preference)
              ? lifestyle?.dietary_preference
              : null
          }
        />
        <ProfileFieldRow
          label="Favourite cuisine"
          icon={UtensilsCrossed}
          isEmpty={cuisineList.length === 0}
          value={cuisineList.length > 0 ? <ArrayPills items={cuisineList} /> : null}
        />
        <ProfileFieldRow
          label="Favourite food"
          icon={Utensils}
          isEmpty={!hasText(lifestyle?.favourite_food)}
          value={hasText(lifestyle?.favourite_food) ? lifestyle?.favourite_food : null}
        />
        <ProfileFieldRow
          label="Favourite drink"
          icon={Wine}
          isEmpty={!hasText(lifestyle?.favourite_drink)}
          value={hasText(lifestyle?.favourite_drink) ? lifestyle?.favourite_drink : null}
        />
        <ProfileFieldRow
          label="Go-to restaurant"
          icon={MapPin}
          labelIconClassName="text-emerald-700/45"
          isEmpty={restaurantList.length === 0}
          value={
            restaurantList.length > 0 ? <ArrayPills items={restaurantList} /> : null
          }
        />
        <ProfileFieldRow
          label="Favourite brands"
          icon={ShoppingBag}
          isEmpty={brandsList.length === 0}
          value={brandsList.length > 0 ? <ArrayPills items={brandsList} /> : null}
        />
      </ProfileSection>

      <ProfileSection title="Passions" icon={Flame}>
        <ProfileFieldRow
          label="Favourite sports"
          icon={Trophy}
          isEmpty={sportsList.length === 0}
          value={sportsList.length > 0 ? <ArrayPills items={sportsList} /> : null}
        />
        <ProfileFieldRow
          label="Favourite car"
          icon={Car}
          isEmpty={!hasText(passions?.favourite_car)}
          value={hasText(passions?.favourite_car) ? passions?.favourite_car : null}
        />
        <ProfileFieldRow
          label="Favourite watch"
          icon={Watch}
          isEmpty={!hasText(passions?.favourite_watch)}
          value={hasText(passions?.favourite_watch) ? passions?.favourite_watch : null}
        />
      </ProfileSection>
    </div>
  );
}
