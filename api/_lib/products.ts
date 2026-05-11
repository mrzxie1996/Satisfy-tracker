/**
 * Server-side fetch of current product ids (official / Slam Jam / Haven HK context).
 * Mirrors satisfy-tracker.html logic without browser proxies.
 */

const OFFICIAL = "https://satisfyrunning.com";
const SLAMJAM_COLLECTION = "https://slamjam.com/en-hk/collections/satisfy";
const HAVEN_PREFIX = "https://havensurf.com";
const HAVEN_TOKEN_FALLBACK = "b5053c919908d5cb6b214d979eb71357";

const HAVEN_GQL =
  'query HavenSatisfy @inContext(country: HK) {\n' +
  '  collection(handle: "satisfy") {\n' +
  "    products(first: 250) {\n" +
  "      nodes {\n" +
  "        id\n" +
  "        title\n" +
  "        variants(first: 100) {\n" +
  "          nodes {\n" +
  "            id\n" +
  "          }\n" +
  "        }\n" +
  "      }\n" +
  "    }\n" +
  "  }\n" +
  "}";

export type SourceSnapshot = {
  ids: number[];
  titlesById: Record<string, string>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchOfficialSnapshot(): Promise<SourceSnapshot> {
  const base = OFFICIAL.replace(/\/$/, "");
  const titlesById: Record<string, string> = {};
  const ids: number[] = [];
  let page = 1;
  const limit = 250;
  for (;;) {
    const url = `${base}/products.json?limit=${limit}&page=${page}&currency=HKD`;
    const data = await fetchJson<{ products: { id: number; title: string }[] }>(url);
    const batch = data.products ?? [];
    for (const p of batch) {
      ids.push(p.id);
      titlesById[String(p.id)] = p.title;
    }
    if (batch.length < limit) break;
    page += 1;
    if (page > 50) break;
  }
  return { ids, titlesById };
}

export async function fetchSlamJamSnapshot(): Promise<SourceSnapshot> {
  const base = SLAMJAM_COLLECTION.replace(/\/$/, "");
  const titlesById: Record<string, string> = {};
  const ids: number[] = [];
  let page = 1;
  const limit = 250;
  for (;;) {
    const url = `${base}/products.json?limit=${limit}&page=${page}`;
    const data = await fetchJson<{ products: { id: number; title: string }[] }>(url);
    const batch = data.products ?? [];
    for (const p of batch) {
      ids.push(p.id);
      titlesById[String(p.id)] = p.title;
    }
    if (batch.length < limit) break;
    page += 1;
    if (page > 50) break;
  }
  return { ids, titlesById };
}

function legacyProductIdFromGid(gid: string): number {
  const m = /Product\/(\d+)/.exec(gid || "");
  return m ? parseInt(m[1], 10) : 0;
}

export async function fetchHavenSnapshot(token: string): Promise<SourceSnapshot> {
  const url = `${HAVEN_PREFIX}/api/2024-10/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token || HAVEN_TOKEN_FALLBACK,
    },
    body: JSON.stringify({ query: HAVEN_GQL }),
  });
  if (!res.ok) throw new Error(`Haven GraphQL HTTP ${res.status}`);
  const j = (await res.json()) as {
    errors?: { message: string }[];
    data?: {
      collection?: {
        products?: {
          nodes?: { id: string; title: string }[];
        };
      };
    };
  };
  if (j.errors?.length) {
    throw new Error(j.errors.map((e) => e.message).join("; "));
  }
  const nodes = j.data?.collection?.products?.nodes ?? [];
  const titlesById: Record<string, string> = {};
  const ids: number[] = [];
  for (const node of nodes) {
    const pid = legacyProductIdFromGid(node.id);
    if (!pid) continue;
    ids.push(pid);
    titlesById[String(pid)] = node.title || "";
  }
  return { ids, titlesById };
}

export type CombinedSnapshot = {
  official: SourceSnapshot;
  slamjam: SourceSnapshot;
  havensurf: SourceSnapshot;
};

export async function fetchAllSnapshots(): Promise<CombinedSnapshot> {
  const havenToken = process.env.HAVEN_STOREFRONT_TOKEN || HAVEN_TOKEN_FALLBACK;
  const [official, slamjam, havensurf] = await Promise.all([
    fetchOfficialSnapshot(),
    fetchSlamJamSnapshot(),
    fetchHavenSnapshot(havenToken),
  ]);
  return { official, slamjam, havensurf };
}
