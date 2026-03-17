/**
 * Mock campaign data for the Performance Marketing Command Center.
 * Swap for live Meta/Google Graph APIs when ready.
 */

import type { CampaignTableRow } from "@/lib/types/campaigns";
import type { AdCreativePerformance, BudgetLeadSlice } from "@/lib/types/campaigns";

/** Mock campaigns for table — merge with real data from getCampaignsWithAttribution */
export const MOCK_CAMPAIGNS: CampaignTableRow[] = [
  {
    id: "1",
    campaign_id: "meta_summer_2025",
    campaign_name: "Summer Collection — Instagram Reels",
    platform: "meta",
    status: "active",
    total_impressions: 284000,
    total_spend: 125000,
    total_conversions: 47,
    leads_generated: 47,
    cpa: 2659,
    last_synced_at: new Date().toISOString(),
  },
  {
    id: "2",
    campaign_id: "meta_lookalike_retarget",
    campaign_name: "Lookalike Audience Retargeting",
    platform: "meta",
    status: "active",
    total_impressions: 156000,
    total_spend: 78000,
    total_conversions: 32,
    leads_generated: 32,
    cpa: 2437,
    last_synced_at: new Date().toISOString(),
  },
  {
    id: "3",
    campaign_id: "meta_brand_awareness",
    campaign_name: "Brand Awareness — Top of Funnel",
    platform: "meta",
    status: "paused",
    total_impressions: 420000,
    total_spend: 95000,
    total_conversions: 18,
    leads_generated: 18,
    cpa: 5277,
    last_synced_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "4",
    campaign_id: "goog_search_luxury",
    campaign_name: "Luxury Villas — Search",
    platform: "google",
    status: "active",
    total_impressions: 89000,
    total_spend: 142000,
    total_conversions: 56,
    leads_generated: 56,
    cpa: 2535,
    last_synced_at: new Date().toISOString(),
  },
  {
    id: "5",
    campaign_id: "goog_display_remarket",
    campaign_name: "Display Remarketing — High Intent",
    platform: "google",
    status: "active",
    total_impressions: 210000,
    total_spend: 68000,
    total_conversions: 28,
    leads_generated: 28,
    cpa: 2428,
    last_synced_at: new Date().toISOString(),
  },
  {
    id: "6",
    campaign_id: "goog_youtube_awareness",
    campaign_name: "YouTube — Brand Story",
    platform: "google",
    status: "paused",
    total_impressions: 520000,
    total_spend: 185000,
    total_conversions: 22,
    leads_generated: 22,
    cpa: 8409,
    last_synced_at: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: "7",
    campaign_id: "evt_griffin_gala",
    campaign_name: "Griffin Gala 2025",
    platform: "events",
    status: "active",
    total_impressions: 12000,
    total_spend: 45000,
    total_conversions: 89,
    leads_generated: 89,
    cpa: 505,
    last_synced_at: new Date().toISOString(),
  },
  {
    id: "8",
    campaign_id: "evt_furak_party",
    campaign_name: "Furak VIP Party",
    platform: "events",
    status: "active",
    total_impressions: 8500,
    total_spend: 32000,
    total_conversions: 42,
    leads_generated: 42,
    cpa: 761,
    last_synced_at: new Date().toISOString(),
  },
];

/** Mock ad creative performance for "Top Performing Ads by Conversion" chart */
export function getMockAdPerformance(campaignId: string): AdCreativePerformance[] {
  const byCampaign: Record<string, AdCreativePerformance[]> = {
    meta_summer_2025: [
      { ad_name: "Reel — Poolside", ad_id: "ad_1", conversions: 18, spend: 42000 },
      { ad_name: "Reel — Sunset", ad_id: "ad_2", conversions: 14, spend: 38000 },
      { ad_name: "Carousel — Collection", ad_id: "ad_3", conversions: 9, spend: 28000 },
      { ad_name: "Static — CTA", ad_id: "ad_4", conversions: 6, spend: 17000 },
    ],
    meta_lookalike_retarget: [
      { ad_name: "Retarget — Testimonial", ad_id: "ad_5", conversions: 12, spend: 28000 },
      { ad_name: "Retarget — Offer", ad_id: "ad_6", conversions: 11, spend: 25000 },
      { ad_name: "Retarget — UGC", ad_id: "ad_7", conversions: 9, spend: 25000 },
    ],
    goog_search_luxury: [
      { ad_name: "Search — Villas", ad_id: "ad_8", conversions: 24, spend: 62000 },
      { ad_name: "Search — Luxury", ad_id: "ad_9", conversions: 18, spend: 45000 },
      { ad_name: "Search — Holiday", ad_id: "ad_10", conversions: 14, spend: 35000 },
    ],
    evt_griffin_gala: [
      { ad_name: "Event — Invite", ad_id: "ad_11", conversions: 52, spend: 28000 },
      { ad_name: "Event — VIP Pass", ad_id: "ad_12", conversions: 37, spend: 17000 },
    ],
  };
  return (
    byCampaign[campaignId] ?? [
      { ad_name: "Primary Creative", ad_id: "ad_default", conversions: 1, spend: 1000 },
    ]
  );
}

/** Mock budget vs lead slices for donut chart (Spend vs Revenue) */
export function getMockBudgetLeadSlices(
  spend: number,
  revenue: number
): BudgetLeadSlice[] {
  const total = spend + revenue;
  if (total === 0)
    return [
      { name: "Spend", value: 1, fill: "#818CF8" },
      { name: "Revenue", value: 0, fill: "#34D399" },
    ];
  return [
    { name: "Ad Spend", value: spend, fill: "#818CF8" },
    { name: "Revenue", value: revenue, fill: "#34D399" },
  ];
}
