/**
 * GET /api/end-snapshot — 读取 KV 中的 END 目录快照（逻辑内联）
 */
import { Redis } from "@upstash/redis";

const END_CATALOG_REDIS_KEY = "end:catalog:v1";

function kvEnvReady() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readEndCatalog(redis) {
  const raw = await redis.get(END_CATALOG_REDIS_KEY);
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.items) || !j.fetchedAt) return null;
    return j;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  if (!kvEnvReady()) {
    return res.status(503).json({
      ok: false,
      error: "KV 未配置，服务端未提供 END 快照",
      items: [],
    });
  }

  try {
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    const data = await readEndCatalog(redis);
    if (!data || !data.items.length) {
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(404).json({
        ok: false,
        error: "暂无快照，请等待 /api/cron/refresh-end 首次成功执行或检查服务端能否访问 END",
        items: [],
        fetchedAt: data?.fetchedAt ?? null,
      });
    }
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      ok: true,
      fetchedAt: data.fetchedAt,
      items: data.items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg, items: [] });
  }
}
