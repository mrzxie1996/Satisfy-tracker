import { getRedis, kvEnvReady } from "./_lib/redis.js";
import { readEndCatalog } from "./_lib/end-catalog.js";

/**
 * GET /api/end-snapshot
 * 返回 KV 中最近一次 Cron 写入的 END 目录（JSON），供前端多用户共享，无需各自粘贴源码。
 */
export default async function handler(req: any, res: any) {
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
    const data = await readEndCatalog(getRedis());
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg, items: [] });
  }
}
