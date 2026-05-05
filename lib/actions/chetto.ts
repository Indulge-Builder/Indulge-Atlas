/** Server-only Chetto integration (called from Route Handlers). Not a Client Component server-action module — Next.js requires `"use server"` files to export only async functions. */

import { unstable_cache } from "next/cache";

const CHETTO_BASE = "https://apiv2.chetto.ai/joule";

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
  "120363423907397699"
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
  "120363387303304649"
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

async function chettoFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const key = getChettoApiKey();
  const headers = new Headers(init.headers);
  headers.set("x-api-key", key);
  if (!headers.has("Content-Type") && init.method && init.method !== "GET" && init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${CHETTO_BASE}${path}`, { ...init, headers });
}

function mapGroupJson(raw: unknown): ChettoGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const group_id = o.group_id;
  if (typeof group_id !== "string" || !group_id) return null;
  const access = o.access_members;
  const access_members = Array.isArray(access)
    ? access.filter((x): x is string => typeof x === "string")
    : [];
  return {
    group_id,
    group_name: typeof o.group_name === "string" || o.group_name === null ? (o.group_name as string | null) : null,
    valid: typeof o.valid === "boolean" || o.valid === null ? (o.valid as boolean | null) : null,
    created_at_utc: typeof o.created_at_utc === "number" ? o.created_at_utc : null,
    updated_at_utc: typeof o.updated_at_utc === "number" ? o.updated_at_utc : null,
    created_at: typeof o.created_at === "string" || o.created_at === null ? (o.created_at as string | null) : null,
    access_members,
  };
}

export async function fetchGroupMetadata(groupId: string): Promise<ChettoGroup | null> {
  const res = await chettoFetch(`/v1/groups/${encodeURIComponent(groupId)}`);
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as unknown;
  return mapGroupJson(json);
}

function normalizePhoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Chetto indexes `access_members` as digit-only strings (e.g. `919818799928`).
 * Atlas often stores Indian mobiles as 10 digits (`9818799928`) without `+91`.
 * Try equivalent keys so lookup succeeds either way.
 */
function chettoLookupKeyVariants(normalizedDigits: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (k: string) => {
    if (k.length === 0 || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };

  push(normalizedDigits);

  // India mobile national form (10 digits, typical mobile leading digit 6–9)
  if (/^[6-9]\d{9}$/.test(normalizedDigits)) {
    push(`91${normalizedDigits}`);
  }

  // Full India country code without +: 91 + 10 digits → also match national 10-digit stored form
  if (/^91[6-9]\d{9}$/.test(normalizedDigits)) {
    push(normalizedDigits.slice(2));
  }

  // Legacy trunk 0 prefix (e.g. 09818799928)
  if (/^0[6-9]\d{9}$/.test(normalizedDigits)) {
    const national = normalizedDigits.slice(1);
    push(national);
    push(`91${national}`);
  }

  return out;
}

/**
 * Find the concierge group for this client by scanning group metadata in chunks.
 * Stops at the first group whose `access_members` includes a matching phone variant
 * (avoids building a full phone→group index: previously 180+ API calls before any response).
 */
async function findClientGroupByScan(
  clientPhone: string,
  queendom: string,
): Promise<ChettoGroup | null> {
  const normalized = normalizePhoneKey(clientPhone);
  if (!normalized) return null;
  const ids = QUEENDOM_GROUP_IDS[queendom];
  if (!ids?.length) return null;

  const variantSet = new Set(chettoLookupKeyVariants(normalized));
  const chunkSize = 10;

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map((id) => fetchGroupMetadata(id)));
    for (const group of results) {
      if (!group?.access_members?.length) continue;
      for (const raw of group.access_members) {
        const k = normalizePhoneKey(raw);
        if (k && variantSet.has(k)) return group;
      }
    }
  }
  return null;
}

export async function findClientGroup(
  clientPhone: string,
  queendom: string,
): Promise<ChettoGroup | null> {
  const normalized = normalizePhoneKey(clientPhone);
  if (!normalized) return null;
  try {
    return await unstable_cache(
      async () => findClientGroupByScan(clientPhone, queendom),
      ["chetto-find-client-group", normalized, queendom],
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
  const keys = ["phone_no", "phone", "phone_number", "from", "sender_phone"] as const;
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
  );
  const phone_no = pickTimelinePhone(o);

  let from_me = false;
  if (o.from_me === true || o.from_me === "true" || o.from_me === 1) from_me = true;
  else if (o.is_agent === true || o.sender_type === "agent") from_me = true;

  let ts = pickTimelineString(
    o.timestamp,
    o.time,
    o.created_at,
    o.sent_at,
    o.date,
    o.iso_timestamp,
  );
  if (ts == null && typeof o.timestamp === "number" && !Number.isNaN(o.timestamp)) {
    ts = String(o.timestamp);
  }

  const idRaw = o.id ?? o.message_id ?? o.msg_id;
  const id =
    typeof idRaw === "string" || idRaw === null
      ? (idRaw as string | null)
      : idRaw != null
        ? String(idRaw)
        : null;

  return {
    id,
    text,
    phone_no,
    from_me,
    timestamp: ts,
  };
}

/** Normalize varied Chetto timeline JSON into a message array. */
function extractTimelinePayload(json: Record<string, unknown>): unknown[] {
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

export async function getGroupTimeline(
  groupId: string,
  limit = 50,
  offsetId?: string,
): Promise<ChettoTimelineResult> {
  try {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  if (offsetId) q.set("offset_id", offsetId);
  const res = await chettoFetch(
    `/v1/groups/${encodeURIComponent(groupId)}/timeline?${q.toString()}`,
  );
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;

  if (!res.ok) {
    const detail = json && typeof json.detail === "string" ? json.detail : null;
    const timelineNotAvailable =
      res.status === 404 || detail === "No groups found";
    return {
      messages: [],
      nextCursor: null,
      timelineNotAvailable,
      chettoDetail: detail,
    };
  }

  if (!json || typeof json !== "object") {
    return { messages: [], nextCursor: null };
  }
  if ("detail" in json && json.detail === "No groups found") {
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
  return { messages, nextCursor };
  } catch {
    return { messages: [], nextCursor: null };
  }
}

function extractTextFromInsightsPayload(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") return raw.trim() || null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const candidates = ["text", "message", "answer", "response", "content", "output"];
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

export async function askChettoInsights(
  groupId: string,
  question: string,
): Promise<{ text: string } | { error: string }> {
  try {
  const body = {
    new_message: question,
    chat_id: groupId,
    group_ids: [groupId],
  };
  const res = await chettoFetch("/v1/insights/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const rawText = await res.text().catch(() => "");
  if (!res.ok) {
    return { error: rawText || `Chetto insights failed (${res.status})` };
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    const t = rawText.trim();
    if (t) return { text: t };
    return { error: "Empty response from Chetto" };
  }
  const text = extractTextFromInsightsPayload(parsed);
  if (text) return { text };
  return { error: "Could not parse Chetto insights response" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chetto insights request failed";
    return { error: msg };
  }
}
