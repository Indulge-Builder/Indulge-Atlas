"use client";

// =============================================================================
// INDULGE ATLAS — Marketing Intake & Profiling Card
// =============================================================================
// Pillowy glass card displaying Facebook Lead Ad attribution (campaign_name,
// ad_name, platform) and dynamic form_data responses. Light Quiet Luxury.
// =============================================================================

import { Target } from "lucide-react";

/** Format raw JSON key to human-readable Q&A label. Light Quiet Luxury formatter. */
const formatKey = (key: string): string =>
  key
    .replace(/_/g, " ")
    .replace(/\?/g, "")
    .replace(/\b\w/g, (l) => l.toUpperCase()) + "?";

function formatFormValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    try {
      const str = JSON.stringify(value, null, 0);
      return str.length > 120 ? str.slice(0, 120) + "…" : str;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Standard tracking keys to filter out if they bled into form_data */
const TRACKING_KEYS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "campaign_id",
]);

interface MarketingIntakeCardProps {
  campaignName?: string | null;
  adName?: string | null;
  platform?: string | null;
  formData?: Record<string, unknown> | null;
}

export function MarketingIntakeCard({
  campaignName,
  adName,
  platform,
  formData,
}: MarketingIntakeCardProps) {
  const hasAttribution =
    (campaignName?.trim()?.length ?? 0) > 0 ||
    (adName?.trim()?.length ?? 0) > 0 ||
    (platform?.trim()?.length ?? 0) > 0;

  // Exclude attribution + tracking keys (shown elsewhere or noise)
  const EXCLUDED_KEYS = new Set([
    ...TRACKING_KEYS,
    "campaign_name",
    "ad_name",
    "platform",
  ]);
  const formEntries =
    formData && typeof formData === "object"
      ? Object.entries(formData).filter(
          ([key, value]) =>
            !EXCLUDED_KEYS.has(key) &&
            value !== null &&
            value !== undefined &&
            value !== "",
        )
      : [];

  const hasFormData = formEntries.length > 0;
  const hasContent = hasAttribution || hasFormData;

  if (!hasContent) return null;

  return (
    <div className="bg-white/80 backdrop-blur-2xl ring-1 ring-black/3 shadow-sm rounded-2xl p-6 border border-stone-100">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center ring-1 ring-rose-200/40">
          <Target className="w-4 h-4 text-rose-600" />
        </div>
        <div>
          <h3
            className="text-sm font-semibold text-stone-900"
            style={{ fontFamily: "var(--font-playfair), serif" }}
          >
            Marketing Intake & Profiling
          </h3>
          <p className="text-[10px] text-stone-500 uppercase tracking-wider mt-0.5">
            Attribution & form responses
          </p>
        </div>
      </div>

      {/* Section A: Attribution badges */}
      {hasAttribution && (
        <div className="flex flex-wrap gap-2 mb-5">
          {campaignName?.trim() && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 ring-1 ring-rose-200/30">
              {campaignName.trim()}
            </span>
          )}
          {adName?.trim() && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/30">
              {adName.trim()}
            </span>
          )}
          {platform?.trim() && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200/30">
              {platform.trim()}
            </span>
          )}
        </div>
      )}

      {/* Section B: form_data (dynamic profiling) */}
      {hasFormData ? (
        <dl className="grid gap-0 divide-y divide-stone-100">
          {formEntries.map(([key, value]) => (
            <div key={key} className="py-3 first:pt-0">
              <dt className="text-stone-500 text-xs font-semibold uppercase tracking-wider">
                {formatKey(key)}
              </dt>
              <dd className="text-stone-900 font-medium mt-1 mb-4 last:mb-0">
                {formatFormValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-stone-400 italic py-2">
          No extended profiling data
        </p>
      )}
    </div>
  );
}
