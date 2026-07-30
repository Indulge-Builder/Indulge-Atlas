/** Server-only Chetto integration (called from Route Handlers). Not a Client Component server-action module — Next.js requires `"use server"` files to export only async functions. */

import { unstable_cache } from "next/cache";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { e164LookupVariants } from "@/lib/utils/phone";

/** Joule REST base — see `api-1.json` (OpenAPI 3.1) at repo root. Rate limit: 60 req/min per endpoint per API key. */
const CHETTO_BASE = "https://apiv2.chetto.ai/joule";
export const CHETTO_RATE_LIMIT_PER_MIN = 60;

/** Maps `clients.queendom` values to hardcoded sub-org group id lists (from GET /v1/organizations/). */
export const QUEENDOM_TO_SUB_ORG: Record<string, string> = {
  "Ananyshree Queendom": "93f5a34ca0ea4570990a118d7dac1782",
  "Anishqa Queendom": "24466f2353b04650a9fe03ce94ee1562",
  Unassigned: "897221c18f434bff848a881d3128c853",
};

const UNASSIGNED_GROUP_IDS: string[] = ["120363408303626088"];

export const ANISHQA_GROUP_IDS: string[] = [
  "120363404671158938",
  "120363264335318517",
  "120363406217972327",
  "120363420504926030",
  "120363138392852454",
  "120363418364383571",
  "120363295123227041",
  "120363368872177881",
  "120363406504631702",
  "120363320286506683",
  "120363040702747653",
  "120363299085095373",
  "120363420839082712",
  "120363028948756100",
  "120363406333070205",
  "120363367336659906",
  "120363425649852635",
  "120363039325874631",
  "120363029905914978",
  "120363168499573628",
  "120363144248698914",
  "120363320550932574",
  "120363402891717231",
  "120363156826044156",
  "120363180095912452",
  "120363425327876019",
  "120363417667768819",
  "120363424655751101",
  "120363220594193456",
  "120363425712612632",
  "120363282067482573",
  "120363425123962606",
  "120363422719606345",
  "120363043253493761",
  "120363401230784710",
  "120363407006981665",
  "120363424928490379",
  "120363320644604848",
  "120363418280486805",
  "120363369819308567",
  "120363303707459088",
  "120363305143483311",
  "120363279389121237",
  "120363204331860221",
  "120363420282207441",
  "120363195582121152",
  "120363401873060861",
  "120363162857991674",
  "120363408004868793",
  "120363172698932261",
  "120363427122488691",
  "120363422480647803",
  "120363403326492880",
  "120363402777430007",
  "120363417646010272",
  "120363153890221334",
  "120363051682059006",
  "120363402943988433",
  "120363424538150546",
  "120363428041469299",
  "120363405687165482",
  "120363425357647813",
  "120363424346444187",
  "120363419269665198",
  "120363285355039509",
  "120363157303115173",
  "120363420930944718",
  "120363424031427269",
  "120363423318563002",
  "120363146249699561",
  "120363028882377345",
  "120363043899663146",
  "120363408360623941",
  "120363298091542183",
  "120363422982311887",
  "120363420219378853",
  "120363170241920857",
  "120363402701536997",
  "120363320085419685",
  "120363423516466522",
  "120363404492835245",
  "120363420903809219",
  "120363405526790575",
  "120363406800763613",
  "120363425001589399",
  "120363404299349487",
  "120363320054916394",
  "120363169118473095",
  "120363387452233052",
  "120363405798497859",
  "120363404969371857",
  "120363139785527011",
  "120363237625955352",
  "120363405444010176",
  "120363188760498744",
  "120363194432474919",
  "120363406039319398",
  "120363421718610216",
  "120363421438018358",
  "120363043301610436",
  "120363151626551930",
  "120363424120499946",
  "120363168553720678",
  "120363317663435675",
  "120363368965450911",
  "120363022106565866",
  "120363419987541827",
  "120363406023475600",
  "120363416642331256",
  "120363169956620305",
  "120363029160305286",
  "120363422722027606",
  "120363407847401691",
  "120363143814736510",
  "120363167743596531",
  "120363405549559315",
  "120363424495142211",
  "120363040330354282",
  "120363403767739960",
  "120363294554107964",
  "120363403021015909",
  "120363424576251214",
  "120363025611197637",
  "120363406437481493",
  "120363424178638809",
  "120363276579328533",
  "120363426490138949",
  "120363163429501522",
  "120363321385807167",
  "120363403526182102",
  "120363037643203818",
  "120363294208930856",
  "120363235366232140",
  "120363402114248957",
  "120363426542445105",
  "120363157409212048",
  "120363319939180974",
  "120363406606739818",
  "120363039270967624",
  "120363407245978188",
  "120363404874276061",
  "120363424900823247",
  "120363284025344911",
  "120363026621439367",
  "120363024548076519",
  "120363424164475345",
  "120363426685575452",
  "120363139505387120",
  "120363423038209519",
  "120363405583436950",
  "120363237249470687",
  "120363425995716973",
  "120363404961394563",
  "120363424170315965",
  "120363322809025554",
  "120363179672645033",
  "120363160881280576",
  "120363039015484091",
  "120363423787872340",
  "120363422312126960",
  "120363418003343140",
  "120363200387969969",
  "120363404031928279",
  "120363405681101691",
  "120363421720711116",
  "120363048456635687",
  "120363301501337185",
  "120363315868084520",
  "120363419454725078",
  "120363317575136097",
  "120363192327581681",
  "120363317417434185",
  "120363068259180902",
  "120363421114187446",
  "120363400825403133",
  "120363417181864522",
  "120363425808916128",
  "120363402516229004",
  "120363423835922364",
  "120363183266394817",
  "120363282684584044",
  "120363151825481368",
  "120363406460331794",
  "120363297026652026",
  "120363113832974762",
  "120363423907397699",
];

export const ANANYSHREE_GROUP_IDS: string[] = [
  "120363199943070703",
  "120363385027386423",
  "120363191568324248",
  "120363404321973497",
  "120363197335540111",
  "120363150921102837",
  "120363164071207635",
  "120363151664685958",
  "120363425367453108",
  "120363043253889095",
  "120363404891326106",
  "120363368173427025",
  "120363161400592333",
  "120363294989760901",
  "120363315491628754",
  "120363315856792305",
  "120363422643508317",
  "120363388799803419",
  "120363406157573513",
  "120363144797874366",
  "120363044415613848",
  "120363406352372886",
  "120363043786703310",
  "120363029334890640",
  "120363036600273263",
  "120363189823501764",
  "120363301393843270",
  "120363041280013694",
  "120363404652601258",
  "120363163980141358",
  "120363190528186615",
  "120363403898984002",
  "120363368389553563",
  "120363169937718110",
  "120363157108165514",
  "120363041162737227",
  "120363146761532227",
  "120363423465097508",
  "120363322645899806",
  "120363421961617820",
  "120363128016953165",
  "120363182089760693",
  "120363423384841889",
  "120363425565723949",
  "120363146495493992",
  "120363161774213490",
  "120363183202792117",
  "120363238535795633",
  "120363045844014066",
  "120363384894311051",
  "120363319994581694",
  "120363298347961240",
  "120363423229572931",
  "120363031575921146",
  "120363378039227324",
  "120363408232696270",
  "120363305853268368",
  "120363141082472094",
  "120363313288163934",
  "120363022002458333",
  "120363366361363777",
  "120363406102490388",
  "120363313852346915",
  "120363319936737300",
  "120363385194123012",
  "120363406355121609",
  "120363256000493818",
  "120363404908724342",
  "120363423240818325",
  "120363420402476601",
  "120363408191937206",
  "120363388562456414",
  "120363419246027842",
  "120363421379005517",
  "120363169733471845",
  "120363201188045462",
  "120363405472442286",
  "120363389381424684",
  "120363425252656613",
  "120363313443532982",
  "120363423215701465",
  "120363387314118538",
  "120363384903403677",
  "120363386597667905",
  "120363368189481944",
  "120363404925966428",
  "120363422990292569",
  "120363170289394975",
  "120363320675765729",
  "120363163705186323",
  "120363162428555103",
  "120363399741631361",
  "120363161239790773",
  "120363043435728856",
  "120363385146342456",
  "120363385594637556",
  "120363145342868534",
  "120363186992997659",
  "120363407512233524",
  "120363151968359249",
  "120363386278568681",
  "120363425017701891",
  "120363368400350176",
  "120363425267606855",
  "120363382791496738",
  "120363160767573448",
  "120363420865931918",
  "120363420655290475",
  "120363422390499285",
  "120363386417502861",
  "120363264802346282",
  "120363423808950524",
  "120363298701042875",
  "120363187219171883",
  "120363422647739927",
  "120363188317408795",
  "120363160148966618",
  "120363423897738941",
  "120363281684691440",
  "120363046809301862",
  "120363404013708004",
  "120363406768737686",
  "120363323200859896",
  "120363410144948653",
  "120363423449576478",
  "120363334626149906",
  "120363407402891387",
  "120363427443923204",
  "120363200598187974",
  "120363045129144559",
  "120363152258466942",
  "120363044934903562",
  "120363385196480275",
  "120363404239244365",
  "120363302348419256",
  "120363417517910292",
  "120363385181795972",
  "120363408821961117",
  "120363256281727886",
  "120363040474757538",
  "120363161886355692",
  "120363162294920763",
  "120363419650364043",
  "120363048518946563",
  "120363044395179980",
  "120363319219175463",
  "120363407711507275",
  "120363405782135865",
  "120363299304512484",
  "120363150728525338",
  "120363406479982819",
  "120363425009648058",
  "120363405500406410",
  "120363183992561752",
  "120363385742628212",
  "120363154579694188",
  "120363417770585905",
  "120363387821995994",
  "120363318969173169",
  "120363044612764775",
  "120363042245004242",
  "120363402609729248",
  "120363143956384087",
  "120363299774485112",
  "120363426173724115",
  "120363178777493505",
  "120363046616249949",
  "120363386837986517",
  "120363425405106980",
  "120363384013787001",
  "120363425103801224",
  "120363422163888619",
  "120363299207531749",
  "120363301912708623",
  "120363404204912771",
  "120363377220722518",
  "120363422102566383",
  "120363387396625746",
  "120363025410292137",
  "120363172766446618",
  "120363042994189815",
  "120363294877653996",
  "120363425891533865",
  "120363405984945490",
  "120363400743669650",
  "120363386550299083",
  "120363138177514846",
  "120363151670814932",
  "120363421510750866",
  "120363424696990958",
  "120363165806968469",
  "120363195296074657",
  "120363207182579235",
  "120363043804845942",
  "120363424918564935",
  "120363367516331883",
  "120363161679388386",
  "120363313789454939",
  "120363409481084472",
  "120363402549333793",
  "120363402565977336",
  "120363387303304649",
];

export const QUEENDOM_GROUP_IDS: Record<string, string[]> = {
  "Ananyshree Queendom": ANANYSHREE_GROUP_IDS,
  "Anishqa Queendom": ANISHQA_GROUP_IDS,
  Unassigned: UNASSIGNED_GROUP_IDS,
};

export type ChettoGroup = {
  group_id: string;
  group_name: string | null;
  valid: boolean | null;
  created_at_utc: number | null;
  updated_at_utc: number | null;
  created_at: string | null;
  access_members: string[];
};

export type ChettoMessage = {
  id: string | null;
  text: string | null;
  phone_no: string | null;
  sender_name: string | null;
  from_me: boolean;
  timestamp: string | null;
};

function getChettoApiKey(): string {
  const key = process.env.CHETTO_API_KEY;
  if (!key?.trim()) {
    throw new Error("CHETTO_API_KEY is not configured");
  }
  return key.trim();
}

/** When set, sent as `org_id` on Joule routes (timeline / group / list) per OpenAPI — required for org-scoped access on many Chetto workspaces. */
function getChettoOrgId(): string | undefined {
  const v = process.env.CHETTO_ORG_ID?.trim();
  return v && v.length > 0 ? v : undefined;
}

export type ChettoOrganization = {
  org_id: string;
  org_name: string;
  group_ids: string[];
  parent_id: string | null;
  sub_orgs: ChettoOrganization[];
};

export type ChettoEscalation = {
  id: string;
  group_id: string;
  group_name: string | null;
  label: string;
  title: string | null;
  description: string | null;
  status: string | null;
  signals: string[] | null;
};

let queendomSubOrgCache: {
  map: Record<string, string>;
  fetchedAt: number;
} | null = null;

const QUEENDOM_ORG_CACHE_MS = 60 * 60 * 1000;

function normalizeOrgNameForQueendomMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[''`]s\b/g, "s")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapOrganizationJson(raw: unknown): ChettoOrganization | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const org_id = o.org_id;
  const org_name = o.org_name;
  if (typeof org_id !== "string" || !org_id) return null;
  if (typeof org_name !== "string") return null;
  const group_ids = Array.isArray(o.group_ids)
    ? o.group_ids.filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  const parent_id =
    typeof o.parent_id === "string" ? o.parent_id : o.parent_id === null ? null : null;
  const subRaw = o.sub_orgs;
  const sub_orgs = Array.isArray(subRaw)
    ? subRaw
        .map(mapOrganizationJson)
        .filter((x): x is ChettoOrganization => x !== null)
    : [];
  return { org_id, org_name, group_ids, parent_id, sub_orgs };
}

/** `GET /v1/organizations/` — org tree with sub-orgs and group_ids. */
export async function listOrganizations(): Promise<ChettoOrganization[]> {
  try {
    const res = await chettoFetch("/v1/organizations/");
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as unknown;
    if (!Array.isArray(json)) return [];
    return json
      .map(mapOrganizationJson)
      .filter((x): x is ChettoOrganization => x !== null);
  } catch {
    return [];
  }
}

function matchQueendomToSubOrgId(
  queendomKey: string,
  orgName: string,
): boolean {
  const q = normalizeOrgNameForQueendomMatch(queendomKey);
  const n = normalizeOrgNameForQueendomMatch(orgName);
  if (!q || !n) return false;
  if (q === n) return true;
  if (queendomKey === "Unassigned" && n.includes("unassigned")) return true;
  if (n.includes(q) || q.includes(n)) return true;
  const qFirst = q.split(" ")[0] ?? "";
  const nFirst = n.split(" ")[0] ?? "";
  return qFirst.length >= 4 && qFirst === nFirst;
}

/** Resolve Atlas `clients.queendom` → Chetto sub-org id. API-first; falls back to `QUEENDOM_TO_SUB_ORG`. */
export async function getQueendomSubOrgMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (
    queendomSubOrgCache &&
    now - queendomSubOrgCache.fetchedAt < QUEENDOM_ORG_CACHE_MS
  ) {
    return queendomSubOrgCache.map;
  }

  const merged: Record<string, string> = { ...QUEENDOM_TO_SUB_ORG };
  const orgs = await listOrganizations();
  const subOrgs: ChettoOrganization[] = [];
  for (const org of orgs) {
    subOrgs.push(...org.sub_orgs);
    if (org.parent_id) subOrgs.push(org);
  }

  for (const queendom of Object.keys(QUEENDOM_TO_SUB_ORG)) {
    const hit = subOrgs.find((s) => matchQueendomToSubOrgId(queendom, s.org_name));
    if (hit) merged[queendom] = hit.org_id;
  }

  queendomSubOrgCache = { map: merged, fetchedAt: now };
  return merged;
}

export type ChettoQueendomOrg = {
  queendom: string;
  org_id: string;
  org_name: string;
  group_count: number;
};

export type ChettoGroupCatalogEntry = {
  group_id: string;
  group_name: string | null;
  queendom: string | null;
  org_id: string;
  org_name: string;
};

/** Atlas queendom → Chetto sub-org id + live org name from `GET /v1/organizations/`. */
export async function getQueendomOrgRegistry(): Promise<ChettoQueendomOrg[]> {
  const subOrgMap = await getQueendomSubOrgMap();
  const orgs = await listOrganizations();
  const subById = new Map<string, ChettoOrganization>();
  for (const org of orgs) {
    for (const sub of org.sub_orgs) subById.set(sub.org_id, sub);
  }

  return Object.entries(subOrgMap).map(([queendom, org_id]) => {
    const sub = subById.get(org_id);
    return {
      queendom,
      org_id,
      org_name: sub?.org_name ?? queendom,
      group_count: sub?.group_ids.length ?? 0,
    };
  });
}

function mapGroupSummaryJson(
  raw: unknown,
): Pick<ChettoGroup, "group_id" | "group_name"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const group_id = o.group_id;
  if (typeof group_id !== "string" || !group_id) return null;
  const group_name =
    typeof o.group_name === "string" || o.group_name === null
      ? (o.group_name as string | null)
      : null;
  return { group_id, group_name };
}

/** `GET /v1/groups?org_id=` — id + display name per GroupSummary. */
async function listGroupSummariesForOrg(
  orgId: string,
): Promise<Pick<ChettoGroup, "group_id" | "group_name">[]> {
  try {
    const res = await chettoFetch(
      `/v1/groups?${new URLSearchParams({ org_id: orgId }).toString()}`,
    );
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as unknown;
    if (!Array.isArray(json)) return [];
    return json
      .map(mapGroupSummaryJson)
      .filter((x): x is Pick<ChettoGroup, "group_id" | "group_name"> => x !== null);
  } catch {
    return [];
  }
}

async function buildChettoGroupCatalogUncached(
  queendom?: string,
): Promise<ChettoGroupCatalogEntry[]> {
  const registry = await getQueendomOrgRegistry();
  const targets = queendom
    ? registry.filter((r) => r.queendom === queendom)
    : registry;

  const entries: ChettoGroupCatalogEntry[] = [];
  const seen = new Set<string>();

  for (const row of targets) {
    const summaries = await listGroupSummariesForOrg(row.org_id);
    const nameById = new Map(
      summaries.map((s) => [s.group_id, s.group_name] as const),
    );
    const orgIds = await listGroupIdsFromOrganization(row.org_id);
    const allIds = new Set([
      ...summaries.map((s) => s.group_id),
      ...orgIds,
    ]);

    for (const group_id of allIds) {
      if (seen.has(group_id)) continue;
      seen.add(group_id);
      entries.push({
        group_id,
        group_name: nameById.get(group_id) ?? null,
        queendom: row.queendom,
        org_id: row.org_id,
        org_name: row.org_name,
      });
    }
  }

  return entries.sort((a, b) => {
    const la = (a.group_name ?? a.group_id).toLowerCase();
    const lb = (b.group_name ?? b.group_id).toLowerCase();
    return la.localeCompare(lb);
  });
}

/** All Chetto groups with names, scoped by Atlas queendom when set. Cached 1h. */
export async function getChettoGroupCatalog(
  options?: { queendom?: string },
): Promise<ChettoGroupCatalogEntry[]> {
  const queendom = options?.queendom?.trim() || "all";
  try {
    return await unstable_cache(
      async () => buildChettoGroupCatalogUncached(options?.queendom),
      ["chetto-group-catalog", queendom, getChettoOrgId() ?? "no-org"],
      { revalidate: 3600 },
    )();
  } catch {
    return buildChettoGroupCatalogUncached(options?.queendom);
  }
}

/** Resolve display name for a group id (catalog first, then single metadata fetch). */
export async function resolveChettoGroupName(
  groupId: string,
): Promise<string | null> {
  const id = groupId.trim();
  if (!id) return null;
  const catalog = await getChettoGroupCatalog();
  const hit = catalog.find((e) => e.group_id === id);
  if (hit?.group_name?.trim()) return hit.group_name.trim();
  const meta = await fetchGroupMetadata(id);
  return meta?.group_name?.trim() ?? null;
}

function buildInsightsOrgQuery(
  orgId?: string,
  subOrgIds?: string[],
): string {
  const q = new URLSearchParams();
  if (orgId) q.set("org_id", orgId);
  for (const id of subOrgIds ?? []) {
    q.append("sub_org_ids", id);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function chettoFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const key = getChettoApiKey();
  const headers = new Headers(init.headers);
  headers.set("x-api-key", key);
  if (
    !headers.has("Content-Type") &&
    init.method &&
    init.method !== "GET" &&
    init.body
  ) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${CHETTO_BASE}${path}`, {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });
}

function extractGroupIdsFromGroupsListJson(json: unknown): string[] {
  let items: unknown[] | null = null;
  if (Array.isArray(json)) {
    items = json;
  } else if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const key of ["data", "groups", "result", "items"] as const) {
      const v = o[key];
      if (Array.isArray(v)) {
        items = v;
        break;
      }
    }
  }
  if (!items) return [];

  const ids: string[] = [];
  for (const item of items) {
    if (typeof item === "string" && item.length > 0) {
      ids.push(item);
      continue;
    }
    if (item && typeof item === "object" && "group_id" in item) {
      const gid = (item as { group_id: unknown }).group_id;
      if (typeof gid === "string" && gid.length > 0) ids.push(gid);
    }
  }
  return ids;
}

async function resolveOrgIdsForScope(queendom?: string): Promise<string[]> {
  const subOrgMap = await getQueendomSubOrgMap();
  const out = new Set<string>();
  if (queendom && subOrgMap[queendom]) {
    out.add(subOrgMap[queendom]);
  } else {
    for (const subOrgId of Object.values(subOrgMap)) {
      out.add(subOrgId);
    }
  }
  const parentOrgId = getChettoOrgId();
  if (parentOrgId) out.add(parentOrgId);
  return [...out];
}

function resolveSubOrgIdForQueendom(
  queendom: string | undefined,
  subOrgMap: Record<string, string>,
): string | undefined {
  if (!queendom) return undefined;
  return subOrgMap[queendom];
}

/** `GET /v1/groups?org_id=` — group ids visible to this API key within one org. */
async function listGroupIdsForOrg(orgId: string): Promise<string[] | null> {
  try {
    const res = await chettoFetch(
      `/v1/groups?${new URLSearchParams({ org_id: orgId }).toString()}`,
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(
        `[chetto] GET /v1/groups org_id=${orgId} → ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ""}`,
      );
      return null;
    }
    const json = (await res.json().catch(() => null)) as unknown;
    const ids = extractGroupIdsFromGroupsListJson(json);
    return ids.length > 0 ? ids : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.warn(`[chetto] GET /v1/groups org_id=${orgId} failed: ${msg}`);
    return null;
  }
}

/** `GET /v1/organizations/{org_id}` — `group_ids` on the org record (often complete for sub-orgs). */
async function listGroupIdsFromOrganization(orgId: string): Promise<string[]> {
  try {
    const res = await chettoFetch(
      `/v1/organizations/${encodeURIComponent(orgId)}`,
    );
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as unknown;
    if (!json || typeof json !== "object") return [];
    const groupIds = (json as Record<string, unknown>).group_ids;
    if (!Array.isArray(groupIds)) return [];
    return groupIds.filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
  } catch {
    return [];
  }
}

export type ListAllGroupIdsOptions = {
  /** When set, query only that queendom's sub-org (+ parent org). Otherwise all sub-orgs. */
  queendom?: string;
};

/** Union of group ids from parent org and queendom sub-orgs via live Chetto org API. */
export async function listAllGroupIds(
  options: ListAllGroupIdsOptions = {},
): Promise<string[]> {
  const { queendom } = options;
  const allIds = new Set<string>();

  for (const orgId of await resolveOrgIdsForScope(queendom)) {
    const fromGroups = await listGroupIdsForOrg(orgId);
    fromGroups?.forEach((id) => allIds.add(id));
    for (const id of await listGroupIdsFromOrganization(orgId)) {
      allIds.add(id);
    }
  }

  return [...allIds];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAccessMemberPhone(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  for (const key of ["phone_number", "phone", "phone_no", "mobile"] as const) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseAccessMembers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const phone = extractAccessMemberPhone(item);
    if (phone) out.push(phone);
  }
  return out;
}

function normalizePersonNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE00-\uFE0F\u200D]/gu, "")
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function clientNameMatchKey(firstName: string, lastName: string | null): string {
  return normalizePersonNameKey([firstName, lastName].filter(Boolean).join(" "));
}

export function groupNameMatchKey(groupName: string | null): string | null {
  if (!groupName) return null;
  let title = groupName
    .replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\uFE00-\uFE0F\u200D]/gu, "")
    .replace(/\s*(?:pre\s+)?concierge\s*$/i, "")
    .trim();
  title = title.replace(/[''`]'s$/i, "").replace(/[''`]s$/i, "").trim();
  const key = normalizePersonNameKey(title);
  return key.length >= 3 ? key : null;
}

/** Digit-only lookup keys for Chetto access_members and Atlas client phones. */
export function chettoPhoneLookupVariants(rawPhone: string): string[] {
  const trimmed = (rawPhone ?? "").trim();
  if (!trimmed) return [];

  const seen = new Set<string>();
  const pushDigits = (value: string) => {
    const d = value.replace(/\D/g, "");
    if (d.length >= 8) seen.add(d);
  };

  pushDigits(trimmed);

  try {
    let parsed = trimmed.startsWith("+")
      ? parsePhoneNumberFromString(trimmed)
      : parsePhoneNumberFromString(trimmed, "IN");

    if (!parsed?.isValid() && !trimmed.startsWith("+")) {
      const digits = trimmed.replace(/\D/g, "");
      if (digits.length >= 10) {
        parsed = parsePhoneNumberFromString(`+${digits}`);
      }
    }

    if (parsed?.isValid()) {
      pushDigits(parsed.format("E.164"));
      pushDigits(parsed.nationalNumber);
      for (const v of e164LookupVariants(parsed.format("E.164"))) {
        pushDigits(v);
      }
    }
  } catch {
    /* digit-only fallback below */
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!trimmed.startsWith("+") && digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    pushDigits(`91${digits}`);
  }
  if (digits.length === 12 && /^91[6-9]\d{9}$/.test(digits)) {
    pushDigits(digits.slice(2));
  }
  if (!trimmed.startsWith("+") && digits.length === 11 && /^0[6-9]\d{9}$/.test(digits)) {
    const national = digits.slice(1);
    pushDigits(national);
    pushDigits(`91${national}`);
  }

  return [...seen];
}

export type ChettoMappingIndex = {
  byPhone: Map<string, string>;
  byName: Map<string, string>;
};

export function buildChettoMappingIndex(groups: ChettoGroup[]): ChettoMappingIndex {
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string>();

  for (const group of groups) {
    for (const memberPhone of group.access_members) {
      for (const variant of chettoPhoneLookupVariants(memberPhone)) {
        if (!byPhone.has(variant)) byPhone.set(variant, group.group_id);
      }
    }
    const nameKey = groupNameMatchKey(group.group_name);
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, group.group_id);
  }

  return { byPhone, byName };
}

export type ChettoClientMatchInput = {
  phone: string;
  firstName: string;
  lastName: string | null;
};

export function resolveChettoGroupIdFromIndex(
  client: ChettoClientMatchInput,
  index: ChettoMappingIndex,
  groupsForFuzzy?: ChettoGroup[],
): { groupId: string; method: "phone" | "name" | "name_fuzzy" } | null {
  for (const variant of chettoPhoneLookupVariants(client.phone)) {
    const gid = index.byPhone.get(variant);
    if (gid) return { groupId: gid, method: "phone" };
  }

  const nameKey = clientNameMatchKey(client.firstName, client.lastName);
  if (nameKey) {
    const gid = index.byName.get(nameKey);
    if (gid) return { groupId: gid, method: "name" };
  }

  if (!groupsForFuzzy?.length || nameKey.length < 3) return null;

  const first = client.firstName.trim().toLowerCase();
  const last = (client.lastName ?? "").trim().toLowerCase();
  const scored: { groupId: string; score: number }[] = [];

  for (const group of groupsForFuzzy) {
    const gKey = groupNameMatchKey(group.group_name);
    if (!gKey) continue;

    if (gKey.includes(nameKey)) {
      scored.push({ groupId: group.group_id, score: 100 });
      continue;
    }
    if (nameKey.includes(gKey) && gKey.length >= 5) {
      scored.push({ groupId: group.group_id, score: 95 });
      continue;
    }
    if (last.length >= 3 && gKey.includes(last)) {
      scored.push({ groupId: group.group_id, score: last.length >= 4 ? 75 : 60 });
    } else if (first.length >= 4 && gKey.includes(first)) {
      scored.push({ groupId: group.group_id, score: 55 });
    }
  }

  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const topScore = scored[0].score;
  const top = scored.filter((s) => s.score === topScore);
  if (top.length !== 1) return null;
  if (topScore >= 95) return { groupId: top[0].groupId, method: "name_fuzzy" };
  if (topScore >= 75) return { groupId: top[0].groupId, method: "name_fuzzy" };
  if (topScore >= 60) return { groupId: top[0].groupId, method: "name_fuzzy" };
  return null;
}

/** Explain why a client did not match (for mapping reports). */
export function explainChettoMatchFailure(
  client: ChettoClientMatchInput,
  index: ChettoMappingIndex,
  groups: ChettoGroup[],
  failedGroupIds: string[],
): string {
  const nameKey = clientNameMatchKey(client.firstName, client.lastName);
  const phoneVariants = chettoPhoneLookupVariants(client.phone);

  if (!phoneVariants.length && nameKey.length < 3) {
    return "missing_phone_and_name";
  }

  const fuzzyCandidates = groups.filter((g) => {
    const gKey = groupNameMatchKey(g.group_name);
    if (!gKey || nameKey.length < 3) return false;
    return gKey.includes(nameKey) || nameKey.includes(gKey);
  });
  if (fuzzyCandidates.length > 1) return "ambiguous_name_match";

  if (phoneVariants.length > 0 && index.byPhone.size === 0) {
    return "no_group_members_loaded";
  }

  if (phoneVariants.length > 0) {
    return "phone_not_in_any_group_members";
  }

  if (failedGroupIds.length > 0) {
    return "no_name_match_some_groups_failed_metadata";
  }

  return "no_chetto_group_found";
}

function mapGroupJson(raw: unknown): ChettoGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const group_id = o.group_id;
  if (typeof group_id !== "string" || !group_id) return null;
  return {
    group_id,
    group_name:
      typeof o.group_name === "string" || o.group_name === null
        ? (o.group_name as string | null)
        : null,
    valid:
      typeof o.valid === "boolean" || o.valid === null
        ? (o.valid as boolean | null)
        : null,
    created_at_utc:
      typeof o.created_at_utc === "number" ? o.created_at_utc : null,
    updated_at_utc:
      typeof o.updated_at_utc === "number" ? o.updated_at_utc : null,
    created_at:
      typeof o.created_at === "string" || o.created_at === null
        ? (o.created_at as string | null)
        : null,
    access_members: parseAccessMembers(o.access_members),
  };
}

async function fetchGroupMetadataOnce(
  groupId: string,
  orgId?: string,
): Promise<{ status: number; group: ChettoGroup | null }> {
  try {
    const q = new URLSearchParams();
    if (orgId) q.set("org_id", orgId);
    const qs = q.toString();
    const res = await chettoFetch(
      `/v1/groups/${encodeURIComponent(groupId)}${qs ? `?${qs}` : ""}`,
    );
    if (!res.ok) return { status: res.status, group: null };
    const json = (await res.json().catch(() => null)) as unknown;
    return { status: res.status, group: mapGroupJson(json) };
  } catch {
    return { status: 0, group: null };
  }
}

export async function fetchGroupMetadata(
  groupId: string,
  options?: { aggressive?: boolean },
): Promise<ChettoGroup | null> {
  const maxRetries = options?.aggressive ? 6 : 4;
  const retryStatuses = new Set([0, 429, 500, 502, 503]);
  const orgAttempts: (string | undefined)[] = [];
  const seen = new Set<string>();
  for (const orgId of await resolveOrgIdsForScope()) {
    if (!seen.has(orgId)) {
      seen.add(orgId);
      orgAttempts.push(orgId);
    }
  }
  orgAttempts.push(undefined);

  for (const tryOrgId of orgAttempts) {
    for (let retry = 0; retry < maxRetries; retry++) {
      const { status, group } = await fetchGroupMetadataOnce(groupId, tryOrgId);
      if (group) return group;
      if (retryStatuses.has(status) && retry < maxRetries - 1) {
        await sleep((options?.aggressive ? 700 : 400) * (retry + 1));
        continue;
      }
      break;
    }
  }

  return null;
}

/** Load metadata for many groups; retries failures sequentially with backoff. */
export type FetchAllGroupMetadataOptions = {
  concurrency?: number;
  preloaded?: ChettoGroup[];
  retryOnlyIds?: string[];
  onCheckpoint?: (state: {
    loaded: ChettoGroup[];
    failed: string[];
    phase: "initial" | "retry";
  }) => void;
  retryLogEvery?: number;
  retryDelayMs?: number;
};

export async function fetchAllGroupMetadata(
  groupIds: string[],
  options?: FetchAllGroupMetadataOptions,
): Promise<{ loaded: ChettoGroup[]; failed: string[] }> {
  const concurrency = options?.concurrency ?? 3;
  const retryLogEvery = options?.retryLogEvery ?? 10;
  const retryDelayMs = options?.retryDelayMs ?? 350;
  const byId = new Map<string, ChettoGroup>();
  for (const g of options?.preloaded ?? []) {
    byId.set(g.group_id, g);
  }

  const runInitialPass = !options?.retryOnlyIds?.length;
  const initialTargets = runInitialPass
    ? groupIds.filter((id) => !byId.has(id))
    : [];
  const failed: string[] = [];

  if (runInitialPass) {
    for (let i = 0; i < initialTargets.length; i += concurrency) {
      const chunk = initialTargets.slice(i, i + concurrency);
      const results = await Promise.all(
        chunk.map(async (id) => {
          try {
            const meta = await fetchGroupMetadata(id);
            return { id, meta };
          } catch {
            return { id, meta: null as ChettoGroup | null };
          }
        }),
      );
      for (const { id, meta } of results) {
        if (meta) byId.set(id, meta);
        else failed.push(id);
      }
      const done = Math.min(i + concurrency, initialTargets.length);
      if (done % 60 === 0 || done >= initialTargets.length) {
        console.log(
          `  … ${done} / ${initialTargets.length} initial (${byId.size} loaded total)`,
        );
      }
      options?.onCheckpoint?.({
        loaded: [...byId.values()],
        failed: groupIds.filter((id) => !byId.has(id)),
        phase: "initial",
      });
      if (i + concurrency < initialTargets.length) await sleep(120);
    }
  }

  const retryQueue = options?.retryOnlyIds?.length
    ? options.retryOnlyIds.filter((id) => !byId.has(id))
    : [...new Set(failed)];

  if (retryQueue.length > 0) {
    console.log(`  Retrying ${retryQueue.length} groups (aggressive pass)…`);
    const stillFailed: string[] = [];
    let retryIdx = 0;
    for (const id of retryQueue) {
      retryIdx += 1;
      try {
        await sleep(retryDelayMs);
        const meta = await fetchGroupMetadata(id, { aggressive: true });
        if (meta) byId.set(id, meta);
        else stillFailed.push(id);
      } catch {
        stillFailed.push(id);
      }
      if (retryIdx % retryLogEvery === 0 || retryIdx === retryQueue.length) {
        console.log(
          `  … retry ${retryIdx} / ${retryQueue.length} (${byId.size} loaded total)`,
        );
      }
      options?.onCheckpoint?.({
        loaded: [...byId.values()],
        failed: groupIds.filter((id) => !byId.has(id)),
        phase: "retry",
      });
    }
    return { loaded: [...byId.values()], failed: stillFailed };
  }

  const remainingFailed = groupIds.filter((id) => !byId.has(id));
  return { loaded: [...byId.values()], failed: remainingFailed };
}

async function findClientGroupByScan(
  clientPhone: string,
  queendom: string,
  clientName?: { firstName: string; lastName: string | null },
): Promise<ChettoGroup | null> {
  const ids = await listAllGroupIds({ queendom });
  if (!ids.length) return null;

  const phoneVariants = new Set(chettoPhoneLookupVariants(clientPhone));
  const nameKey = clientName
    ? clientNameMatchKey(clientName.firstName, clientName.lastName)
    : "";
  const chunkSize = 8;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((id) => fetchGroupMetadata(id)),
    );
    for (const group of results) {
      if (!group) continue;

      if (phoneVariants.size > 0 && group.access_members.length > 0) {
        for (const memberPhone of group.access_members) {
          for (const variant of chettoPhoneLookupVariants(memberPhone)) {
            if (phoneVariants.has(variant)) return group;
          }
        }
      }

      if (nameKey) {
        const groupKey = groupNameMatchKey(group.group_name);
        if (groupKey && groupKey === nameKey) return group;
      }
    }
  }
  return null;
}

export async function findClientGroup(
  clientPhone: string,
  queendom: string,
  clientName?: { firstName: string; lastName: string | null },
): Promise<ChettoGroup | null> {
  const hasPhone = clientPhone.trim().length > 0;
  const hasName = Boolean(
    clientName && clientNameMatchKey(clientName.firstName, clientName.lastName),
  );
  if (!hasPhone && !hasName) return null;
  try {
    return await unstable_cache(
      async () => findClientGroupByScan(clientPhone, queendom, clientName),
      [
        "chetto-find-client-group",
        chettoPhoneLookupVariants(clientPhone).join("|") || "no-phone",
        queendom,
        clientName
          ? clientNameMatchKey(clientName.firstName, clientName.lastName)
          : "no-name",
        getChettoOrgId() ?? "no-org",
        "v3-match",
      ],
      { revalidate: 600 },
    )();
  } catch {
    return null;
  }
}

export type ChettoTimelineResult = {
  messages: ChettoMessage[];
  nextCursor: string | null;
  /**
   * True when Chetto’s timeline route returns 404 / “No groups found”.
   * Group metadata may still exist (`GET /v1/groups/{id}`); chat history is simply not exposed here yet.
   */
  timelineNotAvailable?: boolean;
  /** Raw Chetto `detail` string when the timeline request fails or is empty for that reason. */
  chettoDetail?: string | null;
};

function pickTimelineString(...candidates: unknown[]): string | null {
  for (const v of candidates) {
    if (typeof v === "string") return v;
    if (typeof v === "number" && !Number.isNaN(v)) return String(v);
  }
  return null;
}

function pickTimelinePhone(o: Record<string, unknown>): string | null {
  const keys = [
    "phone_no",
    "phone",
    "phone_number",
    "from",
    "sender_phone",
    "senderPhone",
    "from_phone",
    "fromPhone",
  ] as const;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && /\d/.test(v)) return v;
  }
  const sender = o.sender;
  if (typeof sender === "string" && /^\+?\d[\d\s-]{8,}$/.test(sender.trim())) {
    return sender;
  }
  return null;
}

function mapTimelineMessage(raw: unknown): ChettoMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const text = pickTimelineString(
    o.text,
    o.message,
    o.body,
    o.content,
    o.msg,
    o.message_text,
    o.caption,
  );
  const phone_no = pickTimelinePhone(o);

  let from_me = false;
  if (o.from_me === true || o.from_me === "true" || o.from_me === 1)
    from_me = true;
  else if (o.is_agent === true || o.sender_type === "agent") from_me = true;

  let ts = pickTimelineString(
    o.timestamp,
    o.time,
    o.created_at,
    o.sent_at,
    o.date,
    o.iso_timestamp,
  );
  if (
    ts == null &&
    typeof o.created_at === "number" &&
    !Number.isNaN(o.created_at)
  ) {
    ts = String(o.created_at);
  }
  if (
    ts == null &&
    typeof o.timestamp === "number" &&
    !Number.isNaN(o.timestamp)
  ) {
    ts = String(o.timestamp);
  }

  const idRaw = o.id ?? o.message_id ?? o.msg_id;
  const id =
    typeof idRaw === "string" || idRaw === null
      ? (idRaw as string | null)
      : idRaw != null
        ? String(idRaw)
        : null;

  const sender_name =
    typeof o.name === "string" && o.name.trim()
      ? o.name.trim()
      : typeof o.sender_name === "string" && o.sender_name.trim()
        ? o.sender_name.trim()
        : null;

  return {
    id,
    text,
    phone_no,
    sender_name,
    from_me,
    timestamp: ts,
  };
}

/** Normalize varied Chetto timeline JSON into a message array. */
function extractTimelinePayload(json: Record<string, unknown>): unknown[] {
  const result = json.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.data)) return r.data;
    if (Array.isArray(r.messages)) return r.messages;
  }
  const d = json.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    const inner = d as Record<string, unknown>;
    if (Array.isArray(inner.messages)) return inner.messages;
    if (Array.isArray(inner.data)) return inner.data;
    if (Array.isArray(inner.timeline)) return inner.timeline;
    if (Array.isArray(inner.items)) return inner.items;
  }
  if (Array.isArray(json.messages)) return json.messages;
  if (Array.isArray(json.timeline)) return json.timeline;
  if (Array.isArray(json.items)) return json.items;
  return [];
}

function extractTimelineCursor(json: Record<string, unknown>): string | null {
  const candidates = [
    json.offset_id,
    json.next_offset_id,
    json.cursor,
    json.next_cursor,
    json.offset,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  if (json.data && typeof json.data === "object") {
    const inner = json.data as Record<string, unknown>;
    const nested = inner.offset_id ?? inner.next_offset_id ?? inner.cursor;
    if (typeof nested === "string" && nested.length > 0) return nested;
  }
  return null;
}

function extractHttpDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first === "object" && "msg" in first) {
      const m = (first as { msg: unknown }).msg;
      if (typeof m === "string") return m;
    }
  }
  return null;
}

export async function getGroupTimeline(
  groupId: string,
  limit = 50,
  offsetId?: string,
  options?: { queendom?: string },
): Promise<ChettoTimelineResult> {
  try {
    const orgAttempts: (string | undefined)[] = [];
    const seen = new Set<string>();
    for (const orgId of await resolveOrgIdsForScope(options?.queendom)) {
      if (!seen.has(orgId)) {
        seen.add(orgId);
        orgAttempts.push(orgId);
      }
    }
    orgAttempts.push(undefined);

    for (const tryOrgId of orgAttempts) {
      const q = new URLSearchParams();
      q.set("limit", String(limit));
      if (offsetId) q.set("offset_id", offsetId);
      if (tryOrgId) q.set("org_id", tryOrgId);

      const res = await chettoFetch(
        `/v1/groups/${encodeURIComponent(groupId)}/timeline?${q.toString()}`,
      );
      const rawJson: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const rec =
          rawJson && typeof rawJson === "object"
            ? (rawJson as Record<string, unknown>)
            : null;
        const detailStr = rec ? extractHttpDetail(rec.detail) : null;
        const timelineNotAvailable =
          res.status === 404 || detailStr === "No groups found";
        if (tryOrgId !== orgAttempts[orgAttempts.length - 1]) continue;
        return {
          messages: [],
          nextCursor: null,
          timelineNotAvailable,
          chettoDetail: detailStr,
        };
      }

      if (Array.isArray(rawJson)) {
        const messages: ChettoMessage[] = [];
        for (const row of rawJson) {
          const m = mapTimelineMessage(row);
          if (m) messages.push(m);
        }
        return { messages, nextCursor: null };
      }

      if (!rawJson || typeof rawJson !== "object") {
        continue;
      }
      const json = rawJson as Record<string, unknown>;
      if ("detail" in json && json.detail === "No groups found") {
        if (tryOrgId !== orgAttempts[orgAttempts.length - 1]) continue;
        return {
          messages: [],
          nextCursor: null,
          timelineNotAvailable: true,
          chettoDetail: "No groups found",
        };
      }
      const rows = extractTimelinePayload(json);
      const messages: ChettoMessage[] = [];
      for (const row of rows) {
        const m = mapTimelineMessage(row);
        if (m) messages.push(m);
      }
      const nextCursor = extractTimelineCursor(json);
      if (messages.length > 0 || nextCursor) {
        return { messages, nextCursor };
      }
    }

    return { messages: [], nextCursor: null };
  } catch {
    return { messages: [], nextCursor: null };
  }
}

function extractTextFromInsightsPayload(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") return raw.trim() || null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const candidates = [
    "text",
    "message",
    "answer",
    "response",
    "content",
    "output",
    "reply",
  ];
  for (const k of candidates) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const data = o.data;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    for (const k of candidates) {
      const v = d[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

/** Parse Chetto insights NDJSON stream (`message` / `done` / `error` lines per OpenAPI) or single JSON body. */
export function parseInsightsResponseBody(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length > 1 || (lines.length === 1 && lines[0]?.includes('"type"'))) {
    let accumulated = "";
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const type = obj.type;
        if (
          (type === "token" || type === "message") &&
          obj.data &&
          typeof obj.data === "object"
        ) {
          const d = obj.data as Record<string, unknown>;
          if (typeof d.text === "string") accumulated += d.text;
          if (typeof d.content === "string") accumulated += d.content;
          if (typeof d.message === "string") accumulated += d.message;
        }
        if (type === "done" && obj.data && typeof obj.data === "object") {
          const d = obj.data as Record<string, unknown>;
          if (typeof d.reply === "string" && d.reply.trim()) {
            return d.reply.trim();
          }
        }
        if (type === "error" && obj.data && typeof obj.data === "object") {
          const d = obj.data as Record<string, unknown>;
          if (typeof d.detail === "string" && d.detail.trim()) {
            return null;
          }
        }
      } catch {
        /* skip malformed NDJSON line */
      }
    }
    if (accumulated.trim()) return accumulated.trim();
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return extractTextFromInsightsPayload(parsed);
  } catch {
    return trimmed;
  }
}

export type ChettoMessageSearchHit = {
  group_id: string;
  group_name: string | null;
  snippet: string | null;
  phone_no: string | null;
};

function normalizeMessageSearchHits(json: unknown): ChettoMessageSearchHit[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const arrays: unknown[][] = [];
  for (const key of ["results", "messages", "data", "items", "hits"] as const) {
    const v = root[key];
    if (Array.isArray(v)) arrays.push(v);
  }
  if (arrays.length === 0 && Array.isArray(json)) arrays.push(json);

  const out: ChettoMessageSearchHit[] = [];
  for (const arr of arrays) {
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const group_id =
        typeof o.group_id === "string"
          ? o.group_id
          : typeof o.groupId === "string"
            ? o.groupId
            : null;
      if (!group_id || !/^120363/.test(group_id)) continue;
      const group_name =
        typeof o.group_name === "string"
          ? o.group_name
          : typeof o.groupName === "string"
            ? o.groupName
            : null;
      const snippet =
        typeof o.snippet === "string"
          ? o.snippet
          : typeof o.text === "string"
            ? o.text
            : typeof o.message === "string"
              ? o.message
              : null;
      const phone_no =
        typeof o.phone_no === "string"
          ? o.phone_no
          : typeof o.phone === "string"
            ? o.phone
            : null;
      out.push({ group_id, group_name, snippet, phone_no });
    }
  }
  return out;
}

/** Org-scoped message search (tries undocumented REST paths; no-op if unavailable). */
export async function searchChettoMessagesOrg(
  orgId: string,
  query: string,
  topN = 20,
): Promise<ChettoMessageSearchHit[]> {
  const attempts: { method: "GET" | "POST"; path: string; body?: string }[] = [
    {
      method: "POST",
      path: `/v1/messages/search?${new URLSearchParams({ org_id: orgId }).toString()}`,
      body: JSON.stringify({ query, top_n: topN }),
    },
    {
      method: "POST",
      path: `/v1/search/messages?${new URLSearchParams({ org_id: orgId }).toString()}`,
      body: JSON.stringify({ query, top_n: topN }),
    },
    {
      method: "GET",
      path: `/v1/messages/search?${new URLSearchParams({
        org_id: orgId,
        query,
        top_n: String(topN),
      }).toString()}`,
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await chettoFetch(attempt.path, {
        method: attempt.method,
        body: attempt.body,
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as unknown;
      const hits = normalizeMessageSearchHits(json);
      if (hits.length > 0) return hits;
    } catch {
      /* try next path */
    }
  }
  return [];
}

export async function askChettoOrgInsights(
  question: string,
  options: { orgId?: string; groupIds?: string[]; queendom?: string } = {},
): Promise<{ text: string } | { error: string }> {
  try {
    const parentOrgId = options.orgId?.trim() || getChettoOrgId();
    const subOrgMap = await getQueendomSubOrgMap();
    const subOrgId = options.queendom
      ? resolveSubOrgIdForQueendom(options.queendom, subOrgMap)
      : undefined;
    const subOrgIds = subOrgId ? [subOrgId] : undefined;

    const body = {
      new_message: question,
      chat_id: `atlas-org-${Date.now()}`,
      group_ids: options.groupIds ?? [],
    };
    const orgQs = buildInsightsOrgQuery(parentOrgId, subOrgIds);
    const res = await chettoFetch(`/v1/insights/chat${orgQs}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const rawText = await res.text().catch(() => "");
    if (!res.ok) {
      return { error: rawText || `Chetto insights failed (${res.status})` };
    }
    const text = parseInsightsResponseBody(rawText);
    if (text) return { text };
    return { error: "Could not parse Chetto insights response" };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Chetto org insights request failed";
    return { error: msg };
  }
}

export async function askChettoInsights(
  groupId: string,
  question: string,
  options?: { queendom?: string },
): Promise<{ text: string } | { error: string }> {
  try {
    const parentOrgId = getChettoOrgId();
    const subOrgMap = await getQueendomSubOrgMap();
    const subOrgId = options?.queendom
      ? resolveSubOrgIdForQueendom(options.queendom, subOrgMap)
      : undefined;
    const subOrgIds = subOrgId ? [subOrgId] : undefined;

    const body = {
      new_message: question,
      chat_id: groupId,
      group_ids: [groupId],
    };
    const orgQs = buildInsightsOrgQuery(parentOrgId, subOrgIds);
    const res = await chettoFetch(`/v1/insights/chat${orgQs}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const rawText = await res.text().catch(() => "");
    if (!res.ok) {
      return { error: rawText || `Chetto insights failed (${res.status})` };
    }
    const text = parseInsightsResponseBody(rawText);
    if (text) return { text };
    return { error: "Could not parse Chetto insights response" };
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Chetto insights request failed";
    return { error: msg };
  }
}

function mapEscalationJson(raw: unknown): ChettoEscalation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const group_id = typeof o.group_id === "string" ? o.group_id : null;
  const label = typeof o.label === "string" ? o.label : null;
  if (!id || !group_id || !label) return null;
  return {
    id,
    group_id,
    group_name:
      typeof o.group_name === "string" || o.group_name === null
        ? (o.group_name as string | null)
        : null,
    label,
    title:
      typeof o.title === "string" || o.title === null
        ? (o.title as string | null)
        : null,
    description:
      typeof o.description === "string" || o.description === null
        ? (o.description as string | null)
        : null,
    status:
      typeof o.status === "string" || o.status === null
        ? (o.status as string | null)
        : null,
    signals: Array.isArray(o.signals)
      ? o.signals.filter((x): x is string => typeof x === "string")
      : null,
  };
}

export type ListEscalationsOptions = {
  groupIds?: string[];
  orgId?: string;
  queendom?: string;
  label?: string;
  status?: string;
  limit?: number;
  offsetId?: string;
  includeSummary?: boolean;
};

/** `GET /v1/escalations` — escalation projections for groups/orgs. */
export async function listEscalations(
  options: ListEscalationsOptions = {},
): Promise<{ escalations: ChettoEscalation[]; nextOffsetId: string | null }> {
  try {
    const subOrgMap = await getQueendomSubOrgMap();
    const parentOrgId = options.orgId?.trim() || getChettoOrgId();
    const subOrgId = options.queendom
      ? resolveSubOrgIdForQueendom(options.queendom, subOrgMap)
      : undefined;

    const q = new URLSearchParams();
    if (parentOrgId) q.set("org_id", parentOrgId);
    if (subOrgId) q.append("sub_org_ids", subOrgId);
    for (const gid of options.groupIds ?? []) {
      q.append("group_ids", gid);
    }
    if (options.label) q.set("label", options.label);
    if (options.status) q.set("status", options.status);
    if (options.offsetId) q.set("offset_id", options.offsetId);
    if (options.includeSummary) q.set("include_summary", "true");
    q.set("limit", String(Math.min(options.limit ?? 50, 1000)));

    const res = await chettoFetch(`/v1/escalations?${q.toString()}`);
    if (!res.ok) return { escalations: [], nextOffsetId: null };

    const json = (await res.json().catch(() => null)) as unknown;
    if (!json || typeof json !== "object") {
      return { escalations: [], nextOffsetId: null };
    }
    const root = json as Record<string, unknown>;
    const rows = Array.isArray(root.data) ? root.data : [];
    const escalations = rows
      .map(mapEscalationJson)
      .filter((x): x is ChettoEscalation => x !== null);
    const nextOffsetId =
      typeof root.next_offset_id === "string" && root.next_offset_id.length > 0
        ? root.next_offset_id
        : null;
    return { escalations, nextOffsetId };
  } catch {
    return { escalations: [], nextOffsetId: null };
  }
}
