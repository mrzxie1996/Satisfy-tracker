/**
 * GET /api/cron/refresh-end — 拉取 END 品牌页写入 KV（逻辑内联，避免 Vercel 无法解析 api/_lib）
 */
import { Redis } from "@upstash/redis";

const END_BRAND_HK = "https://www.endclothing.com/hk/brands/satisfy";
const END_CATALOG_REDIS_KEY = "end:catalog:v1";

function kvEnvReady() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function isSchemaItemList(t) {
  return typeof t === "string" && t.toLowerCase() === "itemlist";
}

function extractItemListElement(data) {
  if (!data) return null;
  if (isSchemaItemList(data["@type"]) && Array.isArray(data.itemListElement)) {
    return data.itemListElement;
  }
  const graph = data["@graph"];
  if (Array.isArray(graph)) {
    for (const g of graph) {
      if (g && typeof g === "object" && isSchemaItemList(g["@type"])) {
        const el = g.itemListElement;
        if (Array.isArray(el)) return el;
      }
    }
  }
  return null;
}

function tryParseItemListFromJsonText(txt) {
  if (!txt || !/itemlist/i.test(txt)) return null;
  try {
    const data = JSON.parse(txt.trim());
    return extractItemListElement(data);
  } catch {
    return null;
  }
}

function tryScriptsTextArray(chunks) {
  for (const c of chunks) {
    const list = tryParseItemListFromJsonText(c);
    if (list && list.length) return list;
  }
  return null;
}

function normalizeEndEntry(entry) {
  let p = entry;
  if (p && p["@type"] === "ListItem" && p.item) p = p.item;
  if (!p || p["@type"] !== "Product" || typeof p.url !== "string" || typeof p.name !== "string") {
    return null;
  }
  const off = p.offers || {};
  const price = off.price != null ? off.price : off.lowPrice;
  const cur = off.priceCurrency || off.pricecurrency;
  if (price == null || price === "") return null;
  let img = p.image;
  if (Array.isArray(img)) img = img[0];
  if (typeof img !== "string") img = null;
  if (img && typeof img === "string" && img.indexOf("productno_selection") !== -1) img = null;
  const n = typeof price === "string" ? parseFloat(price) : price;
  if (Number.isNaN(n)) return null;
  return {
    url: p.url,
    name: String(p.name),
    image: img,
    price: n,
    currency: cur || "HKD",
  };
}

function extractLdJsonScriptContents(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

function parseEndBrandHtml(html) {
  const texts = extractLdJsonScriptContents(html);
  const rawList = tryScriptsTextArray(texts);
  if (!rawList || !rawList.length) {
    throw new Error("未找到 ItemList JSON-LD（END 可能改版或 HTML 不完整）");
  }
  return rawList.map(normalizeEndEntry).filter(Boolean);
}

async function fetchEndBrandHtml() {
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

async function refreshEndCatalog(redis) {
  const html = await fetchEndBrandHtml();
  const items = parseEndBrandHtml(html);
  const payload = {
    fetchedAt: new Date().toISOString(),
    items,
  };
  await redis.set(END_CATALOG_REDIS_KEY, JSON.stringify(payload));
  return { count: items.length, fetchedAt: payload.fetchedAt };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = typeof req.headers?.authorization === "string" ? req.headers.authorization : "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
  }

  if (!kvEnvReady()) {
    return res.status(503).json({
      ok: false,
      error: "KV_REST_API_URL / KV_REST_API_TOKEN 未配置，无法写入 END 快照",
    });
  }

  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    const out = await refreshEndCatalog(redis);
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("refresh-end:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
