/** Founder Overview tab — business units shown on onboarding oversight. */
export const OVERVIEW_DOMAINS = [
  { key: "indulge_global", label: "Concierge" },
  { key: "indulge_shop", label: "Shop" },
  { key: "indulge_legacy", label: "Legacy" },
  { key: "indulge_house", label: "House" },
] as const;

export type OverviewDomainKey = (typeof OVERVIEW_DOMAINS)[number]["key"];

export const OVERVIEW_DOMAIN_KEYS: OverviewDomainKey[] = OVERVIEW_DOMAINS.map(
  (d) => d.key,
);
