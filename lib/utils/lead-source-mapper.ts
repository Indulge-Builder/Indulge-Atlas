// =============================================================================
// INDULGE ATLAS — Omni-Channel Lead Source Mapper
// =============================================================================
// Translates UTM attribution into display-ready metadata. Attribution hierarchy:
//   utm_source  — Top level: meta, google, referrals, events, website/organic
//   utm_medium  — Platform: instagram, facebook, whatsapp, youtube, search, etc.
//   utm_campaign — Ad campaign name (campaign_id)
// Relies EXCLUSIVELY on utm_source and utm_medium.
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
  /** Human-readable acquisition channel, e.g. "Meta Ads" or "Website" */
  channel: string;
  /** Sub-platform detail. Null for organic/direct — badge omits the separator. */
  platform: string | null;
  /** Icon key consumed by LeadSourceBadge */
  iconType: LeadIconType;
  /** utm_campaign value, or null for organic/direct traffic */
  campaign: string | null;
}

const lc = (s?: string | null): string => (s ?? "").toLowerCase().trim();

/**
 * Resolves the acquisition channel from utm_source and utm_medium only.
 * Does not accept source or channel — attribution is strictly UTM-based.
 *
 * @param utmSource  — leads.utm_source
 * @param utmMedium  — leads.utm_medium
 * @param utmCampaign — leads.utm_campaign (optional, for display)
 */
export function formatLeadSource(
  utmSource?: string | null,
  utmMedium?: string | null,
  utmCampaign?: string | null,
): LeadSourceInfo {
  const us = lc(utmSource);
  const um = lc(utmMedium);
  const campaign = utmCampaign?.trim() || null;

  // ── Meta: meta, meta_ads, fb, facebook, ig, instagram ─────────────────────
  if (us.includes("meta") || us.includes("fb") || us.includes("facebook") || us === "ig" || us.includes("instagram")) {
    const isInstagram =
      us === "ig" || us.includes("instagram") ||
      um.includes("instagram") || um.includes("reels");
    return {
      channel: "Meta Ads",
      platform: isInstagram ? "Instagram" : "Facebook",
      iconType: isInstagram ? "instagram" : "facebook",
      campaign,
    };
  }

  // ── Google: google, adwords, gads ────────────────────────────────────────
  if (us.includes("google") || us.includes("adwords") || us === "gads") {
    const isYouTube = um.includes("video") || um.includes("yt") || um.includes("youtube");
    return {
      channel: "Google Ads",
      platform: isYouTube ? "YouTube" : (um.includes("search") ? "Search" : "Web"),
      iconType: isYouTube ? "youtube" : "google",
      campaign,
    };
  }

  // ── Referral / Event ──────────────────────────────────────────────────────
  if (us.includes("referral")) {
    return {
      channel: "Referral",
      platform: campaign ?? "Internal",
      iconType: "user",
      campaign,
    };
  }
  if (us.includes("event")) {
    return {
      channel: "Event",
      platform: campaign ?? "Internal",
      iconType: "calendar",
      campaign,
    };
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (us.includes("whatsapp") || um.includes("whatsapp")) {
    return {
      channel: "WhatsApp",
      platform: "Paid Social",
      iconType: "whatsapp",
      campaign,
    };
  }

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  if (us.includes("linkedin")) {
    return {
      channel: "LinkedIn",
      platform: "Sponsored",
      iconType: "linkedin",
      campaign,
    };
  }

  // ── Organic / website / empty / null / "organic" ─────────────────────────
  if (!us || us === "" || us === "organic" || us.includes("website")) {
    return {
      channel: "Website",
      platform: null,
      iconType: "globe",
      campaign,
    };
  }

  // ── Fallback: unknown utm_source ─────────────────────────────────────────
  return {
    channel: "Direct",
    platform: null,
    iconType: "globe",
    campaign,
  };
}
