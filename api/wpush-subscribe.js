/**
 * POST /api/wpush-subscribe — 保存 Web Push 订阅到 Upstash（Redis），逻辑内联，不依赖 api/_lib TS 打包链
 */
import { Redis } from "@upstash/redis";

const SUBS_KEY = "satisfy-tracker:push-subs";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      return res.status(503).json({
        ok: false,
        error: "KV 未配置（需 KV_REST_API_URL + KV_REST_API_TOKEN）",
      });
    }

    const redis = new Redis({ url, token });

    let body;
    try {
      const raw = req.body;
      body = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
    } catch {
      return res.status(400).json({ ok: false, error: "invalid json" });
    }

    if (!body?.endpoint || !body.keys?.auth || !body.keys?.p256dh) {
      return res.status(400).json({ ok: false, error: "invalid subscription" });
    }

    let subs = [];
    const existing = await redis.get(SUBS_KEY);
    if (existing != null && existing !== "") {
      try {
        const text = typeof existing === "string" ? existing : JSON.stringify(existing);
        const parsed = JSON.parse(text);
        subs = Array.isArray(parsed) ? parsed : [];
      } catch {
        subs = [];
      }
    }

    const rest = subs.filter((s) => s.endpoint !== body.endpoint);
    rest.push(body);
    await redis.set(SUBS_KEY, JSON.stringify(rest));

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[wpush-subscribe]", e);
    const msg = e && e.message ? e.message : String(e);
    return res.status(502).json({ ok: false, error: msg });
  }
}
