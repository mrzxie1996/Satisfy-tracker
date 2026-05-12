import { getRedis, kvEnvReady } from "../_lib/redis.js";
import { refreshEndCatalog } from "../_lib/end-catalog.js";

/**
 * Vercel Cron：定时拉取 END 品牌页，写入 KV，供 GET /api/end-snapshot 给所有访客使用。
 *
 * 建议在项目环境变量中设置 CRON_SECRET；设置后仅允许
 * Authorization: Bearer <CRON_SECRET>（Vercel Cron 会自动带上）。
 */
export default async function handler(req: any, res: any) {
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
    const redis = getRedis();
    const out = await refreshEndCatalog(redis);
    return res.status(200).json({ ok: true, ...out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("refresh-end:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
