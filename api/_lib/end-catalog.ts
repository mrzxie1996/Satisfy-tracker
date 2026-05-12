/**
 * 服务端拉取 END HK 品牌页并解析 JSON-LD ItemList，供多用户共享快照（KV）。
 * 逻辑与 satisfy-tracker.html 中 parseEndBrandHtml / normalizeEndEntry 对齐（无 Algolia 修图）。
 */

import type { Redis } from "@upstash/redis";

export const END_BRAND_HK = "https://www.endclothing.com/hk/brands/satisfy";
export const END_CATALOG_REDIS_KEY = "end:catalog:v1";

export type EndCatalogItem = {
  url: string;
  name: string;
  image: string | null;
  price: number;
  currency: string;
};

export type EndCatalogPayload = {
  fetchedAt: string;
  items: EndCatalogItem[];
};

function isSchemaItemList(t: unknown): boolean {
  return typeof t === "string" && (t as string).toLowerCase() === "itemlist";
}

function extractItemListElement(data: Record<string, unknown> | null): unknown[] | null {
  if (!data) return null;
  if (isSchemaItemList(data["@type"]) && Array.isArray(data.itemListElement)) {
    return data.itemListElement as unknown[];
  }
  const graph = data["@graph"];
  if (Array.isArray(graph)) {
    for (const g of graph) {
      if (g && typeof g === "object" && isSchemaItemList((g as Record<string, unknown>)["@type"])) {
        const el = (g as Record<string, unknown>).itemListElement;
        if (Array.isArray(el)) return el as unknown[];
      }
    }
  }
  return null;
}

function tryParseItemListFromJsonText(txt: string): unknown[] | null {
  if (!txt || !/itemlist/i.test(txt)) return null;
  try {
    const data = JSON.parse(txt.trim()) as Record<string, unknown>;
    return extractItemListElement(data);
  } catch {
    return null;
  }
}

function tryScriptsTextArray(chunks: string[]): unknown[] | null {
  for (const c of chunks) {
    const list = tryParseItemListFromJsonText(c);
    if (list && list.length) return list;
  }
  return null;
}

function normalizeEndEntry(entry: unknown): EndCatalogItem | null {
  let p = entry as Record<string, unknown> | null;
  if (p && p["@type"] === "ListItem" && p.item) p = p.item as Record<string, unknown>;
  if (!p || p["@type"] !== "Product" || typeof p.url !== "string" || typeof p.name !== "string") {
    return null;
  }
  const off = (p.offers || {}) as Record<string, unknown>;
  const price = off.price != null ? off.price : off.lowPrice;
  const cur = (off.priceCurrency || off.pricecurrency) as string | undefined;
  if (price == null || price === "") return null;
  let img: unknown = p.image;
  if (Array.isArray(img)) img = img[0];
  if (typeof img !== "string") img = null;
  if (img && typeof img === "string" && img.indexOf("productno_selection") !== -1) img = null;
  const n = typeof price === "string" ? parseFloat(price) : (price as number);
  if (Number.isNaN(n)) return null;
  return {
    url: p.url,
    name: String(p.name),
    image: img as string | null,
    price: n,
    currency: cur || "HKD",
  };
}

function extractLdJsonScriptContents(html: string): string[] {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

export function parseEndBrandHtml(html: string): EndCatalogItem[] {
  const texts = extractLdJsonScriptContents(html);
  const rawList = tryScriptsTextArray(texts);
  if (!rawList || !rawList.length) {
    throw new Error("未找到 ItemList JSON-LD（END 可能改版或 HTML 不完整）");
  }
  return rawList.map(normalizeEndEntry).filter(Boolean) as EndCatalogItem[];
}

export async function fetchEndBrandHtml(): Promise<string> {
  const res = await fetch(END_BRAND_HK, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-HK,en;q=0.9,zh-HK;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`END 品牌页 HTTP ${res.status}`);
  return res.text();
}

export async function refreshEndCatalog(redis: Redis): Promise<{ count: number; fetchedAt: string }> {
  const html = await fetchEndBrandHtml();
  const items = parseEndBrandHtml(html);
  const payload: EndCatalogPayload = {
    fetchedAt: new Date().toISOString(),
    items,
  };
  await redis.set(END_CATALOG_REDIS_KEY, JSON.stringify(payload));
  return { count: items.length, fetchedAt: payload.fetchedAt };
}

export async function readEndCatalog(redis: Redis): Promise<EndCatalogPayload | null> {
  const raw = await redis.get(END_CATALOG_REDIS_KEY);
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const j = JSON.parse(raw) as EndCatalogPayload;
    if (!j || !Array.isArray(j.items) || !j.fetchedAt) return null;
    return j;
  } catch {
    return null;
  }
}
