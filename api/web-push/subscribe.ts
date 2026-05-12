import { addSubscription, kvReady, type StoredPushSubscription } from "../_lib/push-store";

/**
 * Node-style handler — matches api/push.js and api/cron/check-new.ts so Vercel
 * reliably parses JSON body and returns JSON (Web Request POST can 500 here).
 */
export default async function handler(req: { method?: string; body?: unknown }, res: any): Promise<void> {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  try {
    if (!kvReady()) {
      res.status(503).json({ ok: false, error: "KV 未配置（需 KV_REST_API_URL + KV_REST_API_TOKEN）" });
      return;
    }

    let body: StoredPushSubscription;
    try {
      const raw = req.body;
      if (typeof raw === "string") {
        body = JSON.parse(raw || "{}") as StoredPushSubscription;
      } else {
        body = (raw || {}) as StoredPushSubscription;
      }
    } catch {
      res.status(400).json({ ok: false, error: "invalid json" });
      return;
    }

    if (!body?.endpoint || !body.keys?.auth || !body.keys?.p256dh) {
      res.status(400).json({ ok: false, error: "invalid subscription" });
      return;
    }

    await addSubscription(body);
    res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[web-push/subscribe]", e);
    res.status(502).json({ ok: false, error: msg });
  }
}
