/**
 * Campaign types for the Performance Marketing Command Center.
 * Mock data interfaces — swap for live Meta/Google Graph APIs later.
 */

import type { AdPlatform } from "./database";

export type CampaignStatus = "active" | "paused";

export interface CampaignTableRow {
  id: string;
  campaign_id: string;
  campaign_name: string;
  platform: AdPlatform;
  status: CampaignStatus;
  total_impressions: number;
  total_spend: number;
  total_conversions: number;
  leads_generated: number;
  cpa: number;
  last_synced_at: string;
}

/** Ad creative performance for "Top Performing Ads by Conversion" chart */
export interface AdCreativePerformance {
  ad_name: string;
  ad_id: string;
  conversions: number;
  spend: number;
}

/** Slice for Budget vs Lead Volume donut chart */
export interface BudgetLeadSlice {
  name: string;
  value: number;
  fill: string;
}

/** KPI card with optional trend */
export interface CampaignKPI {
  label: string;
  value: string;
  trend?: "up" | "down";
  trendPercent?: number;
}
