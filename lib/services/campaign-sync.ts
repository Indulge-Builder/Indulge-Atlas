/**
 * Campaign Sync — Meta & Google Ads data fetchers
 *
 * Meta: Facebook Marketing API (Graph API) — /act_{ad_account_id}/campaigns
 * Google: Google Ads API (GAQL) — campaign performance reports
 */

export interface SyncCampaignRow {
  campaign_id: string;
  campaign_name: string;
  platform: "meta" | "google";
  status: "active" | "paused";
  amount_spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpc: number;
}

/** Meta Graph API campaign shape (insights nested) */
interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  insights?: {
    data?: Array<{
      spend?: string;
      impressions?: string;
      clicks?: string;
      actions?: Array<{ action_type: string; value: string }>;
    }>;
  };
}

/** Meta Graph API error response shape */
interface MetaApiError {
  error?: { message?: string };
}

/**
 * Extract conversions from Meta insights actions array.
 * Looks for action_type === 'lead' (Lead Ad form submissions).
 */
function extractConversions(actions: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actions || !Array.isArray(actions)) return 0;
  const leadAction = actions.find((a) => a.action_type === "lead");
  if (!leadAction || leadAction.value == null) return 0;
  const parsed = parseInt(leadAction.value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Fetch campaign metrics from Meta Marketing API.
 *
 * Endpoint: GET /act_{ad_account_id}/campaigns
 * Fields: name, status, objective, insights (last 30 days)
 */
export async function fetchMetaAdsData(): Promise<SyncCampaignRow[]> {
  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!token) {
    console.warn("[campaign-sync] META_ACCESS_TOKEN is missing — skipping Meta fetch");
    return [];
  }

  if (!adAccountId) {
    console.warn("[campaign-sync] META_AD_ACCOUNT_ID is missing — skipping Meta fetch");
    return [];
  }

  const fields =
    "name,status,objective,insights.date_preset(last_30d){impressions,clicks,spend,actions}";
  const url = `https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = (await response.json()) as MetaApiError;
      const message = errorBody?.error?.message ?? response.statusText;
      console.error("[campaign-sync] Meta API error:", message);
      throw new Error(message);
    }

    const json = (await response.json()) as { data?: MetaCampaign[] };
    const campaigns = json?.data ?? [];

    return campaigns.map((campaign) => {
      const insights = campaign.insights?.data?.[0];
      const spend = parseFloat(insights?.spend ?? "0") || 0;
      const impressions = parseInt(insights?.impressions ?? "0", 10) || 0;
      const clicks = parseInt(insights?.clicks ?? "0", 10) || 0;
      const conversions = extractConversions(insights?.actions);
      const cpc = clicks > 0 ? spend / clicks : 0;

      const status = (campaign.status?.toLowerCase() ?? "active") as "active" | "paused";

      return {
        campaign_id: campaign.id,
        campaign_name: campaign.name ?? "",
        platform: "meta" as const,
        status: status === "active" || status === "paused" ? status : "active",
        amount_spent: spend,
        impressions,
        clicks,
        conversions,
        cpc,
      };
    });
  } catch (e) {
    if (e instanceof Error) {
      console.error("[campaign-sync] Meta fetch failed:", e.message);
      throw e;
    }
    throw new Error("Meta fetch failed");
  }
}

/**
 * Fetch campaign metrics from Google Ads API.

 * TODO: Implement with Google Ads API (GAQL)
 *   - Query: SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros,
 *            metrics.impressions, metrics.clicks, metrics.conversions
 *   - FROM campaign
 *   - Use google-ads-api npm package
 *   - Use GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN env vars
 */
export async function fetchGoogleAdsData(): Promise<SyncCampaignRow[]> {
  // TODO: const client = new GoogleAdsApi({ client_id, client_secret, developer_token });
  // const customer = client.Customer({ customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID });
  // const results = await customer.query(gaqlQuery);
  // return results.map(transformGoogleCampaign);

  // Mock data for testing database upsert
  return [
    {
      campaign_id: "goog_search_luxury",
      campaign_name: "Luxury Villas — Search",
      platform: "google",
      status: "active",
      amount_spent: 142000,
      impressions: 89000,
      clicks: 5680,
      conversions: 56,
      cpc: 25.0,
    },
    {
      campaign_id: "goog_display_remarket",
      campaign_name: "Display Remarketing — High Intent",
      platform: "google",
      status: "active",
      amount_spent: 68000,
      impressions: 210000,
      clicks: 2800,
      conversions: 28,
      cpc: 24.29,
    },
    {
      campaign_id: "goog_youtube_awareness",
      campaign_name: "YouTube — Brand Story",
      platform: "google",
      status: "paused",
      amount_spent: 185000,
      impressions: 520000,
      clicks: 2200,
      conversions: 22,
      cpc: 84.09,
    },
  ];
}
