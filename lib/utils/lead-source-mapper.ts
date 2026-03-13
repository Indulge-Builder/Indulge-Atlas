// =============================================================================
// INDULGE ATLAS — Omni-Channel Lead Source Mapper
// =============================================================================
// Translates raw database channel/UTM fields into display-ready metadata used
// by LeadSourceBadge and the leads table.  Handles 4 precise acquisition
// routes, plus a legacy fallback for older records.
// =============================================================================

export type LeadIconType =
  | "globe"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "youtube"
  | "linkedin"
  | "google"
  | "user"
  | "calendar";

export interface LeadSourceInfo {
  /** Human-readable acquisition channel, e.g. "Instagram" or "Website" */
  channel: string;
  /** Sub-platform detail. Null for organic/direct sources — badge omits the separator + platform span entirely. */
  platform: string | null;
  /** Icon key consumed by LeadSourceBadge */
  iconType: LeadIconType;
  /** utm_campaign value, or null for organic/direct traffic */
  campaign: string | null;
}

const lc = (s?: string | null): string => (s ?? "").toLowerCase().trim();

/**
 * Resolves the acquisition channel from the 4 precise intake routes used
 * by Indulge Atlas, with a legacy fallback for pre-migration records.
 *
 * @param source   — `leads.source` (or `leads.channel`): the channel identifier
 * @param utmSource — `leads.utm_source`
 * @param utmMedium — `leads.utm_medium`
 * @param utmCampaign — `leads.utm_campaign`
 */
export function formatLeadSource(
  source?: string | null,
  utmSource?: string | null,
  utmMedium?: string | null,
  utmCampaign?: string | null,
): LeadSourceInfo {
  const s  = lc(source);
  const us = lc(utmSource);
  const um = lc(utmMedium);
  const campaign = utmCampaign?.trim() || null;

  // ── Explicit organic source ──────────────────────────────────────────────
  // Leads captured from organic TV/press/website with no paid attribution.
  if (s === "organic") {
    return {
      channel:  "Website",
      platform: null,
      iconType: "globe",
      campaign: null,
    };
  }

  // ── Case 3: WhatsApp ─────────────────────────────────────────────────────
  // Ad clicks route into a WhatsApp chat; source is explicitly 'whatsapp'.
  if (s === "whatsapp") {
    return {
      channel: "WhatsApp",
      platform: "Paid Social",
      iconType: "whatsapp",
      campaign,
    };
  }

  // ── Case 4: In-App Meta Lead Form ────────────────────────────────────────
  // Lead captured directly inside a Facebook/Instagram ad via native form.
  if (s === "meta_lead_form" || s === "facebook" || s === "fb") {
    // Determine sub-platform from utm_medium (Instagram reels vs FB feed, etc.)
    const isInstagram =
      um.includes("instagram") || um.includes("reels") ||
      us === "ig"              || us === "instagram";

    return {
      channel: isInstagram ? "Instagram" : "Facebook",
      platform: "Meta Lead Ad",
      iconType: isInstagram ? "instagram" : "facebook",
      campaign,
    };
  }

  // ── Case 4-variant: Legacy 'meta' or 'meta_ads' source ───────────────────
  if (s === "meta" || s === "meta_ads" || s === "meta_lead_ads") {
    return {
      channel: "Meta Ads",
      platform: "Lead Ad",
      iconType: "facebook",
      campaign,
    };
  }

  // ── Case 2: Paid Social → Website ────────────────────────────────────────
  // Instagram ad clicks through to the website; source = 'website',
  // utm_source = 'instagram' or 'ig'.
  if (s === "website") {
    const isInstagram =
      us === "instagram" || us === "ig" ||
      um.includes("instagram") || um.includes("reels");

    const isGoogle =
      us === "google" || us === "adwords" || us === "gads";

    if (isInstagram) {
      return {
        channel: "Instagram",
        platform: "Paid Social",
        iconType: "instagram",
        campaign,
      };
    }

    if (isGoogle) {
      const isYouTube = um.includes("video") || um.includes("yt") || um.includes("youtube");
      return {
        channel: "Google Ads",
        platform: isYouTube ? "YouTube" : "Web Search",
        iconType: isYouTube ? "youtube" : "google",
        campaign,
      };
    }

    if (us === "linkedin") {
      return {
        channel: "LinkedIn",
        platform: "Sponsored",
        iconType: "linkedin",
        campaign,
      };
    }

    // ── Case 1: Organic / TV → Website ──────────────────────────────────────
    // No utm_source, or explicitly 'organic'; channel = website direct.
    return {
      channel:  "Website",
      platform: null,   // organic traffic carries no sub-platform label
      iconType: "globe",
      campaign: null,
    };
  }

  // ── Legacy: utm_source-based detection (pre-migration records) ───────────
  if (us === "ig" || us === "instagram") {
    return { channel: "Instagram", platform: "Paid Social", iconType: "instagram", campaign };
  }
  if (us === "fb" || us.includes("facebook")) {
    return { channel: "Facebook", platform: "Paid Social", iconType: "facebook", campaign };
  }
  if (us === "google" || us === "adwords" || us === "gads") {
    const isYouTube = um.includes("video") || um.includes("yt");
    return {
      channel: "Google Ads",
      platform: isYouTube ? "YouTube" : "Web Search",
      iconType: isYouTube ? "youtube" : "google",
      campaign,
    };
  }
  if (us === "linkedin") {
    return { channel: "LinkedIn", platform: "Sponsored", iconType: "linkedin", campaign };
  }

  // ── Referral / Event ────────────────────────────────────────────────────
  if (s === "referral") {
    return {
      channel: "Referral",
      platform: utmSource ?? "Internal",
      iconType: "user",
      campaign,
    };
  }
  if (s === "event") {
    return {
      channel: "Event",
      platform: utmSource ?? "Internal",
      iconType: "calendar",
      campaign,
    };
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  return {
    channel:  "Direct",
    platform: null,
    iconType: "globe",
    campaign: null,
  };
}
