/**
 * Campaign Sync — Meta & Google Ads data fetchers
 *
 * Meta: Facebook Marketing API (Graph API) — /act_{ad_account_id}/insights
 *   Uses insights endpoint with strict attribution & delivery filters to match Ads Manager UI.
 * Google: Google Ads API (GAQL) — campaign performance reports
 */

export interface SyncCampaignRow {
  campaign_id: string;
  campaign_name: string;
  platform: "meta" | "google";
  status: string; // Meta: ACTIVE, PAUSED, COMPLETED, etc. (lowercased); Google: active | paused
  amount_spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpc: number;
}

/** Meta Insights API response row (campaign-level, daily when time_increment=1) */
interface MetaInsightRow {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

/** Meta Graph API error response shape */
interface MetaApiError {
  error?: { message?: string; code?: number; type?: string };
}

/**
 * Extract conversions from Meta insights actions array.
 * Primary: action_type === 'lead' (Lead Ad form submissions).
 * Fallback: offsite_conversion.fb_pixel_custom or onsite_conversion.lead_grouped for custom setups.
 */
function extractConversions(actions: Array<{ action_type: string; value: string }> | undefined): number {
  if (!actions || !Array.isArray(actions)) return 0;

  const leadAction =
    actions.find((a) => a.action_type === "lead") ??
    actions.find((a) => a.action_type === "offsite_conversion.fb_pixel_custom") ??
    actions.find((a) => a.action_type === "onsite_conversion.lead_grouped");

  if (!leadAction || leadAction.value == null) return 0;
  const parsed = parseInt(leadAction.value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Meta Campaign API response shape */
interface MetaCampaign {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
}

/** Helper: fetch campaign statuses from Meta campaigns endpoint. Returns Map<id, status>. */
async function fetchMetaCampaignStatuses(
  adAccountId: string,
  token: string
): Promise<Record<string, string>> {
  const campaignStatusMap: Record<string, string> = {};
  let url: string | null = `https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns?fields=id,name,status,effective_status&access_token=${encodeURIComponent(token)}`;

  while (url) {
    const response = await fetch(url);

    if (!response.ok) {
      let errorBody: MetaApiError = {};
      try {
        errorBody = (await response.json()) as MetaApiError;
      } catch {
        console.error("[campaign-sync] Meta campaigns API non-JSON error body, status:", response.status);
      }
      const message = errorBody?.error?.message ?? response.statusText;
      console.error("[campaign-sync] Meta campaigns API error:", { message, status: response.status });
      throw new Error(message);
    }

    const json = (await response.json()) as { data?: MetaCampaign[]; paging?: { next?: string } };
    const data = json?.data ?? [];

    for (const c of data) {
      const status = c.effective_status ?? c.status ?? "UNKNOWN";
      campaignStatusMap[c.id] = status;
    }

    url = json?.paging?.next ?? null;
  }

  return campaignStatusMap;
}

/** Helper: fetch insights from Meta insights endpoint (with pagination). */
async function fetchMetaInsightsData(
  adAccountId: string,
  token: string
): Promise<MetaInsightRow[]> {
  const baseUrl = `https://graph.facebook.com/v19.0/act_${adAccountId}/insights`;
  const params = new URLSearchParams({
    level: "campaign",
    fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
    time_increment: "1",
    date_preset: "last_30d",
    filtering: JSON.stringify([
      {
        field: "campaign.delivery_info",
        operator: "IN",
        value: ["ACTIVE", "PAUSED", "COMPLETED"],
      },
    ]),
    use_unified_attribution_setting: "true",
    access_token: token,
  });

  const allRows: MetaInsightRow[] = [];
  let url: string | null = `${baseUrl}?${params.toString()}`;

  while (url) {
    const response = await fetch(url);

    if (!response.ok) {
      let errorBody: MetaApiError = {};
      try {
        errorBody = (await response.json()) as MetaApiError;
      } catch {
        console.error("[campaign-sync] Meta insights API non-JSON error body, status:", response.status);
      }
      const message = errorBody?.error?.message ?? response.statusText;
      const code = errorBody?.error?.code;
      const type = errorBody?.error?.type;
      console.error("[campaign-sync] Meta insights API error:", {
        message,
        code,
        type,
        status: response.status,
      });
      throw new Error(message);
    }

    const json = (await response.json()) as {
      data?: MetaInsightRow[];
      paging?: { next?: string };
    };

    const data = json?.data ?? [];
    allRows.push(...data);

    url = json?.paging?.next ?? null;
  }

  return allRows;
}

/**
 * Fetch campaign metrics from Meta Marketing API.
 *
 * Two-step fetch (concurrent):
 *   1. Campaign statuses: GET /act_{id}/campaigns?fields=id,name,status,effective_status
 *   2. Insights: GET /act_{id}/insights (level=campaign, time_increment=1, etc.)
 *
 * Merges status from campaigns into insights payload for accurate CRM status.
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

  try {
    const [campaignStatusMap, insightRows] = await Promise.all([
      fetchMetaCampaignStatuses(adAccountId, token),
      fetchMetaInsightsData(adAccountId, token),
    ]);

    // Aggregate daily rows by campaign (campaign_metrics stores one row per campaign)
    const byCampaign = new Map<
      string,
      { campaign_name: string; spend: number; impressions: number; clicks: number; conversions: number }
    >();

    for (const row of insightRows) {
      const cid = row.campaign_id;
      if (!cid) continue;

      const spend = parseFloat(row.spend ?? "0") || 0;
      const impressions = parseInt(row.impressions ?? "0", 10) || 0;
      const clicks = parseInt(row.clicks ?? "0", 10) || 0;
      const conversions = extractConversions(row.actions);

      const existing = byCampaign.get(cid);
      if (existing) {
        existing.spend += spend;
        existing.impressions += impressions;
        existing.clicks += clicks;
        existing.conversions += conversions;
      } else {
        byCampaign.set(cid, {
          campaign_name: row.campaign_name ?? "",
          spend,
          impressions,
          clicks,
          conversions,
        });
      }
    }

    return Array.from(byCampaign.entries()).map(([campaign_id, agg]) => {
      const cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0;
      const status = campaignStatusMap[campaign_id]?.toLowerCase() ?? "unknown";
      return {
        campaign_id,
        campaign_name: agg.campaign_name,
        platform: "meta" as const,
        status,
        amount_spent: agg.spend,
        impressions: agg.impressions,
        clicks: agg.clicks,
        conversions: agg.conversions,
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
 *
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
